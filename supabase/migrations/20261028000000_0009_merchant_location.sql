-- 0009: Ubicacion del comercio. Direccion postal + coordenadas (lat/lng).
--  * Hoy: el pase web /p/:token muestra la direccion y un enlace a Maps.
--  * Despues (Fase D): Apple Wallet usara latitude/longitude en pass.json `locations`
--    para mostrar el pase en la pantalla de bloqueo al acercarse al comercio.
--  * Coordenadas: ambas o ninguna. Las rellena el panel (geocodificacion o GPS del comercio).

alter table public.merchants
  add column if not exists address   text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

alter table public.merchants
  drop constraint if exists merchants_address_chk,
  add constraint merchants_address_chk
    check (address is null or char_length(btrim(address)) between 5 and 200),
  drop constraint if exists merchants_coords_chk,
  add constraint merchants_coords_chk
    check ((latitude is null) = (longitude is null)
           and (latitude is null or latitude between -90 and 90)
           and (longitude is null or longitude between -180 and 180));

grant update (address, latitude, longitude) on public.merchants to authenticated;

-- get_public_pass: misma firma; anade 'location' (null si no hay direccion).
create or replace function public.get_public_pass(p_token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'token', cc.public_id, 'balance', cc.balance, 'status', cc.status,
    'merchant_name', m.name, 'slug', m.slug,
    'card', jsonb_build_object('card_name', p.card_name, 'type', p.type, 'threshold', p.threshold,
            'reward_description', p.reward_description, 'brand_color', p.brand_color, 'logo_path', p.logo_path),
    'location', case when m.address is null then null else
                  jsonb_build_object('address', m.address, 'latitude', m.latitude, 'longitude', m.longitude) end)
  from public.customer_cards cc
  join public.loyalty_programs p on p.id = cc.program_id
  join public.merchants m on m.id = cc.merchant_id
  where cc.public_id = p_token
$$;
revoke all on function public.get_public_pass(uuid) from public, anon, authenticated;
grant execute on function public.get_public_pass(uuid) to anon, authenticated, service_role;
