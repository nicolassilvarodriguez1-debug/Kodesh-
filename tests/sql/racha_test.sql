-- Escenarios de racha/maná/protectores. Correr con tests/sql/run.sh.
\set ON_ERROR_STOP on
create function pg_temp.eq(a anyelement, b anyelement, msg text) returns void language plpgsql as
$$ begin if a is distinct from b then raise exception 'FALLA %: esperado %, obtuve %', msg, b, a; end if; end $$;
create function pg_temp.at(ts text) returns void language sql as
$$ select set_config('kodesh.fake_now', ts, false) $$;
create function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u::text, false) $$;
create function pg_temp.read(u uuid, b text, c int) returns void language sql as
$$ insert into public.reading_progress (user_id, book_id, chapter) values (u, b, c)
   on conflict (user_id, book_id, chapter) do nothing $$;
create function pg_temp.unread(u uuid, b text, c int) returns void language sql as
$$ delete from public.reading_progress where user_id = u and book_id = b and chapter = c $$;
create function pg_temp.st(u uuid) returns public.reading_streaks language sql as
$$ select * from public.reading_streaks where user_id = u $$;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.user_profiles (id, reading_goal_chapters) values
  ('00000000-0000-0000-0000-00000000000a', 2), ('00000000-0000-0000-0000-00000000000b', 1),
  ('00000000-0000-0000-0000-00000000000c', null);
\set A '\'00000000-0000-0000-0000-00000000000a\'::uuid'
\set B '\'00000000-0000-0000-0000-00000000000b\'::uuid'
\set C '\'00000000-0000-0000-0000-00000000000c\'::uuid'

-- 1. Primer día: 3 capítulos → racha 1, maná 30 + meta 20 = 50
select pg_temp.at('2026-10-01 10:00-04');
select pg_temp.read(:A,'GEN',1), pg_temp.read(:A,'GEN',2), pg_temp.read(:A,'GEN',3);
select pg_temp.eq((pg_temp.st(:A)).current_streak, 1, 'día 1 racha');
select pg_temp.eq((pg_temp.st(:A)).mana, 50, 'día 1 maná');

-- 2. Desmarcar y volver a marcar el mismo capítulo el mismo día no da maná
select pg_temp.unread(:A,'GEN',3); select pg_temp.read(:A,'GEN',3);
select pg_temp.eq((pg_temp.st(:A)).mana, 50, 'remarcar no suma');

-- 3. Tope de 5 capítulos con maná por día
select pg_temp.read(:A,'GEN',4), pg_temp.read(:A,'GEN',5), pg_temp.read(:A,'GEN',6), pg_temp.read(:A,'GEN',7);
select pg_temp.eq((pg_temp.st(:A)).mana, 70, 'tope 5 capítulos (50+20)');
select pg_temp.eq((select cardinality(chapters) from public.reading_days where user_id=:A and day='2026-10-01'), 7, '7 capítulos registrados');

-- 4. Día siguiente → racha 2; medianoche local (23:30 NY sigue siendo el día 2)
select pg_temp.at('2026-10-02 23:30-04');
select pg_temp.read(:A,'EXO',1);
select pg_temp.eq((pg_temp.st(:A)).current_streak, 2, 'día 2 racha');
select pg_temp.eq((pg_temp.st(:A)).last_read_date, '2026-10-02'::date, 'fecha local, no UTC');

-- 5. Faltó 1 día sin protector → el proceso horario pone la racha en 0 y deja aviso
--    (vie 2 → lun 5: el sáb 3 no cuenta, el dom 4 sí)
select pg_temp.at('2026-10-05 08:00-04');
select pg_temp.eq(public.settle_all_streaks(), 1, 'settle procesa 1 usuario');
select pg_temp.eq((pg_temp.st(:A)).current_streak, 0, 'racha perdida');
select pg_temp.eq((pg_temp.st(:A)).longest_streak, 2, 'mejor racha se conserva');
select pg_temp.as_user(:A);
select pg_temp.eq((public.get_my_streak_state(null)->'notices'->0->>'type'), 'streak_lost', 'aviso racha perdida');
select pg_temp.eq(jsonb_array_length(public.get_my_streak_state(null)->'notices'), 0, 'aviso se muestra una sola vez');

-- 6. Comprar protector: sin maná suficiente falla; con maná funciona; máximo 2
select pg_temp.eq(public.buy_streak_shield()->>'error', 'insufficient_mana', 'sin maná');
update public.reading_streaks set mana = 1000 where user_id = :A;
select pg_temp.eq((public.buy_streak_shield()->>'ok')::bool, true, 'compra 1');
select pg_temp.eq((public.buy_streak_shield()->>'ok')::bool, true, 'compra 2');
select pg_temp.eq(public.buy_streak_shield()->>'error', 'max_shields', 'máximo 2');
select pg_temp.eq((pg_temp.st(:A)).mana, 600, 'maná descontado');

-- 7. Con 2 protectores: lee hoy (racha 1), mañana (2), falta 1 día → protector, sigue en 2
select pg_temp.read(:A,'LEV',1);
select pg_temp.at('2026-10-06 09:00-04'); select pg_temp.read(:A,'LEV',2);
select pg_temp.at('2026-10-08 09:00-04');
select public.settle_all_streaks();
select pg_temp.eq((pg_temp.st(:A)).current_streak, 2, 'protector salva la racha');
select pg_temp.eq((pg_temp.st(:A)).shields, 1, 'se gastó 1 protector');
select pg_temp.eq((select shielded from public.reading_days where user_id=:A and day='2026-10-07'), true, 'día protegido en calendario');
select pg_temp.read(:A,'LEV',3);
select pg_temp.eq((pg_temp.st(:A)).current_streak, 3, 'continúa tras el protector');

-- 8. Faltan 2 días (vie 9, dom 11; el sáb no cuenta) con 1 protector → se pierde y NO se gasta
select pg_temp.at('2026-10-12 09:00-04');
select public.settle_all_streaks();
select pg_temp.eq((pg_temp.st(:A)).current_streak, 0, 'más días que protectores');
select pg_temp.eq((pg_temp.st(:A)).shields, 1, 'protector no se gasta en vano');

-- 9. Racha perdida aunque el proceso horario no haya corrido: al leer se resuelve igual
select pg_temp.at('2026-10-01 10:00-04'); select pg_temp.read(:B,'MAT',1);
select pg_temp.at('2026-10-09 10:00-04'); select pg_temp.read(:B,'MAT',2);
select pg_temp.eq((pg_temp.st(:B)).current_streak, 1, 'B reinicia en 1 al volver');

-- 10. Hito de 7 días → +50 (meta de B = 1 capítulo: 10 + 20 por día)
do $$ declare i int; begin
  for i in 0..6 loop
    perform pg_temp.at(('2026-10-' || lpad((10+i)::text,2,'0') || ' 10:00-04'));
    perform pg_temp.read('00000000-0000-0000-0000-00000000000b','MRK',i+1);
  end loop; end $$;
select pg_temp.eq((pg_temp.st(:B)).current_streak, 8, 'B 8 días');
select pg_temp.eq((select count(*)::int from public.mana_ledger where user_id=:B and reason='milestone'), 1, 'hito 7 días una vez');
select pg_temp.eq((pg_temp.st(:B)).mana, 9*30 + 50, 'maná B');

-- 11. Premium recibe 1 protector al mes (una sola vez)
insert into public.user_plans values (:C, 'premium', 'active', null);
select pg_temp.as_user(:C); select pg_temp.at('2026-10-20 10:00-04');
select pg_temp.eq((public.get_my_streak_state('America/Bogota')->>'shields')::int, 1, 'premium protector');
select pg_temp.eq((public.get_my_streak_state(null)->>'shields')::int, 1, 'solo una vez al mes');
select pg_temp.at('2026-11-02 10:00-05');
select pg_temp.eq((public.get_my_streak_state(null)->>'shields')::int, 2, 'mes siguiente +1');
select pg_temp.eq((select timezone from public.user_profiles where id=:C), 'America/Bogota', 'guarda la zona horaria');

-- 12. Zona horaria: 22:00 en Bogotá del día 2 = 03:00 UTC del día 3
select pg_temp.at('2026-11-03 03:00+00'); select pg_temp.read(:C,'JHN',1);
select pg_temp.eq((pg_temp.st(:C)).last_read_date, '2026-11-02'::date, 'fecha local de Bogotá');

-- 13. Seguridad: un usuario no puede escribir su racha ni su maná
set role authenticated; select pg_temp.as_user(:A);
update public.reading_streaks set mana = 99999 where user_id = :A;
reset role;
select pg_temp.eq((pg_temp.st(:A)).mana < 99999, true, 'RLS bloquea escribir maná');
select pg_temp.eq(has_function_privilege('authenticated', 'public.settle_all_streaks()', 'execute'), false, 'settle no es público');
select pg_temp.eq(has_function_privilege('authenticated', 'public._kodesh_record_chapter(uuid,text,int)', 'execute'), false, 'record no es público');

-- 14. Calendario
select pg_temp.as_user(:A); select pg_temp.at('2026-10-12 09:00-04');
select pg_temp.eq((select count(*)::int from public.get_reading_calendar(35)), 6, 'calendario de A: 1,2,5,6,7(protegido),8');

\echo 'TODOS LOS ESCENARIOS OK'
