-- =====================================================================
-- 0001_init.sql  (migracion base; copia del borrador docs/drafts/0001_init.sql, que se conserva intacto)
-- FidelityCard - esquema inicial MVP (Postgres 15+ / Supabase)
--
-- Alcance activo : alta/login de comercio + configuracion de tarjeta +
--                  alta publica de cliente + pase web (/p/:token con QR) y
--                  Google Wallet.
-- Apple Wallet   : APARCADO en el MVP. Las tablas apple_pass_registrations y
--                  las columnas apple_* de wallet_passes/revoked_passes se
--                  conservan pero quedan SIN USO (no se escribe en ellas).
-- Alcance latente: loyalty_ledger (movimientos inmutables) y
--                  customer_cards.balance existen pero NADA los usa aun.
--                  Activarlos mas adelante = solo anadir funciones RPC
--                  (sin ALTER destructivo).
--
-- Principios:
--  * Aislamiento multi-tenant por comercio (merchant_id) con RLS.
--  * Anonimo: CERO acceso a tablas. Solo get_public_merchant(slug) (lectura
--    minima y publica) y, via Edge Function con service_role, enroll_customer.
--  * Tablas con secretos (wallet_passes, ...) = RLS activa y SIN politicas
--    para authenticated => solo service_role (que salta RLS) las toca.
--  * Reversible: ver bloque DOWN al final (comentado).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Esquema privado para helpers (no expuesto por PostgREST)
-- ---------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- Por defecto Supabase concede ALL a anon/authenticated sobre objetos nuevos
-- de public. Lo cerramos para lo que cree este rol a partir de ahora y,
-- ademas, revocamos explicitamente tabla por tabla mas abajo.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Funciones utilitarias genericas
-- ---------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Bloquea UPDATE/DELETE/TRUNCATE (tablas append-only). El DELETE solo se
-- permite durante el borrado RGPD, cuando erase_customer() activa el flag
-- transaccional app.allow_erasure (set_config(..., true) => solo esa tx).
create or replace function app.forbid_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.allow_erasure', true), '') = 'on' then
    return old;
  end if;
  raise exception '% es append-only (% bloqueado)', tg_table_name, tg_op
    using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------
-- 2. merchants + merchant_members
-- ---------------------------------------------------------------------
create table public.merchants (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null,                       -- /c/:slug (inmutable)
  name           text not null,                       -- nombre comercial
  legal_name     text,                                -- responsable RGPD
  tax_id         text,                                -- NIF/CIF (opcional)
  privacy_email  text,                                -- contacto derechos RGPD
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint merchants_slug_chk  check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  constraint merchants_name_chk  check (char_length(btrim(name)) between 1 and 80),
  constraint merchants_privacy_email_chk
    check (privacy_email is null or privacy_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index merchants_slug_uidx on public.merchants (slug);
create trigger merchants_updated_at before update on public.merchants
  for each row execute function app.set_updated_at();

-- El slug esta grabado en piezas NFC fisicas: no puede cambiar nunca.
create or replace function app.merchants_slug_immutable()
returns trigger language plpgsql as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'merchants.slug es inmutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger merchants_slug_immutable before update on public.merchants
  for each row execute function app.merchants_slug_immutable();

create table public.merchant_members (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id     uuid not null references auth.users(id)       on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  primary key (merchant_id, user_id),
  constraint merchant_members_role_chk check (role in ('owner','cashier'))
);
-- MVP: un usuario solo puede ser owner de UN comercio.
create unique index merchant_members_one_owner_uidx
  on public.merchant_members (user_id) where role = 'owner';
create index merchant_members_user_idx on public.merchant_members (user_id);

-- Helper de RLS. SECURITY DEFINER para no recursar en la RLS de
-- merchant_members. Devuelve SETOF para que el planner lo cachee como
-- initPlan: "merchant_id in (select app.my_merchant_ids())".
create or replace function app.my_merchant_ids(p_roles text[] default array['owner','cashier'])
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select mm.merchant_id
  from public.merchant_members mm
  where mm.user_id = (select auth.uid())
    and mm.role = any (p_roles)
$$;
revoke all on function app.my_merchant_ids(text[]) from public, anon;
grant execute on function app.my_merchant_ids(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. loyalty_programs (configuracion de la tarjeta)
-- ---------------------------------------------------------------------
create table public.loyalty_programs (
  id                     uuid primary key default gen_random_uuid(),
  merchant_id            uuid not null references public.merchants(id) on delete cascade,
  type                   text not null,                 -- 'points' | 'visits'
  threshold              integer not null,              -- X visitas o X puntos
  points_per_currency    numeric(8,2),                  -- puntos por 1 EUR (solo 'points')
  reward_description     text not null,
  visit_cooldown_minutes integer not null default 30,   -- antifraude (futuro)
  card_name              text not null,                 -- nombre en el pase
  brand_color            text not null default '#1F2937',
  logo_path              text,                          -- ruta en bucket merchant-logos
  status                 text not null default 'draft', -- draft|active|archived
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint programs_type_chk       check (type in ('points','visits')),
  constraint programs_status_chk     check (status in ('draft','active','archived')),
  constraint programs_threshold_chk  check (threshold between 1 and 100000),
  constraint programs_ppc_chk        check (
    (type = 'points' and points_per_currency is not null and points_per_currency > 0)
    or (type = 'visits' and points_per_currency is null)),
  constraint programs_cooldown_chk   check (visit_cooldown_minutes between 0 and 1440),
  constraint programs_reward_chk     check (char_length(btrim(reward_description)) between 1 and 200),
  constraint programs_card_name_chk  check (char_length(btrim(card_name)) between 1 and 60),
  constraint programs_color_chk      check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint programs_merchant_id_uq unique (merchant_id, id)   -- destino de FKs compuestas
);
create index programs_merchant_idx on public.loyalty_programs (merchant_id);
-- Una sola tarjeta activa por comercio (PRD M2).
create unique index programs_one_active_uidx
  on public.loyalty_programs (merchant_id) where status = 'active';
create trigger programs_updated_at before update on public.loyalty_programs
  for each row execute function app.set_updated_at();

-- El tipo no puede cambiar si ya hay clientes inscritos (PRD H2).
create or replace function app.programs_type_locked()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type is distinct from old.type
     and exists (select 1 from public.customer_cards c where c.program_id = old.id) then
    raise exception 'No se puede cambiar el tipo de una tarjeta con clientes inscritos'
      using errcode = '23514';
  end if;
  return new;
end $$;
-- (el trigger se crea tras customer_cards, abajo)

-- ---------------------------------------------------------------------
-- 4. Consentimiento: textos versionados
-- ---------------------------------------------------------------------
create table public.consent_texts (
  purpose      text not null,                    -- 'terms_privacy' (obligatorio) | 'marketing' (opcional)
  version      text not null,                    -- p.ej. '2026-10-v1' (versionado por finalidad)
  locale       text not null default 'es',
  body         text not null,                    -- admite {{merchant_name}}
  body_sha256  text not null,
  published_at timestamptz not null default now(),
  primary key (purpose, version),
  constraint consent_texts_purpose_chk check (purpose in ('terms_privacy','marketing'))
);
create or replace function app.consent_texts_hash()
returns trigger language plpgsql as $$
begin
  new.body_sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
  return new;
end $$;
create trigger consent_texts_hash before insert on public.consent_texts
  for each row execute function app.consent_texts_hash();
-- Inmutables: una version publicada no se edita (se publica otra).
create trigger consent_texts_immutable before update or delete on public.consent_texts
  for each row execute function app.forbid_mutation();

insert into public.consent_texts (purpose, version, locale, body) values
 ('terms_privacy', '2026-10-v1', 'es',
  'PLACEHOLDER - PENDIENTE DE REVISION LEGAL. Acepto los terminos y la politica de privacidad: {{merchant_name}} '
  '(responsable del tratamiento) tratara mi nombre, email y telefono para gestionar mi tarjeta de fidelidad. '
  'Puedo ejercer mis derechos de acceso, rectificacion y supresion contactando con el comercio.'),
 ('marketing', '2026-10-v1', 'es',
  'PLACEHOLDER - PENDIENTE DE REVISION LEGAL. Quiero recibir comunicaciones comerciales y promociones de '
  '{{merchant_name}} por email o telefono. Puedo retirar este consentimiento en cualquier momento.');

-- ---------------------------------------------------------------------
-- 5. customers (cliente final, por comercio)
-- ---------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  full_name   text not null,
  email       text not null,        -- SIEMPRE normalizado: lower(btrim())
  phone_e164  text not null,        -- SIEMPRE E.164: +34600111222
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customers_name_chk  check (char_length(btrim(full_name)) between 1 and 120),
  constraint customers_email_chk check (email = lower(btrim(email))
      and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint customers_phone_chk check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint customers_merchant_id_uq unique (merchant_id, id),
  -- Idempotencia: mismo email O telefono en el mismo comercio => no duplica.
  constraint customers_merchant_email_uq unique (merchant_id, email),
  constraint customers_merchant_phone_uq unique (merchant_id, phone_e164)
);
create index customers_merchant_created_idx on public.customers (merchant_id, created_at desc);
create trigger customers_updated_at before update on public.customers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. customer_cards (tarjeta de un cliente en un programa)
-- ---------------------------------------------------------------------
create table public.customer_cards (
  id               uuid primary key default gen_random_uuid(),
  public_id        uuid not null default gen_random_uuid(),  -- id opaco para QR/URL del pase
  merchant_id      uuid not null,
  customer_id      uuid not null,
  program_id       uuid not null,
  balance          integer not null default 0,   -- cache del ledger (sin uso en MVP)
  last_movement_at timestamptz,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cards_balance_chk check (balance >= 0),
  constraint cards_status_chk  check (status in ('active','blocked')),
  constraint cards_public_id_uq unique (public_id),
  constraint cards_customer_program_uq unique (customer_id, program_id),
  constraint cards_merchant_id_uq unique (merchant_id, id),
  -- FKs compuestas: imposible mezclar tenants (cliente de A con programa de B).
  constraint cards_customer_fk foreign key (merchant_id, customer_id)
    references public.customers (merchant_id, id) on delete cascade,
  constraint cards_program_fk foreign key (merchant_id, program_id)
    references public.loyalty_programs (merchant_id, id) on delete restrict
);
create index cards_merchant_idx on public.customer_cards (merchant_id);
create index cards_program_idx  on public.customer_cards (program_id);
create trigger cards_updated_at before update on public.customer_cards
  for each row execute function app.set_updated_at();

create trigger programs_type_locked before update of type on public.loyalty_programs
  for each row execute function app.programs_type_locked();

-- ---------------------------------------------------------------------
-- 7. consents (prueba del consentimiento RGPD)
-- ---------------------------------------------------------------------
-- Un consentimiento = una finalidad. 'terms_privacy' es obligatorio para el alta;
-- 'marketing' es opcional y se registra SOLO si la casilla se marca (no hay fila
-- = no consentido). Retirar marketing = rellenar revoked_at (sin borrar la prueba).
create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  customer_id  uuid references public.customers(id) on delete set null, -- se desvincula al borrar
  purpose      text not null default 'terms_privacy',
  text_version text not null,
  granted      boolean not null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  ip           inet,            -- opcional; se pone a NULL en el borrado
  user_agent   text,            -- opcional; idem
  source       text not null default 'nfc_landing',
  constraint consents_text_fk foreign key (purpose, text_version)
    references public.consent_texts (purpose, version),
  constraint consents_granted_chk check (granted),    -- solo guardamos consentimientos dados
  constraint consents_purpose_chk check (purpose in ('terms_privacy','marketing')),
  constraint consents_ua_len_chk  check (user_agent is null or char_length(user_agent) <= 400)
);
-- Un consentimiento vigente por cliente y finalidad (historial via revoked_at).
create unique index consents_one_active_uidx on public.consents (customer_id, purpose)
  where revoked_at is null and customer_id is not null;
create index consents_customer_idx on public.consents (customer_id);
create index consents_merchant_idx on public.consents (merchant_id, granted_at desc);

-- ---------------------------------------------------------------------
-- 8. loyalty_ledger (movimientos inmutables) - LISTO, SIN USO EN MVP
-- ---------------------------------------------------------------------
create table public.loyalty_ledger (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null,
  card_id         uuid not null,
  kind            text not null,
  delta           integer not null,
  balance_after   integer not null,
  amount_cents    integer,               -- importe de compra (kind=earn_points)
  idempotency_key text not null,         -- reintentos de red no duplican
  reverses_id     uuid references public.loyalty_ledger(id) on delete cascade,
  performed_by    uuid,                  -- auth.uid(); SIN FK a proposito (ledger inmutable)
  note            text,
  created_at      timestamptz not null default now(),
  constraint ledger_kind_chk check (kind in ('earn_visit','earn_points','redeem','adjust','reversal')),
  constraint ledger_delta_chk check (
       (kind in ('earn_visit','earn_points') and delta > 0)
    or (kind = 'redeem' and delta < 0)
    or (kind in ('adjust','reversal') and delta <> 0)),
  constraint ledger_reversal_chk check ((kind = 'reversal') = (reverses_id is not null)),
  constraint ledger_amount_chk check (amount_cents is null or (kind = 'earn_points' and amount_cents > 0)),
  constraint ledger_balance_chk check (balance_after >= 0),
  constraint ledger_card_fk foreign key (merchant_id, card_id)
    references public.customer_cards (merchant_id, id) on delete cascade,
  constraint ledger_idem_uq unique (merchant_id, idempotency_key)
);
create index ledger_card_created_idx on public.loyalty_ledger (card_id, created_at desc);
create index ledger_merchant_created_idx on public.loyalty_ledger (merchant_id, created_at desc);
-- Una reversion por movimiento.
create unique index ledger_one_reversal_uidx on public.loyalty_ledger (reverses_id) where reverses_id is not null;
-- Ventana antifraude de visitas.
create index ledger_visits_idx on public.loyalty_ledger (card_id, created_at desc) where kind = 'earn_visit';

create trigger ledger_append_only before update or delete on public.loyalty_ledger
  for each row execute function app.forbid_mutation();
create trigger ledger_no_truncate before truncate on public.loyalty_ledger
  for each statement execute function app.forbid_mutation();

-- ---------------------------------------------------------------------
-- 9. Pases de wallet (SOLO service_role)
--    Pase WEB (/p/:token): NO necesita fila aqui; el token publico es
--    customer_cards.public_id (uuid aleatorio, 122 bits) y se resuelve con
--    get_public_pass(token). El QR del pase web y de Google codifica ese token.
--    Google Wallet: google_object_id = '<issuerId>.<customer_cards.public_id>'
--    (lo calcula la Edge Function; aqui queda unico y se usa para actualizar/expirar).
--    Apple Wallet: APARCADO. Columnas apple_* y apple_pass_registrations quedan
--    SIN USO en el MVP (se conservan para no migrar al retomarlo).
-- ---------------------------------------------------------------------
create table public.wallet_passes (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null,
  card_id           uuid not null,
  platform          text not null,
  -- Apple
  apple_pass_type_id text,
  apple_serial       text,
  apple_auth_token   text,     -- secreto (cabecera ApplePass); NUNCA exponer a clientes
  -- Google
  google_object_id   text,     -- '<issuerId>.<sufijo>'
  last_changed_at    timestamptz not null default now(), -- base de passesUpdatedSince / tag
  created_at         timestamptz not null default now(),
  constraint passes_platform_chk check (platform in ('apple','google')),
  constraint passes_fields_chk check (
    (platform = 'apple'  and apple_pass_type_id is not null and apple_serial is not null
        and apple_auth_token is not null and char_length(apple_auth_token) >= 16
        and google_object_id is null)
    or
    (platform = 'google' and google_object_id is not null
        and apple_pass_type_id is null and apple_serial is null and apple_auth_token is null)),
  constraint passes_card_fk foreign key (merchant_id, card_id)
    references public.customer_cards (merchant_id, id) on delete cascade,
  constraint passes_card_platform_uq unique (card_id, platform)   -- idempotencia de emision
);
create unique index passes_apple_serial_uidx on public.wallet_passes (apple_pass_type_id, apple_serial)
  where platform = 'apple';
create unique index passes_google_object_uidx on public.wallet_passes (google_object_id)
  where platform = 'google';

create table public.apple_pass_registrations (
  id                        uuid primary key default gen_random_uuid(),
  pass_id                   uuid not null references public.wallet_passes(id) on delete cascade,
  device_library_identifier text not null,
  push_token                text not null,
  created_at                timestamptz not null default now(),
  constraint apple_reg_uq unique (pass_id, device_library_identifier)
);
create index apple_reg_device_idx on public.apple_pass_registrations (device_library_identifier);

-- Cola de pases a invalidar tras un borrado RGPD. Sin PII ni enlace al cliente.
create table public.revoked_passes (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null check (platform in ('apple','google')),
  apple_pass_type_id text,
  apple_serial     text,
  apple_auth_token text,
  push_tokens      text[],      -- se vacia al procesar
  google_object_id text,
  revoked_at       timestamptz not null default now(),
  processed_at     timestamptz   -- purgar filas procesadas > 30 dias
);
create index revoked_pending_idx on public.revoked_passes (revoked_at) where processed_at is null;

-- Registro de borrados (prueba de que se atendio el derecho; sin PII).
create table public.erasure_log (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,       -- sin FK: sobrevive al comercio
  erased_at   timestamptz not null default now(),
  requested_by uuid,               -- auth.uid() del dueno (NULL si service_role)
  scope        text not null default 'customer',
  constraint erasure_log_scope_chk check (scope in ('customer','merchant'))
);
create index erasure_log_merchant_idx on public.erasure_log (merchant_id, erased_at desc);

-- ---------------------------------------------------------------------
-- 10. RLS + privilegios
-- ---------------------------------------------------------------------
alter table public.merchants                enable row level security;
alter table public.merchant_members         enable row level security;
alter table public.loyalty_programs         enable row level security;
alter table public.consent_texts            enable row level security;
alter table public.customers                enable row level security;
alter table public.customer_cards           enable row level security;
alter table public.consents                 enable row level security;
alter table public.loyalty_ledger           enable row level security;
alter table public.wallet_passes            enable row level security;
alter table public.apple_pass_registrations enable row level security;
alter table public.revoked_passes           enable row level security;
alter table public.erasure_log              enable row level security;
-- (No usamos FORCE RLS: las funciones SECURITY DEFINER del owner deben poder operar.)

-- Cierre total y reapertura minima.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.merchants, public.merchant_members, public.loyalty_programs,
                public.consent_texts, public.customers, public.customer_cards,
                public.consents, public.loyalty_ledger to authenticated;
grant update (name, legal_name, tax_id, privacy_email) on public.merchants to authenticated;
grant insert (merchant_id, type, threshold, points_per_currency, reward_description,
              visit_cooldown_minutes, card_name, brand_color, logo_path, status)
      on public.loyalty_programs to authenticated;
grant update (type, threshold, points_per_currency, reward_description,
              visit_cooldown_minutes, card_name, brand_color, logo_path, status)
      on public.loyalty_programs to authenticated;
-- wallet_passes / apple_pass_registrations / revoked_passes / erasure_log:
-- sin grants a authenticated => solo service_role.

-- merchants: ver el propio; editar datos (no slug) solo owner. Insert via RPC.
create policy merchants_select on public.merchants for select to authenticated
  using (id in (select app.my_merchant_ids()));
create policy merchants_update on public.merchants for update to authenticated
  using (id in (select app.my_merchant_ids(array['owner'])))
  with check (id in (select app.my_merchant_ids(array['owner'])));

-- merchant_members: cada uno ve solo sus filas. Sin escritura directa.
create policy members_select on public.merchant_members for select to authenticated
  using (user_id = (select auth.uid()));

-- loyalty_programs: lectura miembros; escritura owner. Sin DELETE (se archiva).
create policy programs_select on public.loyalty_programs for select to authenticated
  using (merchant_id in (select app.my_merchant_ids()));
create policy programs_insert on public.loyalty_programs for insert to authenticated
  with check (merchant_id in (select app.my_merchant_ids(array['owner'])));
create policy programs_update on public.loyalty_programs for update to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])))
  with check (merchant_id in (select app.my_merchant_ids(array['owner'])));

-- consent_texts: legibles por usuarios autenticados (el anonimo los recibe via RPC).
create policy consent_texts_select on public.consent_texts for select to authenticated
  using (true);

-- Datos de cliente: solo lectura para el owner del comercio. Escritura solo
-- por RPC (enroll_customer / erase_customer) o service_role.
create policy customers_select on public.customers for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));
create policy cards_select on public.customer_cards for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));
create policy consents_select on public.consents for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));
create policy ledger_select on public.loyalty_ledger for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));

-- ---------------------------------------------------------------------
-- 11. RPC
-- ---------------------------------------------------------------------

-- 11.1 create_merchant: alta atomica de comercio + membresia owner.
create or replace function public.create_merchant(
  p_name text, p_slug text, p_legal_name text default null, p_privacy_email text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.merchant_members where user_id = v_uid and role = 'owner') then
    raise exception 'merchant_already_exists' using errcode = '23505';
  end if;
  insert into public.merchants (slug, name, legal_name, privacy_email)
  values (lower(btrim(p_slug)), btrim(p_name), nullif(btrim(p_legal_name), ''), nullif(btrim(p_privacy_email), ''))
  returning id into v_id;                   -- slug duplicado => unique_violation
  insert into public.merchant_members (merchant_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;
revoke all on function public.create_merchant(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_merchant(text,text,text,text) to authenticated;

-- 11.2 get_public_merchant: datos MINIMOS para pintar la landing /c/:slug.
--      Unica funcion ejecutable por anon. No devuelve ids internos.
create or replace function public.get_public_merchant(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'slug', m.slug, 'name', m.name, 'legal_name', m.legal_name, 'privacy_email', m.privacy_email,
    'card', jsonb_build_object(
      'card_name', p.card_name, 'type', p.type, 'threshold', p.threshold,
      'reward_description', p.reward_description, 'brand_color', p.brand_color, 'logo_path', p.logo_path),
    -- Dos textos independientes: el obligatorio y el de marketing (casilla aparte).
    'consents', jsonb_build_object(
      'terms_privacy', (select jsonb_build_object('version', ct.version, 'body', ct.body)
                        from public.consent_texts ct where ct.purpose = 'terms_privacy'
                        order by ct.published_at desc limit 1),
      'marketing',     (select jsonb_build_object('version', ct.version, 'body', ct.body)
                        from public.consent_texts ct where ct.purpose = 'marketing'
                        order by ct.published_at desc limit 1)))
  from public.merchants m
  join public.loyalty_programs p on p.merchant_id = m.id and p.status = 'active'
  where m.slug = lower(btrim(p_slug))
$$;
revoke all on function public.get_public_merchant(text) from public, anon, authenticated;
grant execute on function public.get_public_merchant(text) to anon, authenticated, service_role;

-- 11.3 enroll_customer: alta publica, idempotente. SOLO service_role
--      (Edge Function: valida Turnstile/rate-limit, normaliza el telefono con
--      libphonenumber aplicando pais por defecto ES (+34) -ESA logica vive en la
--      Edge Function, no aqui; esta funcion exige E.164 ya completo-, captura IP,
--      y despues emite el pase).
--      Consentimientos SEPARADOS: terms_privacy obligatorio; marketing opcional.
--      Respuesta (jsonb), siempre con 'status':
--        created            -> cliente nuevo: card_id, card_public_id (token del pase),
--                              balance, program_id, card{...}, marketing_opt_in
--        existing           -> email Y telefono del MISMO cliente: mismos campos que
--                              created (credencial para re-emitir/reofrecer el pase)
--        already_registered -> coincide solo uno / clientes distintos: SIN datos
create or replace function public.enroll_customer(
  p_slug text, p_full_name text, p_email text, p_phone_e164 text,
  p_terms_accepted boolean, p_terms_version text,
  p_marketing_opt_in boolean default false, p_marketing_version text default null,
  p_ip inet default null, p_user_agent text default null)
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
  -- Validaciones (errores = excepcion con codigo en el mensaje)
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

  select m.id, p.id into v_merchant_id, v_program_id
  from public.merchants m
  join public.loyalty_programs p on p.merchant_id = m.id and p.status = 'active'
  where m.slug = lower(btrim(p_slug));
  if v_merchant_id is null then raise exception 'merchant_not_found' using errcode = 'P0002'; end if;

  -- Serializa altas concurrentes que compartan email o telefono. Los locks se
  -- toman en orden fijo para evitar deadlocks.
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
    -- Solo coincide uno de los dos (o apuntan a clientes distintos): NO se
    -- entrega ningun dato ni pase (evita secuestro de tarjeta con solo el email).
    return jsonb_build_object('status', 'already_registered');
  end if;

  -- Marketing: fila propia solo si marco la casilla; idempotente (indice parcial).
  if v_marketing then
    insert into public.consents (merchant_id, customer_id, purpose, text_version, granted, ip, user_agent)
    values (v_merchant_id, v_customer_id, 'marketing', p_marketing_version, true, p_ip, left(p_user_agent, 400))
    on conflict (customer_id, purpose) where revoked_at is null and customer_id is not null do nothing;
  end if;

  insert into public.customer_cards (merchant_id, customer_id, program_id)
  values (v_merchant_id, v_customer_id, v_program_id)
  on conflict (customer_id, program_id) do nothing;

  select id, public_id, balance into v_card_id, v_card_public, v_balance
  from public.customer_cards where customer_id = v_customer_id and program_id = v_program_id;

  -- Datos visibles de la tarjeta para que la Edge Function emita el pase sin otra consulta.
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
revoke all on function public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text) from public, anon, authenticated;
grant execute on function public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text) to service_role;

-- 11.3b get_public_pass: datos del pase web /p/:token (QR). Ejecutable por anon.
--       El token (customer_cards.public_id) es una capacidad: uuid aleatorio, no
--       enumerable. No devuelve ids internos, nombre, email ni telefono.
--       Token inexistente o cliente borrado => NULL (el pase deja de resolverse).
create or replace function public.get_public_pass(p_token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'token', cc.public_id, 'balance', cc.balance, 'status', cc.status,
    'merchant_name', m.name, 'slug', m.slug,
    'card', jsonb_build_object('card_name', p.card_name, 'type', p.type, 'threshold', p.threshold,
            'reward_description', p.reward_description, 'brand_color', p.brand_color, 'logo_path', p.logo_path))
  from public.customer_cards cc
  join public.loyalty_programs p on p.id = cc.program_id
  join public.merchants m on m.id = cc.merchant_id
  where cc.public_id = p_token
$$;
revoke all on function public.get_public_pass(uuid) from public, anon, authenticated;
grant execute on function public.get_public_pass(uuid) to anon, authenticated, service_role;

-- 11.4 erase_customer: derecho al olvido (borrado real). El dueno lo invoca.
create or replace function public.erase_customer(p_customer_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_merchant_id uuid;
begin
  select merchant_id into v_merchant_id from public.customers where id = p_customer_id;
  if v_merchant_id is null
     or v_merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';  -- mismo error: no filtra existencia
  end if;

  -- 1) Encolar pases para invalidar (sin PII).
  insert into public.revoked_passes (platform, apple_pass_type_id, apple_serial, apple_auth_token,
                                     push_tokens, google_object_id)
  select wp.platform, wp.apple_pass_type_id, wp.apple_serial, wp.apple_auth_token,
         (select array_agg(r.push_token) from public.apple_pass_registrations r where r.pass_id = wp.id),
         wp.google_object_id
  from public.wallet_passes wp
  join public.customer_cards cc on cc.id = wp.card_id
  where cc.customer_id = p_customer_id;

  -- 2) Consentimientos: se conserva solo evidencia sin identificar (version+fecha+comercio).
  update public.consents set ip = null, user_agent = null where customer_id = p_customer_id;

  -- 3) Borrado en cascada (cards, ledger, wallet_passes, registrations). El ledger
  --    inmutable solo admite DELETE con este flag, valido unicamente en esta tx.
  perform set_config('app.allow_erasure', 'on', true);
  delete from public.customers where id = p_customer_id;  -- consents.customer_id => NULL
  perform set_config('app.allow_erasure', 'off', true);

  insert into public.erasure_log (merchant_id, requested_by)
  values (v_merchant_id, (select auth.uid()));
end $$;
revoke all on function public.erase_customer(uuid) from public, anon, authenticated;
grant execute on function public.erase_customer(uuid) to authenticated, service_role;

-- 11.5 erase_merchant: baja completa de un comercio y TODOS sus datos (clientes,
--      tarjetas, ledger, pases, consentimientos, programas, membresias).
--      Solo el owner del comercio (confirmando el slug) o service_role.
--      NO borra auth.users del owner ni los ficheros de storage: la Edge Function
--      de baja debe borrar la carpeta merchant-logos/<id>/ con la Storage API
--      (borrar filas de storage.objects dejaria huerfanos los binarios) y, si
--      procede, el usuario auth. Mismo error si no existe o no hay permiso.
create or replace function public.erase_merchant(p_merchant_id uuid, p_confirm_slug text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_service boolean := coalesce((select auth.role()), '') = 'service_role';
  v_slug text;
  v_customers integer;
begin
  select m.slug into v_slug from public.merchants m where m.id = p_merchant_id;
  if v_slug is null
     or not (v_is_service or p_merchant_id in (select app.my_merchant_ids(array['owner'])))
     or v_slug is distinct from lower(btrim(coalesce(p_confirm_slug, ''))) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  -- 1) Encolar todos los pases para invalidar (sin PII).
  insert into public.revoked_passes (platform, apple_pass_type_id, apple_serial, apple_auth_token,
                                     push_tokens, google_object_id)
  select wp.platform, wp.apple_pass_type_id, wp.apple_serial, wp.apple_auth_token,
         (select array_agg(r.push_token) from public.apple_pass_registrations r where r.pass_id = wp.id),
         wp.google_object_id
  from public.wallet_passes wp
  where wp.merchant_id = p_merchant_id;

  -- 2) Borrado explicito en orden (cards_program_fk es RESTRICT: primero clientes
  --    -> tarjetas -> ledger/pases, luego el comercio, que arrastra programas,
  --    consentimientos y membresias por cascada). El flag permite DELETE en el
  --    ledger append-only solo dentro de esta transaccion.
  perform set_config('app.allow_erasure', 'on', true);
  delete from public.customers where merchant_id = p_merchant_id;
  get diagnostics v_customers = row_count;
  delete from public.merchants where id = p_merchant_id;
  perform set_config('app.allow_erasure', 'off', true);

  insert into public.erasure_log (merchant_id, requested_by, scope)
  values (p_merchant_id, (select auth.uid()), 'merchant');

  return jsonb_build_object('customers_erased', v_customers);
end $$;
revoke all on function public.erase_merchant(uuid,text) from public, anon, authenticated;
grant execute on function public.erase_merchant(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. Storage: logos de tarjeta (bucket publico de LECTURA; escritura por carpeta)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-logos', 'merchant-logos', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Ruta obligatoria: <merchant_id>/<fichero>
create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'merchant-logos'
         and (storage.foldername(name))[1] in (select m::text from app.my_merchant_ids(array['owner']) m));
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'merchant-logos'
         and (storage.foldername(name))[1] in (select m::text from app.my_merchant_ids(array['owner']) m));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'merchant-logos'
         and (storage.foldername(name))[1] in (select m::text from app.my_merchant_ids(array['owner']) m));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'merchant-logos'
         and (storage.foldername(name))[1] in (select m::text from app.my_merchant_ids(array['owner']) m));

commit;

-- =====================================================================
-- DOWN (rollback manual; ejecutar en este orden). Destruye datos.
-- =====================================================================
-- begin;
-- drop policy if exists logos_select on storage.objects;
-- drop policy if exists logos_insert on storage.objects;
-- drop policy if exists logos_update on storage.objects;
-- drop policy if exists logos_delete on storage.objects;
-- delete from storage.buckets where id = 'merchant-logos';
-- drop function if exists public.erase_merchant(uuid,text);
-- drop function if exists public.erase_customer(uuid);
-- drop function if exists public.get_public_pass(uuid);
-- drop function if exists public.enroll_customer(text,text,text,text,boolean,text,boolean,text,inet,text);
-- drop function if exists public.get_public_merchant(text);
-- drop function if exists public.create_merchant(text,text,text,text);
-- drop table if exists public.erasure_log, public.revoked_passes, public.apple_pass_registrations,
--   public.wallet_passes, public.loyalty_ledger, public.consents, public.customer_cards,
--   public.customers, public.consent_texts, public.loyalty_programs,
--   public.merchant_members, public.merchants cascade;
-- drop function if exists app.programs_type_locked(), app.merchants_slug_immutable(),
--   app.consent_texts_hash(), app.forbid_mutation(), app.set_updated_at(), app.my_merchant_ids(text[]);
-- drop schema if exists app;
-- commit;
