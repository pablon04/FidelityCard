-- 0004: visitas y canje con QR/NFC (el cliente escanea con su movil; sin login).
--  * customers.last_visit_at: ultima vez que paso la tarjeta (visita o canje). Permite
--    ordenar/filtrar clientes sin joins. Se rellena SOLO desde register_visit/redeem_reward.
--  * register_visit / redeem_reward: SECURITY DEFINER, solo service_role (las llama la Edge
--    Function card-action tras rate limit). Bloquean la tarjeta (FOR UPDATE): sin carreras.
--  * Anti-doble-escaneo: loyalty_programs.visit_cooldown_minutes (0 = sin limite).
--    PRUEBAS: se pone a 0 en los programas existentes. Para produccion (4 h):
--      update public.loyalty_programs set visit_cooldown_minutes = 240;
--    (el limite de la columna es 1440 = 24 h).
-- Retorno: jsonb { result, balance, threshold, ... }. result:
--   visit_added | cooldown | reward_ready (visita que alcanza el umbral, tambien visit_added)
--   redeemed | not_enough | not_found | not_supported

alter table public.customers add column if not exists last_visit_at timestamptz;
create index if not exists customers_merchant_last_visit_idx
  on public.customers (merchant_id, last_visit_at desc nulls last);

-- Backfill: ultimo movimiento del libro (si lo hubiera).
update public.customers c set last_visit_at = s.last_at
from (select cc.customer_id, max(l.created_at) as last_at
        from public.loyalty_ledger l join public.customer_cards cc on cc.id = l.card_id
       where l.kind in ('earn_visit','redeem') group by cc.customer_id) s
where c.id = s.customer_id and c.last_visit_at is null;

-- Pruebas: sin tiempo minimo entre visitas.
update public.loyalty_programs set visit_cooldown_minutes = 0;

-- ---------------------------------------------------------------------
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
  update public.customer_cards set balance = v_balance, last_movement_at = now() where id = v_card.id;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;

  return jsonb_build_object('result', 'visit_added', 'balance', v_balance, 'threshold', v_prog.threshold,
                            'reward_ready', v_balance >= v_prog.threshold,
                            'reward', v_prog.reward_description);
end
$$;
revoke all on function public.register_visit(text, uuid) from public, anon, authenticated;
grant execute on function public.register_visit(text, uuid) to service_role;

-- ---------------------------------------------------------------------
create or replace function public.redeem_reward(p_slug text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_card public.customer_cards%rowtype;
  v_prog public.loyalty_programs%rowtype;
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

  if v_card.balance < v_prog.threshold then
    return jsonb_build_object('result', 'not_enough', 'balance', v_card.balance,
                              'threshold', v_prog.threshold);
  end if;

  v_balance := v_card.balance - v_prog.threshold;
  insert into public.loyalty_ledger (merchant_id, card_id, kind, delta, balance_after, idempotency_key)
    values (v_card.merchant_id, v_card.id, 'redeem', -v_prog.threshold, v_balance, gen_random_uuid()::text);
  update public.customer_cards set balance = v_balance, last_movement_at = now() where id = v_card.id;
  update public.customers set last_visit_at = now() where id = v_card.customer_id;

  return jsonb_build_object('result', 'redeemed', 'balance', v_balance, 'threshold', v_prog.threshold,
                            'reward', v_prog.reward_description);
end
$$;
revoke all on function public.redeem_reward(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_reward(text, uuid) to service_role;
