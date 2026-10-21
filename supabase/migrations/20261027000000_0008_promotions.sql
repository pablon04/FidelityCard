-- 0008: Promocionar. El comercio escribe un mensaje (titulo, texto, codigo opcional) y lo envia
-- a clientes elegidos; llega como mensaje con notificacion en su tarjeta de Google Wallet.
--  * promotions: un envio. promotion_deliveries: resultado por cliente (sent | failed).
--  * Solo lee el owner (RLS); solo escribe service_role (Edge Function send-promotion).
--  * Sin tope de frecuencia todavia (se anadira junto al tiempo minimo entre pases).
--  * Consentimiento de marketing: la funcion lo exige si PROMO_REQUIRE_MARKETING_CONSENT=true.
--    En pruebas esta apagado; ACTIVARLO antes de enviar a clientes reales.

create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  title        text not null,
  body         text not null,
  code         text,
  sent_by      uuid,                      -- auth.uid() sin FK (el historial no depende del usuario)
  total        integer not null default 0,
  sent         integer not null default 0,
  failed       integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint promotions_title_chk check (char_length(btrim(title)) between 1 and 60),
  constraint promotions_body_chk  check (char_length(btrim(body)) between 1 and 300),
  constraint promotions_code_chk  check (code is null or char_length(btrim(code)) between 1 and 30)
);
create index if not exists promotions_merchant_created_idx on public.promotions (merchant_id, created_at desc);

create table if not exists public.promotion_deliveries (
  id            uuid primary key default gen_random_uuid(),
  promotion_id  uuid not null references public.promotions(id) on delete cascade,
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  status        text not null,
  error_code    text,
  created_at    timestamptz not null default now(),
  constraint deliveries_status_chk check (status in ('sent', 'failed', 'skipped'))
);
create index if not exists deliveries_promotion_idx on public.promotion_deliveries (promotion_id);
create index if not exists deliveries_customer_idx on public.promotion_deliveries (customer_id, created_at desc);

alter table public.promotions enable row level security;
alter table public.promotion_deliveries enable row level security;

drop policy if exists promotions_select on public.promotions;
create policy promotions_select on public.promotions for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));
drop policy if exists deliveries_select on public.promotion_deliveries;
create policy deliveries_select on public.promotion_deliveries for select to authenticated
  using (merchant_id in (select app.my_merchant_ids(array['owner'])));

revoke all on public.promotions, public.promotion_deliveries from public, anon, authenticated;
grant select on public.promotions, public.promotion_deliveries to authenticated;
grant all on public.promotions, public.promotion_deliveries to service_role;
