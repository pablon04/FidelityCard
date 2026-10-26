-- 0016: el comercio puede fijar el tiempo minimo entre pases hasta 1 semana (antes 24 h).
-- visit_cooldown_minutes: 0 = sin restriccion, maximo 10080 (7 dias).
alter table public.loyalty_programs drop constraint if exists programs_cooldown_chk;
alter table public.loyalty_programs
  add constraint programs_cooldown_chk check (visit_cooldown_minutes between 0 and 10080);
