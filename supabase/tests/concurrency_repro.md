# Pruebas de concurrencia reproducibles (RPC atómicas)

Estas pruebas requieren dos sesiones SQL simultáneas de verdad — no se pueden
expresar en un único script secuencial, porque lo que se está probando es
justamente qué pasa cuando dos llamadas llegan **al mismo tiempo**. Se
ejecutan contra un proyecto de Supabase de **staging/test**, nunca producción.

Cómo abrir dos sesiones simultáneas: la forma más simple es dos pestañas del
SQL Editor de Supabase, o dos conexiones `psql` a la misma base (`psql
"$SUPABASE_DB_URL"`), coordinando manualmente el orden con los pasos
numerados de abajo — Postgres bloqueará automáticamente a la Sesión B hasta
que la Sesión A confirme o revierta su transacción.

## 1. `consume_ai_usage()` — dos solicitudes simultáneas nunca exceden el límite

```sql
-- Preparación (una sola sesión, una vez):
delete from public.ai_usage where user_id = '00000000-0000-0000-0000-000000000002' and month = '2099-02';
```

**Sesión A:**
```sql
begin;
select public.consume_ai_usage('00000000-0000-0000-0000-000000000002', 'search');
-- NO hagas commit todavía — deja la transacción abierta.
```

**Sesión B (mientras A sigue abierta):**
```sql
select public.consume_ai_usage('00000000-0000-0000-0000-000000000002', 'search');
-- Esta consulta debe QUEDARSE ESPERANDO (bloqueada) — eso es correcto y
-- esperado: la fila está bloqueada por `for update` dentro de la Sesión A.
```

**Sesión A:**
```sql
commit;
```

Al confirmar A, B se desbloquea inmediatamente y se ejecuta con el contador
ya incrementado por A — nunca ve el valor antiguo. Resultado esperado:
`searches_used` termina en 2, no en 1 (ninguna de las dos llamadas "pisó" a
la otra).

```sql
select searches_used from public.ai_usage
  where user_id = '00000000-0000-0000-0000-000000000002' and month = '2099-02';
-- Esperado: 2
```

## 2. `claim_stripe_webhook_event()` — dos instancias no procesan el mismo evento

**Sesión A:**
```sql
begin;
select public.claim_stripe_webhook_event('evt_test_concurrency_1', 'test.event', 'lease-A', 600);
-- Esperado: {"claimed": true, "status": "processing", "attempts": 1}
-- NO hagas commit todavía.
```

**Sesión B (mientras A sigue abierta):**
```sql
select public.claim_stripe_webhook_event('evt_test_concurrency_1', 'test.event', 'lease-B', 600);
-- Se queda esperando hasta que A confirme o revierta.
```

**Sesión A:**
```sql
commit;
```

B se desbloquea y debe recibir `{"claimed": false, "status": "processing"}`
— B NUNCA debe recibir `claimed: true` mientras el lease de A sigue vigente.
Esto prueba que dos instancias serverless jamás ejecutan `updateUserPlan()`
dos veces para el mismo evento al mismo tiempo.

Limpieza:
```sql
delete from public.stripe_webhook_events where id = 'evt_test_concurrency_1';
```

## 3. `acquire_generation_lock()` — dos instancias no generan el mismo capítulo

Idéntico patrón:

**Sesión A:**
```sql
begin;
select public.acquire_generation_lock('interlinear', 'GEN', 1, 'lease-A', 180);
-- Esperado: {"acquired": true}
```

**Sesión B:**
```sql
select public.acquire_generation_lock('interlinear', 'GEN', 1, 'lease-B', 180);
-- Se queda esperando; tras el commit de A debe dar {"acquired": false}.
```

**Sesión A:**
```sql
commit;
```

Limpieza:
```sql
delete from public.generation_locks where kind = 'interlinear' and book = 'GEN' and chapter = 1;
```

## Por qué esto no está en `node --test`

Los tests de Node (`tests/`) mockean `fetch` para probar la lógica de los
endpoints (`api/*.js`) — qué llaman, en qué orden, cómo reaccionan a cada
respuesta. Verifican el **contrato** entre el código y Postgres. Pero no
tienen una base de datos Postgres real detrás, así que no pueden demostrar
que el `SELECT ... FOR UPDATE` dentro de las funciones RPC realmente serializa
transacciones concurrentes — eso solo lo demuestra Postgres mismo, con dos
sesiones reales, como arriba.
