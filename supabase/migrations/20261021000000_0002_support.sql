-- =====================================================================
-- 0002_support.sql
-- FidelityCard - soporte para Edge Function enroll-customer y panel del comercio.
-- La migracion 0001 ya esta ejecutada en el proyecto real: NO se edita.
-- Esta migracion es ADITIVA e IDEMPOTENTE (se puede ejecutar mas de una vez).
--
-- Contenido:
--   1. rate_limits + rate_limit_hit() + rate_limit_purge()   (ADR-007)
--   2. activate_card(p_card_id)                              (ADR-006: invariantes en BD)
--   3. Guard: status='active' solo via activate_card         (refuerza "una sola activa")
--   4. wallet_events                                         (KPI fiabilidad wallet, T4.3)
--   5. Logos: bucket publico merchant-logos + guard de ruta  (<merchant_id>/<fichero>)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Rate limiting en Postgres (ventana fija)
--    Solo service_role (Edge Function). Las claves llevan hash+sal en la
--    Edge Function: aqui NUNCA se guarda IP/email/telefono en claro.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start),
  constraint rate_limits_key_chk check (char_length(key) between 1 and 200)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;   -- sin politicas: nadie salvo service_role
revoke all on public.rate_limits from public, anon, authenticated;
grant all on public.rate_limits to service_role;

-- Registra UN intento y dice si esta permitido.
--   p_key             'enroll:ip:<hash>' ...
--   p_window_seconds  tamano de la ventana fija (1..604800)
--   p_max             intentos permitidos por ventana (>=1)
-- Devuelve { allowed, remaining, retry_after } (retry_after en segundos, 0 si allowed).
-- Los intentos denegados tambien cuentan (frena la fuerza bruta sostenida).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 200
     or p_window_seconds is null or p_window_seconds not between 1 and 604800
     or p_max is null or p_max < 1 then
    raise exception 'invalid_rate_limit_args' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  return jsonb_build_object(
    'allowed',     v_hits <= p_max,
    'remaining',   greatest(p_max - v_hits, 0),
    'retry_after', case when v_hits <= p_max then 0
                        else greatest(1, ceil(extract(epoch from
                               (v_start + make_interval(secs => p_window_seconds) - now())))::integer)
                   end);
end $$;
revoke all on function public.rate_limit_hit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,integer,integer) to service_role;

-- Limpieza (ventanas maximas usadas: 1 dia; se conservan 2).
create or replace function public.rate_limit_purge()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.rate_limit_purge() from public, anon, authenticated;
grant execute on function public.rate_limit_purge() to service_role;

-- Programa la limpieza diaria SOLO si pg_cron ya esta habilitada
-- (Dashboard > Database > Extensions > pg_cron). Si no, solo avisa.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rate-limits-purge';
    perform cron.schedule('rate-limits-purge', '17 3 * * *', 'select public.rate_limit_purge()');
  else
    raise notice 'pg_cron no habilitada: rate_limits no se purgara sola. Habilitala y vuelve a ejecutar esta migracion, o ejecuta select public.rate_limit_purge() de vez en cuando.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Guard de estado: 'active' SOLO a traves de activate_card()
--    (0001 concede INSERT/UPDATE(status) al dueno; sin esto podria saltarse
--    las comprobaciones de activate_card y solo toparia con el indice unico).
--    Otras transiciones (draft->archived, etc.) siguen permitidas.
-- ---------------------------------------------------------------------
create or replace function app.programs_status_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and coalesce(current_setting('app.activating', true), '') <> 'on' then
    raise exception 'use_activate_card' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists programs_status_guard on public.loyalty_programs;
create trigger programs_status_guard before insert or update of status on public.loyalty_programs
  for each row execute function app.programs_status_guard();

-- ---------------------------------------------------------------------
-- 3. activate_card(p_card_id): activa un programa (la "tarjeta" del comercio).
--    Invariantes:
--      * solo el owner del comercio (mismo error si no existe: no filtra);
--      * una sola tarjeta activa: la anterior pasa a 'archived' (no se borra);
--      * tipo bloqueado: si la activa actual tiene clientes inscritos y la
--        nueva es de OTRO tipo => 'type_locked' (PRD M2/H2);
--      * idempotente: si ya esta activa, la devuelve sin cambios;
--      * serializa por comercio (FOR UPDATE sobre merchants).
--    La config "completa" (tipo, umbral, recompensa, nombre, color) ya la
--    garantizan los NOT NULL y CHECK de loyalty_programs.
--    Devuelve la fila del programa como jsonb.
-- ---------------------------------------------------------------------
create or replace function public.activate_card(p_card_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_prog  public.loyalty_programs%rowtype;
  v_other public.loyalty_programs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_prog from public.loyalty_programs where id = p_card_id;
  if not found or v_prog.merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  -- Serializa activaciones concurrentes del mismo comercio y relee el estado.
  perform 1 from public.merchants where id = v_prog.merchant_id for update;
  select * into v_prog from public.loyalty_programs where id = p_card_id;

  if v_prog.status = 'active' then
    return to_jsonb(v_prog);
  end if;

  select * into v_other from public.loyalty_programs
   where merchant_id = v_prog.merchant_id and status = 'active' and id <> p_card_id;
  if found then
    if v_other.type is distinct from v_prog.type
       and exists (select 1 from public.customer_cards c where c.program_id = v_other.id) then
      raise exception 'type_locked' using errcode = '23514';
    end if;
    update public.loyalty_programs set status = 'archived' where id = v_other.id;
  end if;

  perform set_config('app.activating', 'on', true);          -- solo esta transaccion
  update public.loyalty_programs set status = 'active' where id = p_card_id
  returning * into v_prog;
  perform set_config('app.activating', 'off', true);

  return to_jsonb(v_prog);
end $$;
revoke all on function public.activate_card(uuid) from public, anon, authenticated;
grant execute on function public.activate_card(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. wallet_events: trazas de emision/guardado de pases (KPI >=98%). Sin PII.
--    Solo service_role. Aun nadie escribe aqui (T4.3); queda lista.
-- ---------------------------------------------------------------------
create table if not exists public.wallet_events (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  card_id     uuid,
  platform    text not null,
  event       text not null,
  error_code  text,
  created_at  timestamptz not null default now(),
  constraint wallet_events_platform_chk check (platform in ('google','apple','web')),
  constraint wallet_events_event_chk check (event in ('issue_requested','save_url_issued','saved','removed','error')),
  constraint wallet_events_card_fk foreign key (merchant_id, card_id)
    references public.customer_cards (merchant_id, id) on delete cascade
);
create index if not exists wallet_events_merchant_idx on public.wallet_events (merchant_id, created_at desc);
create index if not exists wallet_events_kpi_idx on public.wallet_events (platform, event, created_at desc);
alter table public.wallet_events enable row level security;
revoke all on public.wallet_events from public, anon, authenticated;
grant all on public.wallet_events to service_role;

-- ---------------------------------------------------------------------
-- 5. Logos. 0001 ya creo el bucket publico 'merchant-logos' y las politicas
--    de storage.objects por carpeta <merchant_id>/. Aqui:
--      a) se re-asegura el bucket (publico, 1 MB, png/jpeg/webp) de forma idempotente;
--      b) se valida que loyalty_programs.logo_path apunte a la carpeta del
--         propio comercio (evita referenciar logos de otro tenant).
--    URL publica = <SUPABASE_URL>/storage/v1/object/public/merchant-logos/<logo_path>
--    (front: supabase.storage.from('merchant-logos').getPublicUrl(logo_path)).
--    El bucket NO es listable por anon (no hay politica SELECT para anon).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-logos', 'merchant-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png','image/jpeg','image/webp'];

create or replace function app.programs_logo_path_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.logo_path is not null and (
       new.logo_path not like new.merchant_id::text || '/%'
       or new.logo_path like '%..%'
       or char_length(new.logo_path) > 300) then
    raise exception 'invalid_logo_path' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists programs_logo_path_guard on public.loyalty_programs;
create trigger programs_logo_path_guard before insert or update of logo_path on public.loyalty_programs
  for each row execute function app.programs_logo_path_guard();

commit;

-- =====================================================================
-- DOWN (rollback manual)
-- =====================================================================
-- begin;
-- drop trigger if exists programs_logo_path_guard on public.loyalty_programs;
-- drop trigger if exists programs_status_guard on public.loyalty_programs;
-- drop function if exists app.programs_logo_path_guard(), app.programs_status_guard();
-- drop function if exists public.activate_card(uuid);
-- drop table if exists public.wallet_events;
-- do $$ begin
--   if exists (select 1 from pg_extension where extname='pg_cron') then
--     perform cron.unschedule(jobid) from cron.job where jobname='rate-limits-purge';
--   end if; end $$;
-- drop function if exists public.rate_limit_purge(), public.rate_limit_hit(text,integer,integer);
-- drop table if exists public.rate_limits;
-- commit;
