-- 0006: tarjetas de PUNTOS por pase. En vez de "puntos por euro" (el QR fijo no sabe el importe),
-- el comercio define cuantos puntos suma cada pase por el QR/NFC de caja (points_per_visit).
--  * points_per_visit: entero 1..1000, solo tipo 'points' (NULL en 'visits').
--  * points_per_currency queda en desuso (nullable, se vacia).
--  * register_visit sirve para ambos tipos: visits suma 1 (earn_visit); points suma
--    points_per_visit (earn_points). Al alcanzar el umbral canjea y descuenta el umbral
--    (en puntos el sobrante se conserva). result: visit_added | reward_earned | cooldown | not_supported
--    con 'type' y 'gained' para la pantalla del cliente y el pase de Wallet.

alter table public.loyalty_programs add column if not exists points_per_visit integer;

-- Primero se quitan las reglas antiguas; si no, vaciar points_per_currency las violaria.
alter table public.loyalty_programs drop constraint if exists programs_ppc_chk;
alter table public.loyalty_programs drop constraint if exists programs_ppv_chk;

update public.loyalty_programs set points_per_visit = 1
 where type = 'points' and points_per_visit is null;
update public.loyalty_programs set points_per_currency = null;

alter table public.loyalty_programs add constraint programs_ppv_chk check (
     (type = 'points' and points_per_visit between 1 and 1000)
  or (type = 'visits' and points_per_visit is null));

grant insert (points_per_visit) on public.loyalty_programs to authenticated;
grant update (points_per_visit) on public.loyalty_programs to authenticated;

create or replace function public.register_visit(p_slug text, p_token uuid)
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
    'reward', v_prog.reward_description);
end
$$;
revoke all on function public.register_visit(text, uuid) from public, anon, authenticated;
grant execute on function public.register_visit(text, uuid) to service_role;
