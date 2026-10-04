-- Shabat, parashá de la semana y créditos de IA (20261003_recompensas.sql).
\set ON_ERROR_STOP on
create function pg_temp.eq(a anyelement, b anyelement, msg text) returns void language plpgsql as
$$ begin if a is distinct from b then raise exception 'FALLA %: esperado %, obtuve %', msg, b, a; end if; end $$;
create function pg_temp.at(ts text) returns void language sql as $$ select set_config('kodesh.fake_now', ts, false) $$;
create function pg_temp.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', u::text, false) $$;
create function pg_temp.read(u uuid, b text, c int) returns void language sql as
$$ insert into public.reading_progress (user_id, book_id, chapter) values (u, b, c) on conflict do nothing $$;
create function pg_temp.st(u uuid) returns public.reading_streaks language sql as $$ select * from public.reading_streaks where user_id = u $$;

insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3');
insert into public.user_profiles (id, reading_goal_chapters) values
  ('00000000-0000-0000-0000-0000000000d1', 1), ('00000000-0000-0000-0000-0000000000d2', 1), ('00000000-0000-0000-0000-0000000000d3', 1);
\set D '\'00000000-0000-0000-0000-0000000000d1\'::uuid'
\set E '\'00000000-0000-0000-0000-0000000000d2\'::uuid'
\set F '\'00000000-0000-0000-0000-0000000000d3\'::uuid'

-- ── Shabat ──
-- Lee jue 15 y vie 16, no lee sáb 17, lee dom 18 → racha 3 sin protector
select pg_temp.at('2027-04-15 10:00-04'); select pg_temp.read(:D,'PSA',1);
select pg_temp.at('2027-04-16 10:00-04'); select pg_temp.read(:D,'PSA',2);
select pg_temp.at('2027-04-18 08:00-04');
select public.settle_all_streaks();
select pg_temp.eq((pg_temp.st(:D)).current_streak, 2, 'el sábado no rompe la racha');
select pg_temp.read(:D,'PSA',3);
select pg_temp.eq((pg_temp.st(:D)).current_streak, 3, 'continúa el domingo');
-- Leer en Shabat sí suma
select pg_temp.at('2027-04-19 10:00-04'); select pg_temp.read(:D,'PSA',4);
select pg_temp.at('2027-04-24 10:00-04'); select pg_temp.read(:D,'PSA',5);
select pg_temp.eq((pg_temp.st(:D)).current_streak, 1, 'perder entre semana sigue rompiendo');
select pg_temp.at('2027-04-25 10:00-04'); select pg_temp.read(:D,'PSA',6);
select pg_temp.eq((pg_temp.st(:D)).current_streak, 2, 'leer en Shabat cuenta como día');
-- Protector solo se gasta en días que no son sábado
update public.reading_streaks set shields = 1 where user_id = :D;
select pg_temp.at('2027-04-28 10:00-04'); select public.settle_all_streaks();
select pg_temp.eq((pg_temp.st(:D)).shields, 1, 'faltó lun 26 y mar 27: 1 protector no alcanza y no se gasta');
select pg_temp.eq((pg_temp.st(:D)).current_streak, 0, 'racha perdida');

-- ── Parashá de la semana: Bereshit, Shabat 10 oct 2026, semana 4-10 oct ──
select pg_temp.at('2026-10-05 10:00-04');
select pg_temp.read(:E,'GEN',1), pg_temp.read(:E,'GEN',2), pg_temp.read(:E,'GEN',3);
select pg_temp.as_user(:E);
select pg_temp.eq((public.get_my_streak_state(null)->'parasha'->>'read')::int, 3, 'progreso 3/6');
select pg_temp.eq((public.get_my_streak_state(null)->'parasha'->'names'->>0), 'Bereshit', 'nombre');
select pg_temp.at('2026-10-07 10:00-04');
select pg_temp.read(:E,'GEN',4), pg_temp.read(:E,'GEN',5);
select pg_temp.eq((select count(*)::int from public.mana_ledger where user_id=:E and reason='parasha'), 0, 'aún no completa');
select pg_temp.read(:E,'GEN',6);
select pg_temp.eq((select amount from public.mana_ledger where user_id=:E and reason='parasha'), 50, 'bono +50 al completar');
select pg_temp.eq((public.get_my_streak_state(null)->'notices'->-1->>'type'), 'parasha', 'aviso de parashá');
select pg_temp.eq((public.get_my_streak_state(null)->'parasha'->>'done')::bool, true, 'marcada como hecha');
-- No se repite el bono esa semana
select pg_temp.read(:E,'GEN',7);
select pg_temp.eq((select count(*)::int from public.mana_ledger where user_id=:E and reason='parasha'), 1, 'una sola vez');
-- Capítulos leídos la semana anterior no cuentan
select pg_temp.at('2026-10-12 10:00-04');
select pg_temp.eq((public.get_my_streak_state(null)->'parasha'->'names'->>0), 'Noach', 'semana siguiente: Noach');
select pg_temp.eq((public.get_my_streak_state(null)->'parasha'->>'read')::int, 0, 'empieza en 0 aunque GEN 6-7 se leyó antes');
-- Porción combinada vale +100 (Nitzavim-Vayelej, sáb 5 sept 2026; Dt 29-31)
select pg_temp.at('2026-08-31 10:00-04');
select pg_temp.read(:E,'DEU',29), pg_temp.read(:E,'DEU',30), pg_temp.read(:E,'DEU',31);
select pg_temp.eq((select amount from public.mana_ledger where user_id=:E and reason='parasha' and detail='2026-09-05'), 100, 'combinada +100');

-- ── Créditos de IA ──
insert into public.reading_streaks (user_id, mana) values (:F, 120)
  on conflict (user_id) do update set mana = 120;
insert into public.ai_usage (user_id, month, assistant_used) values (:F, to_char(now(),'YYYY-MM'), 3);
select pg_temp.eq((public.consume_ai_usage(:F,'assistant')->>'allowed')::bool, false, 'límite gratis (3) alcanzado');
select pg_temp.as_user(:F);
select pg_temp.eq((public.buy_ai_credit('assistant')->>'ok')::bool, true, 'compra crédito asistente');
select pg_temp.eq((pg_temp.st(:F)).mana, 70, 'cuesta 50 maná');
select pg_temp.eq((public.buy_ai_credit('assistant')->>'ok')::bool, true, 'segunda compra');
select pg_temp.eq(public.buy_ai_credit('assistant')->>'error', 'insufficient_mana', 'sin maná suficiente');
select pg_temp.eq((pg_temp.st(:F)).credits_assistant, 2, '2 créditos');
-- Se usa solo al pasar el límite
select pg_temp.eq((public.consume_ai_usage(:F,'assistant')->>'used_credit')::bool, true, 'consume crédito');
select pg_temp.eq((pg_temp.st(:F)).credits_assistant, 1, 'queda 1');
-- Si la IA falla, se devuelve el crédito
select public.release_ai_usage(:F,'assistant');
select pg_temp.eq((pg_temp.st(:F)).credits_assistant, 2, 'crédito devuelto');
select pg_temp.eq((select assistant_used from public.ai_usage where user_id=:F), 3, 'uso vuelve a 3');
-- Por debajo del límite no toca créditos
update public.ai_usage set assistant_used = 0 where user_id = :F;
select public.consume_ai_usage(:F,'assistant');
select pg_temp.eq((pg_temp.st(:F)).credits_assistant, 2, 'bajo el límite no gasta crédito');
select public.release_ai_usage(:F,'assistant');
select pg_temp.eq((pg_temp.st(:F)).credits_assistant, 2, 'release bajo el límite no regala crédito');
-- Máximo 10 y ledger
update public.reading_streaks set mana = 10000, credits_lexicon = 10 where user_id = :F;
select pg_temp.eq(public.buy_ai_credit('lexicon')->>'error', 'max_credits', 'máximo 10');
select pg_temp.eq((select sum(amount)::int from public.mana_ledger where user_id=:F and reason='ai_credit'), -100, 'ledger -100');
-- Seguridad
select pg_temp.eq(has_function_privilege('authenticated', 'public.consume_ai_usage(uuid,text)', 'execute'), false, 'consume no es público');
select pg_temp.eq(has_function_privilege('authenticated', 'public.buy_ai_credit(text)', 'execute'), true, 'buy_ai_credit para usuarios');
select pg_temp.eq(has_function_privilege('anon', 'public.buy_ai_credit(text)', 'execute'), false, 'anon no');

\echo 'RECOMPENSAS OK'
