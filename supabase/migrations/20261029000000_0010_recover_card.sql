-- 0010: Recuperar tarjeta. El cliente perdio el pase (movil nuevo, borro la Wallet...) y en /v/:slug
-- escribe email + telefono. Si AMBOS son del MISMO cliente de este comercio, se le devuelve el token
-- de su tarjeta (misma regla que la re-emision de enroll_customer). Si no, NULL (respuesta generica).
--  * SOLO service_role: la Edge Function recover-card pone Turnstile + rate limit delante.
--  * No crea nada ni registra consentimientos: solo lee.

create or replace function public.recover_card(p_slug text, p_email text, p_phone_e164 text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select cc.public_id
  from public.merchants m
  join public.loyalty_programs p on p.merchant_id = m.id and p.status = 'active'
  join public.customers c on c.merchant_id = m.id
   and c.email = lower(btrim(coalesce(p_email, '')))
   and c.phone_e164 = regexp_replace(coalesce(p_phone_e164, ''), '[\s().-]', '', 'g')
  join public.customer_cards cc on cc.customer_id = c.id and cc.program_id = p.id
  where m.slug = lower(btrim(p_slug))
$$;
revoke all on function public.recover_card(text, text, text) from public, anon, authenticated;
grant execute on function public.recover_card(text, text, text) to service_role;
