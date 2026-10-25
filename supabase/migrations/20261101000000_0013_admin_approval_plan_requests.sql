-- 0013: Panel /admin (solo el equipo), autorizacion de comercios y solicitudes de cambio de plan.
--  * platform_admins: usuarios de Auth con acceso a /admin. Se dan de alta A MANO (SQL editor):
--      insert into public.platform_admins (user_id)
--      select id from auth.users where email = 'tu-email@ejemplo.com';
--  * merchants.approval_status: pending (recien registrado) | approved | rejected.
--    Los comercios existentes quedan approved. Uno no aprobado no puede activar tarjetas y sus
--    enlaces publicos (alta, visita, recuperar) dejan de resolver (app.resolve_program).
--  * merchants.contact_phone: telefono de contacto del comercio (Cuenta), para el equipo.
--  * plan_requests: "Contratar este plan" desde Cuenta. Una pendiente por comercio (se actualiza
--    si pide otro). El admin la marca contacted/done/cancelled; cambiar el plan la cierra (done).
--  * Funciones admin_*: SECURITY DEFINER y exigen app.is_admin(). Nada de grants directos.

-- ---------------------------------------------------------------------
-- 1. Admins
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_admin()
$$;
revoke all on function public.am_i_admin() from public, anon, authenticated;
grant execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Autorizacion del comercio + telefono de contacto
-- ---------------------------------------------------------------------
alter table public.merchants
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz,
  add column if not exists contact_phone text;
update public.merchants set approval_status = 'approved', approved_at = coalesce(approved_at, now())
 where approval_status is null;
alter table public.merchants
  alter column approval_status set default 'pending',
  alter column approval_status set not null;
alter table public.merchants drop constraint if exists merchants_approval_chk,
  add constraint merchants_approval_chk check (approval_status in ('pending', 'approved', 'rejected')),
  drop constraint if exists merchants_contact_phone_chk,
  add constraint merchants_contact_phone_chk check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
grant update (contact_phone) on public.merchants to authenticated;

-- Solo tarjetas de comercios autorizados resuelven en los enlaces publicos.
create or replace function app.resolve_program(p_merchant_id uuid, p_code text)
returns uuid language sql stable set search_path = '' as $$
  select p.id from public.loyalty_programs p
   join public.merchants m on m.id = p.merchant_id and m.approval_status = 'approved'
   where p.merchant_id = p_merchant_id and p.status = 'active'
     and (nullif(btrim(coalesce(p_code, '')), '') is null or p.code = lower(btrim(p_code)))
   order by (p.code is null) desc, p.created_at
   limit 1
$$;

-- activate_card: como 0012 + exige comercio autorizado.
create or replace function public.activate_card(p_card_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_prog public.loyalty_programs%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v_prog from public.loyalty_programs where id = p_card_id;
  if not found or v_prog.merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchants
                  where id = v_prog.merchant_id and approval_status = 'approved') then
    raise exception 'merchant_not_approved' using errcode = '42501';
  end if;
  if v_prog.status = 'active' then
    return to_jsonb(v_prog);
  end if;

  perform set_config('app.activating', 'on', true);
  update public.loyalty_programs set status = 'active' where id = p_card_id
  returning * into v_prog;
  perform set_config('app.activating', 'off', true);
  return to_jsonb(v_prog);
end $$;
revoke all on function public.activate_card(uuid) from public, anon, authenticated;
grant execute on function public.activate_card(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Solicitudes de cambio de plan
-- ---------------------------------------------------------------------
create table if not exists public.plan_requests (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references public.merchants(id) on delete cascade,
  current_plan   text not null,
  requested_plan text not null,
  status         text not null default 'pending',
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint plan_requests_plan_chk check (requested_plan in ('basic', 'pro', 'premium')),
  constraint plan_requests_status_chk check (status in ('pending', 'contacted', 'done', 'cancelled')),
  constraint plan_requests_note_chk check (note is null or char_length(note) <= 500)
);
-- Una abierta (pending/contacted) por comercio.
create unique index if not exists plan_requests_open_uidx
  on public.plan_requests (merchant_id) where status in ('pending', 'contacted');
create index if not exists plan_requests_created_idx on public.plan_requests (created_at desc);
drop trigger if exists plan_requests_updated_at on public.plan_requests;
create trigger plan_requests_updated_at before update on public.plan_requests
  for each row execute function app.set_updated_at();

alter table public.plan_requests enable row level security;
revoke all on public.plan_requests from public, anon, authenticated;
grant select on public.plan_requests to authenticated;
drop policy if exists plan_requests_select on public.plan_requests;
create policy plan_requests_select on public.plan_requests for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));

-- El owner pide un plan. Devuelve la solicitud abierta.
create or replace function public.request_plan_change(p_plan text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mid  uuid;
  v_plan text;
  v_req  public.plan_requests%rowtype;
begin
  select m.id, m.plan into v_mid, v_plan
    from public.merchants m
   where m.id in (select app.my_merchant_ids(array['owner']))
   limit 1;
  if v_mid is null then raise exception 'forbidden_or_not_found' using errcode = '42501'; end if;
  if p_plan not in ('basic', 'pro', 'premium') then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  if p_plan = v_plan then raise exception 'same_plan' using errcode = '22023'; end if;

  update public.plan_requests
     set requested_plan = p_plan, current_plan = v_plan, status = 'pending', created_at = now()
   where merchant_id = v_mid and status in ('pending', 'contacted')
  returning * into v_req;
  if not found then
    insert into public.plan_requests (merchant_id, current_plan, requested_plan)
    values (v_mid, v_plan, p_plan) returning * into v_req;
  end if;
  return to_jsonb(v_req);
end $$;
revoke all on function public.request_plan_change(text) from public, anon, authenticated;
grant execute on function public.request_plan_change(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Funciones del panel /admin
-- ---------------------------------------------------------------------
create or replace function app.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- Resumen de un comercio (fila de listado y cabecera de la ficha).
create or replace function app.admin_merchant_row(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'slug', m.slug, 'name', m.name, 'plan', m.plan,
    'approval_status', m.approval_status, 'created_at', m.created_at, 'approved_at', m.approved_at,
    'owner_email', (select u.email from public.merchant_members mm join auth.users u on u.id = mm.user_id
                     where mm.merchant_id = m.id and mm.role = 'owner' order by mm.created_at limit 1),
    'contact_phone', m.contact_phone, 'privacy_email', m.privacy_email,
    'legal_name', m.legal_name, 'tax_id', m.tax_id, 'address', m.address,
    'cards_active', (select count(*) from public.loyalty_programs p where p.merchant_id = m.id and p.status = 'active'),
    'cards_total',  (select count(*) from public.loyalty_programs p where p.merchant_id = m.id and p.status <> 'archived'),
    'customers',    (select count(*) from public.customers c where c.merchant_id = m.id),
    'visits_30d',   (select count(*) from public.loyalty_ledger l where l.merchant_id = m.id
                       and l.kind in ('earn_visit', 'earn_points') and l.created_at >= now() - interval '30 days'),
    'rewards_30d',  (select count(*) from public.loyalty_ledger l where l.merchant_id = m.id
                       and l.kind = 'redeem' and l.created_at >= now() - interval '30 days'),
    'messages_30d', (select coalesce(sum(sent), 0) from public.promotions pr where pr.merchant_id = m.id
                       and pr.created_at >= now() - interval '30 days'),
    'last_activity', (select max(l.created_at) from public.loyalty_ledger l where l.merchant_id = m.id),
    'open_request', (select jsonb_build_object('id', r.id, 'requested_plan', r.requested_plan,
                              'current_plan', r.current_plan, 'status', r.status, 'created_at', r.created_at)
                       from public.plan_requests r
                      where r.merchant_id = m.id and r.status in ('pending', 'contacted')))
  from public.merchants m where m.id = p_id
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now   timestamptz := now();
  v_month timestamptz := date_trunc('month', v_now at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
begin
  perform app.assert_admin();
  return jsonb_build_object(
    'merchants', jsonb_build_object(
      'approved', (select count(*) from public.merchants where approval_status = 'approved'),
      'pending',  (select count(*) from public.merchants where approval_status = 'pending'),
      'rejected', (select count(*) from public.merchants where approval_status = 'rejected'),
      'new_month', (select count(*) from public.merchants where created_at >= v_month)),
    'plans', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
                from (select plan, count(*) n from public.merchants
                       where approval_status = 'approved' group by plan) s),
    'open_requests', (select count(*) from public.plan_requests where status in ('pending', 'contacted')),
    'cards_active', (select count(*) from public.loyalty_programs where status = 'active'),
    'customers', jsonb_build_object(
      'total', (select count(*) from public.customers),
      'new_month', (select count(*) from public.customers where created_at >= v_month)),
    'visits_month', (select count(*) from public.loyalty_ledger
                      where kind in ('earn_visit', 'earn_points') and created_at >= v_month),
    'rewards_month', (select count(*) from public.loyalty_ledger where kind = 'redeem' and created_at >= v_month),
    'messages_month', (select coalesce(sum(sent), 0) from public.promotions where created_at >= v_month),
    'wallet_saved', (select count(*) from public.wallet_passes where platform = 'google'),
    'daily', (select jsonb_agg(jsonb_build_object('day', d.day::date, 'visits', coalesce(v.n, 0)) order by d.day)
                from generate_series((v_now at time zone 'Europe/Madrid')::date - 29,
                                     (v_now at time zone 'Europe/Madrid')::date, interval '1 day') as d(day)
                left join (select (created_at at time zone 'Europe/Madrid')::date as day, count(*) as n
                             from public.loyalty_ledger
                            where kind in ('earn_visit', 'earn_points') and created_at >= v_now - interval '31 days'
                            group by 1) v on v.day = d.day::date),
    -- Comercios autorizados por actividad (visitas 30 dias).
    'top', coalesce((select jsonb_agg(app.admin_merchant_row(s.id) order by s.n desc, s.created_at)
                       from (select m.id, m.created_at,
                                    (select count(*) from public.loyalty_ledger l where l.merchant_id = m.id
                                       and l.kind in ('earn_visit', 'earn_points')
                                       and l.created_at >= v_now - interval '30 days') n
                               from public.merchants m where m.approval_status = 'approved'
                              order by n desc limit 10) s), '[]'::jsonb));
end $$;

create or replace function public.admin_list_merchants()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_admin();
  return coalesce((select jsonb_agg(app.admin_merchant_row(m.id) order by m.created_at desc)
                     from public.merchants m), '[]'::jsonb);
end $$;

create or replace function public.admin_get_merchant(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_row jsonb;
begin
  perform app.assert_admin();
  v_row := app.admin_merchant_row(p_id);
  if v_row is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v_row || jsonb_build_object(
    'cards', coalesce((select jsonb_agg(jsonb_build_object(
                'id', p.id, 'card_name', p.card_name, 'status', p.status, 'type', p.type,
                'threshold', p.threshold, 'reward_description', p.reward_description,
                'brand_color', p.brand_color, 'code', p.code,
                'customers', (select count(*) from public.customer_cards cc where cc.program_id = p.id))
              order by p.created_at)
              from public.loyalty_programs p where p.merchant_id = p_id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc)
                 from public.plan_requests r where r.merchant_id = p_id), '[]'::jsonb),
    'visits_total', (select count(*) from public.loyalty_ledger l where l.merchant_id = p_id
                       and l.kind in ('earn_visit', 'earn_points')),
    'promotions_total', (select count(*) from public.promotions pr where pr.merchant_id = p_id),
    'daily', (select jsonb_agg(jsonb_build_object('day', d.day::date, 'visits', coalesce(v.n, 0)) order by d.day)
                from generate_series((now() at time zone 'Europe/Madrid')::date - 29,
                                     (now() at time zone 'Europe/Madrid')::date, interval '1 day') as d(day)
                left join (select (created_at at time zone 'Europe/Madrid')::date as day, count(*) as n
                             from public.loyalty_ledger
                            where merchant_id = p_id and kind in ('earn_visit', 'earn_points')
                              and created_at >= now() - interval '31 days'
                            group by 1) v on v.day = d.day::date));
end $$;

create or replace function public.admin_set_approval(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_admin();
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.merchants
     set approval_status = p_status,
         approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return app.admin_merchant_row(p_id);
end $$;

-- Cambia el plan y cierra la solicitud abierta (done). Bajar de plan no archiva tarjetas.
create or replace function public.admin_set_plan(p_id uuid, p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_admin();
  if p_plan not in ('basic', 'pro', 'premium') then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  update public.merchants set plan = p_plan where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.plan_requests set status = 'done', resolved_at = now()
   where merchant_id = p_id and status in ('pending', 'contacted');
  return app.admin_merchant_row(p_id);
end $$;

create or replace function public.admin_update_request(p_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req public.plan_requests%rowtype;
begin
  perform app.assert_admin();
  if p_status not in ('pending', 'contacted', 'done', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.plan_requests
     set status = p_status,
         note = coalesce(nullif(btrim(p_note), ''), note),
         resolved_at = case when p_status in ('done', 'cancelled') then now() else null end
   where id = p_id
  returning * into v_req;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return to_jsonb(v_req);
end $$;

create or replace function public.admin_list_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_admin();
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object(
                       'merchant', jsonb_build_object('id', m.id, 'name', m.name, 'plan', m.plan,
                         'contact_phone', m.contact_phone,
                         'owner_email', (select u.email from public.merchant_members mm
                                           join auth.users u on u.id = mm.user_id
                                          where mm.merchant_id = m.id and mm.role = 'owner' limit 1)))
                     order by (r.status in ('pending', 'contacted')) desc, r.created_at desc)
                     from public.plan_requests r join public.merchants m on m.id = r.merchant_id), '[]'::jsonb);
end $$;

revoke all on function public.admin_overview(), public.admin_list_merchants(),
  public.admin_get_merchant(uuid), public.admin_set_approval(uuid, text),
  public.admin_set_plan(uuid, text), public.admin_update_request(uuid, text, text),
  public.admin_list_requests() from public, anon, authenticated;
grant execute on function public.admin_overview(), public.admin_list_merchants(),
  public.admin_get_merchant(uuid), public.admin_set_approval(uuid, text),
  public.admin_set_plan(uuid, text), public.admin_update_request(uuid, text, text),
  public.admin_list_requests() to authenticated;
