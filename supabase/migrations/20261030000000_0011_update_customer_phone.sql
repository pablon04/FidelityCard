-- 0011: El owner cambia el telefono de un cliente desde el panel (cliente que cambio de numero
-- y por eso no puede recuperar su tarjeta con email + telefono, ver 0010).
--  * Solo owner del comercio del cliente (mismo error si no existe o no es suyo: no filtra existencia).
--  * E.164 obligatorio (el panel normaliza; aqui se revalida con customers_phone_chk).
--  * Telefono ya usado por OTRO cliente del mismo comercio => 'phone_taken'.

create or replace function public.update_customer_phone(p_customer_id uuid, p_phone_e164 text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone_e164, ''), '[\s().-]', '', 'g');
begin
  select merchant_id into v_merchant_id from public.customers where id = p_customer_id;
  if v_merchant_id is null
     or v_merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if exists (select 1 from public.customers
             where merchant_id = v_merchant_id and phone_e164 = v_phone and id <> p_customer_id) then
    raise exception 'phone_taken' using errcode = '23505';
  end if;

  update public.customers set phone_e164 = v_phone where id = p_customer_id;
  return v_phone;
end $$;
revoke all on function public.update_customer_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.update_customer_phone(uuid, text) to authenticated;
