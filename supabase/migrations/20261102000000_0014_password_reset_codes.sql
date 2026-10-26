-- =====================================================================
-- 0014 — Recuperacion de contrasena por codigo temporal (sin SMTP)
--   El equipo genera un codigo desde /admin (ficha del comercio) y se lo pasa al comercio.
--   El comercio lo canjea en /app/recuperar con su email (Edge Function reset-password).
--   Codigo: 8 caracteres aleatorios, caduca a los 10 min, un solo uso, max. 5 intentos.
--   En BD solo se guarda el hash (sha256 con user_id como sal), nunca el codigo.
-- =====================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.password_reset_codes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  merchant_id uuid        not null references public.merchants (id) on delete cascade,
  code_hash   text        not null,
  attempts    integer     not null default 0,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists password_reset_codes_user_idx
  on public.password_reset_codes (user_id, created_at desc);
alter table public.password_reset_codes enable row level security;   -- sin politicas: solo service_role / SECURITY DEFINER
revoke all on public.password_reset_codes from public, anon, authenticated;
grant all on public.password_reset_codes to service_role;

create or replace function app.reset_code_hash(p_user uuid, p_code text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_user::text || ':' || upper(btrim(p_code)), 'sha256'), 'hex')
$$;

-- Admin: genera un codigo nuevo para el propietario del comercio (invalida los anteriores).
create or replace function public.admin_create_password_reset(p_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid;
  v_email   text;
  v_alpha   constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 simbolos, sin 0/O/1/I
  v_bytes   bytea := extensions.gen_random_bytes(8);
  v_code    text := '';
  v_expires timestamptz := now() + interval '10 minutes';
  i         integer;
begin
  perform app.assert_admin();
  select mm.user_id, u.email into v_user, v_email
    from public.merchant_members mm join auth.users u on u.id = mm.user_id
   where mm.merchant_id = p_merchant_id and mm.role = 'owner'
   order by mm.created_at limit 1;
  if v_user is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  for i in 0..7 loop
    v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;

  update public.password_reset_codes set used_at = now() where user_id = v_user and used_at is null;
  insert into public.password_reset_codes (user_id, merchant_id, code_hash, expires_at, created_by)
  values (v_user, p_merchant_id, app.reset_code_hash(v_user, v_code), v_expires, auth.uid());

  return jsonb_build_object('code', v_code, 'expires_at', v_expires, 'email', v_email);
end $$;

-- Solo service_role (Edge Function reset-password). Devuelve el user_id si email+codigo son
-- validos y vigentes; si no, null. Cada fallo suma un intento; a los 5 el codigo muere.
-- p_consume=true marca el codigo como usado (paso final del cambio de contrasena).
create or replace function public.verify_password_reset(p_email text, p_code text, p_consume boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_row  public.password_reset_codes%rowtype;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return null; end if;

  select * into v_row from public.password_reset_codes
   where user_id = v_user and used_at is null and expires_at > now() and attempts < 5
   order by created_at desc limit 1
   for update;
  if not found then return null; end if;

  if v_row.code_hash <> app.reset_code_hash(v_user, p_code) then
    update public.password_reset_codes set attempts = attempts + 1 where id = v_row.id;
    return null;
  end if;

  if p_consume then
    update public.password_reset_codes set used_at = now() where id = v_row.id;
  end if;
  return v_user;
end $$;

revoke all on function public.admin_create_password_reset(uuid) from public, anon, authenticated;
grant execute on function public.admin_create_password_reset(uuid) to authenticated;
revoke all on function public.verify_password_reset(text, text, boolean) from public, anon, authenticated;
grant execute on function public.verify_password_reset(text, text, boolean) to service_role;

commit;
