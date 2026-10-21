-- 0005: un solo codigo de caja. register_visit suma la visita y, si con ella se completa el
-- umbral, canjea el premio en la misma operacion y reinicia el saldo (el comercio ve la
-- pantalla del cliente y le entrega el premio). Se elimina redeem_reward y el codigo de canje.
-- Libro: dos movimientos (earn_visit +1 y redeem -umbral). result 'reward_earned'.

drop function if exists public.redeem_reward(text, uuid);

create or replace function public.register_visit(p_slug text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_card public.customer_cards%rowtype;
  v_prog public.loyalty_programs%rowtype;
  v_last timestamptz;
  v_wait integer;
  v_balance integer;
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
  if v_prog.status <> 'active' or v_prog.type <> 'visits' then
    return jsonb_build_object('result', 'not_supported');
  end if;

  if v_prog.visit_cooldown_minutes > 0 then
    select max(created_at) into v_last from public.loyalty_ledger
     where card_id = v_card.id and kind = 'earn_visit';
    if v_last is not null and v_last > now() - make_interval(mins => v_prog.visit_cooldown_minutes) then
      v_wait := ceil(extract(epoch from (v_last + make_interval(mins => v_prog.visit_cooldown_minutes) - now())));
      return jsonb_build_object('result', 'cooldown', 'balance', v_card.balance,
                                'threshold', v_prog.threshold, 'retry_after', v_wait);
    end if;
  end if;

  v_balance := v_card.balance + 1;
  insert into public.loyalty_ledger (merchant_id, card_id, kind, delta, balance_after, idempotency_key)
    values (v_card.merchant_id, v_card.id, 'earn_visit', 1, v_balance, gen_random_uuid()::text);

  if v_balance >= v_prog.threshold then
    v_balance := v_balance - v_prog.threshold;
    insert into public.loyalty_ledger (merchant_id, card_id, kind, delta, balance_after, idempotency_key)
      values (v_card.merchant_id, v_card.id, 'redeem', -v_prog.threshold, v_balance, gen_random_uuid()::text);
  end if;

  update public.customer_cards set balance = v_balance, last_movement_at = now() where id = v_card.id;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;

  if v_balance = v_card.balance + 1 then
    return jsonb_build_object('result', 'visit_added', 'balance', v_balance, 'threshold', v_prog.threshold,
                              'reward', v_prog.reward_description);
  end if;
  return jsonb_build_object('result', 'reward_earned', 'balance', v_balance, 'threshold', v_prog.threshold,
                            'reward', v_prog.reward_description);
end
$$;
revoke all on function public.register_visit(text, uuid) from public, anon, authenticated;
grant execute on function public.register_visit(text, uuid) to service_role;
