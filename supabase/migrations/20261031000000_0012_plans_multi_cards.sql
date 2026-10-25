-- 0012: Planes y VARIAS tarjetas por comercio + metricas del Inicio del panel.
--  * merchants.plan: basic (1 tarjeta) | pro (3) | premium (10). Lo cambia SOLO el equipo
--    (service_role / SQL editor) cuando el comercio paga; el comercio no tiene grant de update.
--      update public.merchants set plan = 'pro' where slug = 'bar-pepe-ab12';
--  * El limite cuenta tarjetas NO archivadas (borrador + activas). Bajar de plan no borra nada:
--    solo impide crear/reactivar mas.
--  * loyalty_programs.code: identifica la tarjeta en los enlaces (/c/:slug?card=code,
--    /v/:slug?card=code). NULL = tarjeta "principal" de siempre: los QR/NFC ya impresos
--    (sin ?card) siguen apuntando a ella. Solo se puede cambiar mientras es borrador.
--  * loyalty_programs.wallet_class_key: id de la clase de Google Wallet (una por tarjeta). Las
--    existentes conservan 'merchant_<id>' (los pases guardados la referencian); las nuevas
--    usan 'program_<id>'.
--  * Se quita "una sola tarjeta activa"; activate_card ya no archiva la anterior.
--  * RPC publicas/alta/visita/recuperar aceptan p_card (NULL = principal).

-- ---------------------------------------------------------------------
-- 1. Planes
-- ---------------------------------------------------------------------
alter table public.merchants add column if not exists plan text not null default 'basic';
alter table public.merchants drop constraint if exists merchants_plan_chk,
  add constraint merchants_plan_chk check (plan in ('basic', 'pro', 'premium'));

create or replace function public.plan_card_limit(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan when 'premium' then 10 when 'pro' then 3 else 1 end
$$;
grant execute on function public.plan_card_limit(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Codigo de tarjeta y clase de Wallet
-- ---------------------------------------------------------------------
alter table public.loyalty_programs
  add column if not exists code text,
  add column if not exists wallet_class_key text;

alter table public.loyalty_programs drop constraint if exists programs_code_chk,
  add constraint programs_code_chk check (code is null or code ~ '^[a-z0-9][a-z0-9-]{0,22}[a-z0-9]$');
create unique index if not exists programs_merchant_code_uidx
  on public.loyalty_programs (merchant_id, code) where code is not null;

update public.loyalty_programs
   set wallet_class_key = 'merchant_' || replace(merchant_id::text, '-', '')
 where wallet_class_key is null;

create or replace function app.programs_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.wallet_class_key := 'program_' || replace(new.id::text, '-', '');
  elsif new.wallet_class_key is distinct from old.wallet_class_key then
    raise exception 'wallet_class_key_immutable' using errcode = '42501';
  elsif new.code is distinct from old.code and old.status <> 'draft' then
    raise exception 'code_locked' using errcode = '42501';  -- ya impreso en QR/NFC
  end if;
  return new;
end $$;
drop trigger if exists programs_defaults on public.loyalty_programs;
create trigger programs_defaults before insert or update on public.loyalty_programs
  for each row execute function app.programs_defaults();

alter table public.loyalty_programs alter column wallet_class_key set not null;

grant insert (code, points_per_visit) on public.loyalty_programs to authenticated;
grant update (code) on public.loyalty_programs to authenticated;

-- Tarjeta activa por codigo (NULL/'' = principal: la de code NULL o, si no, la activa mas antigua).
create or replace function app.resolve_program(p_merchant_id uuid, p_code text)
returns uuid language sql stable set search_path = '' as $$
  select p.id from public.loyalty_programs p
   where p.merchant_id = p_merchant_id and p.status = 'active'
     and (nullif(btrim(coalesce(p_code, '')), '') is null or p.code = lower(btrim(p_code)))
   order by (p.code is null) desc, p.created_at
   limit 1
$$;

-- ---------------------------------------------------------------------
-- 3. Varias activas + limite del plan
-- ---------------------------------------------------------------------
drop index if exists public.programs_one_active_uidx;

create or replace function app.programs_plan_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
  v_used integer;
begin
  if new.status = 'archived' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'archived' then return new; end if;
  -- Serializa altas concurrentes del mismo comercio.
  select plan into v_plan from public.merchants where id = new.merchant_id for update;
  select count(*) into v_used from public.loyalty_programs
   where merchant_id = new.merchant_id and status <> 'archived' and id <> new.id;
  if v_used >= public.plan_card_limit(v_plan) then
    raise exception 'plan_limit' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists programs_plan_limit on public.loyalty_programs;
create trigger programs_plan_limit before insert or update of status on public.loyalty_programs
  for each row execute function app.programs_plan_limit();

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
  if v_prog.status = 'active' then
    return to_jsonb(v_prog);
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
-- 4. RPC publicas con p_card
-- ---------------------------------------------------------------------
drop function if exists public.get_public_merchant(text);
create or replace function public.get_public_merchant(p_slug text, p_card text default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', m.slug, 'name', m.name, 'legal_name', m.legal_name, 'privacy_email', m.privacy_email,
    'card', jsonb_build_object(
      'code', p.code, 'card_name', p.card_name, 'type', p.type, 'threshold', p.threshold,
      'reward_description', p.reward_description, 'brand_color', p.brand_color, 'logo_path', p.logo_path),
    'consents', jsonb_build_object(
      'terms_privacy', (select jsonb_build_object('version', ct.version, 'body', ct.body)
                        from public.consent_texts ct where ct.purpose = 'terms_privacy'
                        order by ct.published_at desc limit 1),
      'marketing',     (select jsonb_build_object('version', ct.version, 'body', ct.body)
                        from public.consent_texts ct where ct.purpose = 'marketing'
                        order by ct.published_at desc limit 1)))
  from public.merchants m
  join public.loyalty_programs p on p.id = app.resolve_program(m.id, p_card)
  where m.slug = lower(btrim(p_slug))
$$;
revoke all on function public.get_public_merchant(text, text) from public, anon, authenticated;
grant execute on function public.get_public_merchant(text, text) to anon, authenticated, service_role;

create or replace function public.get_public_pass(p_token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'token', cc.public_id, 'balance', cc.balance, 'status', cc.status,
    'merchant_name', m.name, 'slug', m.slug,
    'card', jsonb_build_object('code', p.code, 'card_name', p.card_name, 'type', p.type,
            'threshold', p.threshold, 'reward_description', p.reward_description,
            'brand_color', p.brand_color, 'logo_path', p.logo_path),
    'location', case when m.address is null then null else
                  jsonb_build_object('address', m.address, 'latitude', m.latitude, 'longitude', m.longitude) end)
  from public.customer_cards cc
  join public.loyalty_programs p on p.id = cc.program_id
  join public.merchants m on m.id = cc.merchant_id
  where cc.public_id = p_token
$$;
revoke all on function public.get_public_pass(uuid) from public, anon, authenticated;
grant execute on function public.get_public_pass(uuid) to anon, authenticated, service_role;

-- enroll_customer: identica a 0001 salvo p_card_code (tarjeta elegida por el enlace).
drop function if exists public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text);
create or replace function public.enroll_customer(
  p_slug text, p_full_name text, p_email text, p_phone_e164 text,
  p_terms_accepted boolean, p_terms_version text,
  p_marketing_opt_in boolean default false, p_marketing_version text default null,
  p_ip inet default null, p_user_agent text default null, p_card_code text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name   text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_phone  text := regexp_replace(coalesce(p_phone_e164, ''), '[\s().-]', '', 'g');
  v_merchant_id uuid;
  v_program_id  uuid;
  v_by_email uuid;
  v_by_phone uuid;
  v_k1 bigint; v_k2 bigint;
  v_customer_id uuid;
  v_card_id uuid; v_card_public uuid; v_balance integer;
  v_status text;
  v_marketing boolean := (p_marketing_opt_in is true);
  v_card jsonb;
begin
  if p_terms_accepted is not true then raise exception 'terms_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.consent_texts
                 where purpose = 'terms_privacy' and version = p_terms_version) then
    raise exception 'invalid_terms_version' using errcode = '22023'; end if;
  if v_marketing and not exists (select 1 from public.consent_texts
                 where purpose = 'marketing' and version = p_marketing_version) then
    raise exception 'invalid_marketing_version' using errcode = '22023'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023'; end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;

  select m.id into v_merchant_id from public.merchants m where m.slug = lower(btrim(p_slug));
  v_program_id := app.resolve_program(v_merchant_id, p_card_code);
  if v_merchant_id is null or v_program_id is null then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;

  v_k1 := hashtextextended(v_merchant_id::text || ':e:' || v_email, 0);
  v_k2 := hashtextextended(v_merchant_id::text || ':p:' || v_phone, 0);
  perform pg_advisory_xact_lock(least(v_k1, v_k2));
  if v_k1 <> v_k2 then perform pg_advisory_xact_lock(greatest(v_k1, v_k2)); end if;

  select id into v_by_email from public.customers where merchant_id = v_merchant_id and email = v_email;
  select id into v_by_phone from public.customers where merchant_id = v_merchant_id and phone_e164 = v_phone;

  if v_by_email is null and v_by_phone is null then
    insert into public.customers (merchant_id, full_name, email, phone_e164)
    values (v_merchant_id, v_name, v_email, v_phone) returning id into v_customer_id;
    insert into public.consents (merchant_id, customer_id, purpose, text_version, granted, ip, user_agent)
    values (v_merchant_id, v_customer_id, 'terms_privacy', p_terms_version, true, p_ip, left(p_user_agent, 400));
    v_status := 'created';
  elsif v_by_email is not null and v_by_email = v_by_phone then
    v_customer_id := v_by_email;
    v_status := 'existing';
  else
    return jsonb_build_object('status', 'already_registered');
  end if;

  if v_marketing then
    insert into public.consents (merchant_id, customer_id, purpose, text_version, granted, ip, user_agent)
    values (v_merchant_id, v_customer_id, 'marketing', p_marketing_version, true, p_ip, left(p_user_agent, 400))
    on conflict (customer_id, purpose) where revoked_at is null and customer_id is not null do nothing;
  end if;

  -- Mismo cliente en otra tarjeta del comercio: se le crea la tarjeta nueva (status 'existing').
  insert into public.customer_cards (merchant_id, customer_id, program_id)
  values (v_merchant_id, v_customer_id, v_program_id)
  on conflict (customer_id, program_id) do nothing;

  select id, public_id, balance into v_card_id, v_card_public, v_balance
  from public.customer_cards where customer_id = v_customer_id and program_id = v_program_id;

  select jsonb_build_object('merchant_name', m.name, 'card_name', p.card_name, 'type', p.type,
           'threshold', p.threshold, 'reward_description', p.reward_description,
           'brand_color', p.brand_color, 'logo_path', p.logo_path)
    into v_card
  from public.loyalty_programs p join public.merchants m on m.id = p.merchant_id
  where p.id = v_program_id;

  return jsonb_build_object('status', v_status, 'card_id', v_card_id,
    'card_public_id', v_card_public, 'balance', v_balance, 'program_id', v_program_id,
    'card', v_card,
    'marketing_opt_in', exists (select 1 from public.consents c
        where c.customer_id = v_customer_id and c.purpose = 'marketing' and c.revoked_at is null));
end $$;
revoke all on function public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text,text) from public, anon, authenticated;
grant execute on function public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text,text) to service_role;

-- register_visit: como 0007 + comprueba que el token es de la tarjeta del QR (p_card) y
-- devuelve wallet_class_key. Token de otra tarjeta => not_found (el cliente puede recuperarla).
drop function if exists public.register_visit(text, uuid);
create or replace function public.register_visit(p_slug text, p_token uuid, p_card text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_card public.customer_cards%rowtype;
  v_prog public.loyalty_programs%rowtype;
  v_last timestamptz;
  v_wait integer;
  v_gain integer;
  v_balance integer;
  v_earned boolean := false;
begin
  select cc.* into v_card
    from public.customer_cards cc
    join public.merchants m on m.id = cc.merchant_id
   where cc.public_id = p_token and m.slug = p_slug
   for update of cc;
  if not found or v_card.status <> 'active' then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into v_prog from public.loyalty_programs where id = v_card.program_id;
  if v_prog.status <> 'active' then
    return jsonb_build_object('result', 'not_supported');
  end if;
  if v_prog.id is distinct from app.resolve_program(v_card.merchant_id, p_card) then
    return jsonb_build_object('result', 'not_found');
  end if;
  v_gain := case when v_prog.type = 'points' then coalesce(v_prog.points_per_visit, 1) else 1 end;

  if v_prog.visit_cooldown_minutes > 0 then
    select max(created_at) into v_last from public.loyalty_ledger
     where card_id = v_card.id and kind in ('earn_visit', 'earn_points');
    if v_last is not null and v_last > now() - make_interval(mins => v_prog.visit_cooldown_minutes) then
      v_wait := ceil(extract(epoch from (v_last + make_interval(mins => v_prog.visit_cooldown_minutes) - now())));
      return jsonb_build_object('result', 'cooldown', 'type', v_prog.type, 'balance', v_card.balance,
                                'threshold', v_prog.threshold, 'retry_after', v_wait);
    end if;
  end if;

  v_balance := v_card.balance + v_gain;
  insert into public.loyalty_ledger (merchant_id, card_id, kind, delta, balance_after, idempotency_key)
    values (v_card.merchant_id, v_card.id,
            case when v_prog.type = 'points' then 'earn_points' else 'earn_visit' end,
            v_gain, v_balance, gen_random_uuid()::text);

  if v_balance >= v_prog.threshold then
    v_earned := true;
    v_balance := v_balance - v_prog.threshold;
    insert into public.loyalty_ledger (merchant_id, card_id, kind, delta, balance_after, idempotency_key)
      values (v_card.merchant_id, v_card.id, 'redeem', -v_prog.threshold, v_balance, gen_random_uuid()::text);
  end if;

  update public.customer_cards set balance = v_balance, last_movement_at = now() where id = v_card.id;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;

  return jsonb_build_object(
    'result', case when v_earned then 'reward_earned' else 'visit_added' end,
    'type', v_prog.type, 'gained', v_gain, 'balance', v_balance, 'threshold', v_prog.threshold,
    'reward', v_prog.reward_description,
    'card_name', v_prog.card_name, 'brand_color', v_prog.brand_color, 'logo_path', v_prog.logo_path,
    'merchant_id', v_card.merchant_id, 'wallet_class_key', v_prog.wallet_class_key,
    'merchant_name', (select name from public.merchants where id = v_card.merchant_id));
end
$$;
revoke all on function public.register_visit(text, uuid, text) from public, anon, authenticated;
grant execute on function public.register_visit(text, uuid, text) to service_role;

drop function if exists public.recover_card(text, text, text);
create or replace function public.recover_card(p_slug text, p_email text, p_phone_e164 text,
                                               p_card text default null)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select cc.public_id
  from public.merchants m
  join public.customers c on c.merchant_id = m.id
   and c.email = lower(btrim(coalesce(p_email, '')))
   and c.phone_e164 = regexp_replace(coalesce(p_phone_e164, ''), '[\s().-]', '', 'g')
  join public.customer_cards cc on cc.customer_id = c.id
   and cc.program_id = app.resolve_program(m.id, p_card)
  where m.slug = lower(btrim(p_slug))
$$;
revoke all on function public.recover_card(text, text, text, text) from public, anon, authenticated;
grant execute on function public.recover_card(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Inicio del panel: todas las metricas en una llamada (solo owner).
--    Mes = mes natural en hora de Madrid.
-- ---------------------------------------------------------------------
create or replace function public.merchant_dashboard(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_now   timestamptz := now();
  v_month timestamptz := date_trunc('month', v_now at time zone 'Europe/Madrid') at time zone 'Europe/Madrid';
  v_prev  timestamptz := (date_trunc('month', v_now at time zone 'Europe/Madrid') - interval '1 month') at time zone 'Europe/Madrid';
  v_plan  text;
begin
  if p_merchant_id is null or p_merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;
  select plan into v_plan from public.merchants where id = p_merchant_id;

  return jsonb_build_object(
    'plan', v_plan,
    'card_limit', public.plan_card_limit(v_plan),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'card_name', p.card_name, 'status', p.status, 'type', p.type,
               'threshold', p.threshold, 'brand_color', p.brand_color,
               'customers', (select count(*) from public.customer_cards cc where cc.program_id = p.id))
             order by p.created_at)
        from public.loyalty_programs p
       where p.merchant_id = p_merchant_id and p.status <> 'archived'), '[]'::jsonb),
    'customers', jsonb_build_object(
      'total',      (select count(*) from public.customers where merchant_id = p_merchant_id),
      'new_month',  (select count(*) from public.customers where merchant_id = p_merchant_id and created_at >= v_month),
      'new_prev',   (select count(*) from public.customers where merchant_id = p_merchant_id
                       and created_at >= v_prev and created_at < v_month),
      'active_30d', (select count(*) from public.customers where merchant_id = p_merchant_id
                       and last_visit_at >= v_now - interval '30 days'),
      'marketing',  (select count(distinct customer_id) from public.consents
                      where merchant_id = p_merchant_id and purpose = 'marketing' and revoked_at is null
                        and customer_id is not null)),
    'visits', jsonb_build_object(
      'month', (select count(*) from public.loyalty_ledger where merchant_id = p_merchant_id
                  and kind in ('earn_visit', 'earn_points') and created_at >= v_month),
      'prev',  (select count(*) from public.loyalty_ledger where merchant_id = p_merchant_id
                  and kind in ('earn_visit', 'earn_points') and created_at >= v_prev and created_at < v_month)),
    'rewards', jsonb_build_object(
      'month', (select count(*) from public.loyalty_ledger where merchant_id = p_merchant_id
                  and kind = 'redeem' and created_at >= v_month),
      'total', (select count(*) from public.loyalty_ledger where merchant_id = p_merchant_id and kind = 'redeem')),
    'wallet_saved', (select count(*) from public.wallet_passes where merchant_id = p_merchant_id
                       and platform = 'google'),
    'messages', jsonb_build_object(
      'promotions_month', (select count(*) from public.promotions where merchant_id = p_merchant_id
                             and created_at >= v_month),
      'sent_month', (select coalesce(sum(sent), 0) from public.promotions where merchant_id = p_merchant_id
                       and created_at >= v_month),
      'last', (select jsonb_build_object('title', title, 'sent', sent, 'total', total, 'created_at', created_at)
                 from public.promotions where merchant_id = p_merchant_id
                order by created_at desc limit 1)),
    -- Visitas por dia, ultimos 30 dias (incluye dias a 0).
    'daily', (select jsonb_agg(jsonb_build_object('day', d.day::date, 'visits', coalesce(v.n, 0)) order by d.day)
                from generate_series((v_now at time zone 'Europe/Madrid')::date - 29,
                                     (v_now at time zone 'Europe/Madrid')::date, interval '1 day') as d(day)
                left join (select (created_at at time zone 'Europe/Madrid')::date as day, count(*) as n
                             from public.loyalty_ledger
                            where merchant_id = p_merchant_id and kind in ('earn_visit', 'earn_points')
                              and created_at >= v_now - interval '31 days'
                            group by 1) v on v.day = d.day::date),
    'recent', coalesce((
      select jsonb_agg(r order by r->>'at' desc) from (
        select jsonb_build_object('kind', l.kind, 'delta', l.delta, 'at', l.created_at,
                                  'customer', c.full_name, 'customer_id', c.id, 'card_name', p.card_name) as r
          from public.loyalty_ledger l
          join public.customer_cards cc on cc.id = l.card_id
          join public.customers c on c.id = cc.customer_id
          join public.loyalty_programs p on p.id = cc.program_id
         where l.merchant_id = p_merchant_id
         order by l.created_at desc limit 6) s), '[]'::jsonb));
end $$;
revoke all on function public.merchant_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.merchant_dashboard(uuid) to authenticated;
