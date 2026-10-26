-- 0015: El owner edita email Y telefono de un cliente desde su ficha (cliente que cambio de
-- correo o de numero). Sustituye en la UI a update_customer_phone (0011, se conserva).
--  * Solo owner del comercio del cliente (mismo error si no existe o no es suyo).
--  * Email normalizado lower(btrim()) y telefono E.164, con las mismas reglas que customers_*_chk.
--  * Email o telefono ya usados por OTRO cliente del comercio => 'email_taken' / 'phone_taken'.
--  * Solo cambia lo que se manda distinto; devuelve {email, phone} ya guardados.

create or replace function public.update_customer_contact(
  p_customer_id uuid, p_email text, p_phone_e164 text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone_e164, ''), '[\s().-]', '', 'g');
begin
  select merchant_id into v_merchant_id from public.customers where id = p_customer_id;
  if v_merchant_id is null
     or v_merchant_id not in (select app.my_merchant_ids(array['owner'])) then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if exists (select 1 from public.customers
             where merchant_id = v_merchant_id and email = v_email and id <> p_customer_id) then
    raise exception 'email_taken' using errcode = '23505';
  end if;
  if exists (select 1 from public.customers
             where merchant_id = v_merchant_id and phone_e164 = v_phone and id <> p_customer_id) then
    raise exception 'phone_taken' using errcode = '23505';
  end if;

  update public.customers set email = v_email, phone_e164 = v_phone where id = p_customer_id;
  return jsonb_build_object('email', v_email, 'phone', v_phone);
end $$;
revoke all on function public.update_customer_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_customer_contact(uuid, text, text) to authenticated;
