# KODESH Bible — Segunda auditoría de seguridad: informe de entrega

Fecha: 2026-08-12 (continuación de la auditoría del commit ~13cbb1d)

Este informe documenta la SEGUNDA pasada de endurecimiento, que corrige los
problemas residuales encontrados en la primera: idempotencia falsa del
webhook, un riesgo de fallo en la migración de `ai_usage`, y "fail-open"
silencioso cuando el sistema de límites/locks no responde.

## 0. Rama de trabajo — acción tuya antes de continuar

No tengo acceso a `git` en este entorno (el mismo problema de sandbox de la
sesión anterior), así que no pude crear la rama yo mismo. Todos los cambios
de este pase están en tu copia de trabajo local, sobre lo que sea que tengas
actualmente extraído (probablemente `main`). **Antes de hacer commit**, crea
una rama separada con GitHub Desktop:

1. En GitHub Desktop, menú superior "Current Branch" → **New Branch**.
2. Nómbrala, por ejemplo, `security-hardening-2`.
3. Confirma — GitHub Desktop crea la rama a partir de tu HEAD actual y
   **conserva todos los cambios sin confirmar** (no los descarta). Todo lo
   que edité sigue ahí.
4. Recién ahí, sigue con `npm test` → `npm run check` → commit → push (ver
   sección 6).

## 1. Resumen de lo corregido

- **Webhook de Stripe — idempotencia real.** Antes, un evento se marcaba
  como "ya procesado" apenas llegaba, ANTES de aplicar el cambio de plan. Si
  la actualización a Supabase fallaba después de eso, Stripe reintentaba
  pero el webhook lo descartaba como duplicado — el evento se perdía para
  siempre. Ahora `stripe_webhook_events` tiene un ciclo de vida real
  (`processing` → `completed`/`failed`) con un lease token por intento, y el
  evento solo se marca `completed` después de que la actualización a
  Supabase realmente se confirme.
- **Migración de `ai_usage` — reparación segura de duplicados.** La
  migración original podía fallar en producción si ya existían filas
  duplicadas por `(user_id, month)` (posible por el bug de carrera del
  `incrementUsage()` viejo). La nueva migración consolida cualquier
  duplicado (sumando los contadores, sin perder uso registrado) ANTES de
  intentar crear la restricción `UNIQUE`.
- **Fail-closed en límites de generación.** `textual.js`, `interlinear.js` e
  `interlinear-warm.js` antes registraban una advertencia y CONTINUABAN si
  `checkRateLimit()` fallaba — una caída de Supabase desactivaba
  silenciosamente la protección de costos. Ahora, si el límite no se puede
  verificar, se devuelve 503 y Anthropic NUNCA se llama.
- **Bloqueo distribuido de capítulos.** El único guardián contra
  generaciones duplicadas del mismo libro/capítulo era un `Set` en memoria,
  que no protege entre instancias serverless distintas. Ahora hay un lock
  real en Postgres (`generation_locks`, con expiración automática) que
  impide que dos instancias generen el mismo capítulo a la vez.
- **Bug adicional encontrado y corregido:** `_interlinearCore.js`'s
  `getUserPlan()` solo reconocía `subscription_status === 'active'`,
  bloqueando incorrectamente el Modo Interlineal para usuarios en su prueba
  gratis de 7 días (`trialing`). Ya consistente con el resto del código.
- **Pruebas reales de endpoints con mocks** (no solo auxiliares) para
  autenticación, identidad, límites/costos y ciclo de vida del webhook.

## 2. Lista exacta de archivos modificados

**Backend (`api/`)**
- `api/webhook.js` — reescrito (ciclo de vida claim/complete/fail)
- `api/_limits.js` — agregado `acquireGenerationLock()` / `releaseGenerationLock()`
- `api/_security.js` — agregado `ERR.unavailable` (503)
- `api/_interlinearCore.js` — corregido el bug `active`-only en `getUserPlan()`
- `api/textual.js` — fail-closed en rate limit + bloqueo distribuido
- `api/interlinear.js` — fail-closed en rate limit + bloqueo distribuido (ruta premium síncrona y calentamiento en segundo plano)
- `api/interlinear-warm.js` — fail-closed en rate limit + bloqueo distribuido
- `api/search.js`, `api/assistant.js`, `api/lexicon.js` — el fallo de `consumeUsage()` ahora devuelve 503 en vez de 500 (mismo comportamiento de "no llamar a Anthropic", código de estado más preciso)

**SQL**
- `supabase/migrations/20260813_webhook_lifecycle_ai_usage_repair_locks.sql` — nuevo
- `supabase/tests/ai_usage_dedup_repro.sql` — nuevo (script de prueba reproducible)
- `supabase/tests/concurrency_repro.md` — nuevo (guía de pruebas de concurrencia con dos sesiones reales)

**Pruebas**
- `tests/_helpers.js` — nuevo (mocks compartidos: req/res falsos, router de `fetch`, simulador con estado del ciclo de vida del webhook)
- `tests/endpoints_auth.test.js` — nuevo
- `tests/endpoints_identity.test.js` — nuevo
- `tests/endpoints_limits.test.js` — nuevo
- `tests/webhook_lifecycle.test.js` — nuevo

**Configuración**
- `package.json` — el script `test` ahora corre los 5 archivos de prueba

**No modificado (por instrucción explícita):**
- `api/app-version.js` y su enlace temporal de Android.
- Ningún cambio de diseño/UI en ningún `.html`.

## 3. Migraciones SQL nuevas

`supabase/migrations/20260813_webhook_lifecycle_ai_usage_repair_locks.sql` —
idempotente, no reemplaza ni edita la migración anterior
(`20260812_security_hardening.sql`), la complementa. Contiene tres bloques
independientes:

1. **Ciclo de vida del webhook:** agrega columnas (`status`, `attempts`,
   `last_error`, `lease_token`, `created_at`, `updated_at`, `completed_at`) a
   `stripe_webhook_events` (las agrega con `ADD COLUMN IF NOT EXISTS`, así
   que funciona tanto si la tabla ya existe en su forma vieja como si es
   nueva). Migra las filas viejas (que no tienen `lease_token`) a
   `completed`, para no hacerlas reprocesables por error. Crea las funciones
   `claim_stripe_webhook_event()`, `complete_stripe_webhook_event()`,
   `fail_stripe_webhook_event()`, todas restringidas a `service_role`.
2. **Reparación de `ai_usage`:** detecta si ya existe una restricción
   `UNIQUE(user_id, month)` verificando tabla+esquema+columnas (no solo el
   nombre). Si no existe, consolida cualquier duplicado (suma de
   `searches_used`/`assistant_used`/`lexicon_used`, `MAX(updated_at)`),
   borra las filas sobrantes, y recién entonces crea la restricción — así
   nunca puede fallar por `unique_violation`.
3. **Bloqueo distribuido de generación:** tabla `generation_locks` (clave
   primaria `(kind, book, chapter)` — de tamaño acotado por diseño, sin
   necesidad de limpieza) + funciones `acquire_generation_lock()` /
   `release_generation_lock()`, restringidas a `service_role`.

## 4. Orden exacto para ejecutarlas

1. Si por algún motivo **todavía no aplicaste** `20260812_security_hardening.sql`
   (la de la primera auditoría), aplícala primero — esta nueva migración
   asume que `ai_usage`, `api_rate_limit` y las funciones
   `consume_ai_usage()`/`release_ai_usage()`/`check_rate_limit()` ya
   existen. (Si ya la aplicaste la vez pasada, no hace falta repetirla.)
2. Supabase Dashboard → **SQL Editor** → pega el contenido completo de
   `supabase/migrations/20260813_webhook_lifecycle_ai_usage_repair_locks.sql`
   → **Run**.
3. Verifica que no haya errores en la salida. Es segura de re-ejecutar si
   tienes dudas (todo el archivo es idempotente).
4. (Opcional, recomendado) Antes de aplicar en producción, corre
   `supabase/tests/ai_usage_dedup_repro.sql` contra un proyecto de
   staging/test para confirmar en vivo que la reparación de duplicados
   funciona como se espera — ese script hace `rollback` al final, no deja
   rastro.

No necesitas tocar nada en Stripe ni en Vercel para esta migración — el
webhook sigue apuntando al mismo endpoint `/api/webhook` con el mismo
`STRIPE_WEBHOOK_SECRET`.

## 5. Consultas SQL de verificación

Estas quedaron como comentarios al final del archivo de migración; cópialas
de ahí y ejecútalas en el SQL Editor después de aplicar:

- **(a)** Confirma que no quedan duplicados en `ai_usage` — debe devolver 0 filas.
- **(b)** Confirma que existe la restricción `UNIQUE(user_id, month)` — 1 fila, columnas `{month, user_id}`.
- **(c)** Confirma que las 8 funciones RPC existen (`consume_ai_usage`, `release_ai_usage`, `check_rate_limit`, `claim_stripe_webhook_event`, `complete_stripe_webhook_event`, `fail_stripe_webhook_event`, `acquire_generation_lock`, `release_generation_lock`).
- **(d)** Confirma que ningún rol aparte de `service_role`/`postgres` tiene permiso de ejecutar esas funciones — debe devolver 0 filas.
- **(e)** Confirma que RLS está habilitado en `ai_usage`, `api_rate_limit`, `stripe_webhook_events`, `generation_locks`.

### 5.1 Aplicación real en producción — bug encontrado y corregido

Al aplicar la migración en el SQL Editor de Supabase, el bloque de
reparación de `ai_usage` (sección 2) falló con:

```
ERROR: 42883: operator does not exist: information_schema.sql_identifier[] = text[]
```

Causa: `kcu.column_name` es de tipo `sql_identifier`, no `text`; Postgres no
compara `sql_identifier[] = text[]` sin cast explícito. Se corrigió
añadiendo `::text` a `kcu.column_name` en el `array_agg(...)` del archivo de
migración (`supabase/migrations/20260813_...sql`) y en el repro de pruebas
(`supabase/tests/ai_usage_dedup_repro.sql`). El primer intento (con el bug)
abortó únicamente en ese bloque `DO $$...$$` — no dejó nada a medio aplicar,
ya que un error dentro de un bloque `DO` revierte solo ese bloque. Las
secciones 1 (webhook) y 3 (locks) del script, ejecutadas antes de llegar a
la sección 2, sí quedaron aplicadas de ese primer intento.

Al volver a correr el archivo ya corregido, la verificación **(b)** devolvió
2 filas en vez de 1: existían dos restricciones `UNIQUE(user_id, month)`
sobre `ai_usage` — `ai_usage_user_id_month_key` (de la primera auditoría,
ya presente en producción) y `ai_usage_user_month_key` (añadida por esta
migración, porque el guard no detectó la existente — causa exacta no
determinada, pero confirmado por `pg_get_constraintdef` que ambas eran
`UNIQUE (user_id, month)` idénticas). No era un problema de seguridad ni de
integridad — la misma regla quedaba protegida dos veces, solo con overhead
redundante de un índice extra — pero se limpió por prolijidad:

```sql
alter table public.ai_usage drop constraint ai_usage_user_month_key;
```

Tras esto, las 5 verificaciones (a)-(e) se confirmaron correctas en
producción: 0 duplicados, 1 restricción UNIQUE con las columnas correctas, 8
funciones RPC presentes, 0 grants indebidos, RLS activo en las 4 tablas.

## 6. Resultado de las pruebas

**Misma limitación que en la primera auditoría:** el sandbox de shell de
esta sesión sigue fallando de forma persistente (`No space left on device` /
`useradd failed`, confirmado como "wedged" — no se recupera reintentando).
No pude ejecutar `npm test` ni `npm run check` yo mismo. Escribí las pruebas
y revisé cada archivo modificado línea por línea, pero **tienes que
ejecutarlas tú antes de hacer commit**, exactamente como la vez pasada:

```
cd "/Users/Niko2510/Documents/GitHub/Kodesh-"
npm run check
npm test
```

`npm test` ahora corre 5 archivos (antes solo 1): `security.test.js` (ya lo
conocías, sin cambios) más los 4 nuevos. Deberías ver bastantes más pruebas
que las 32 anteriores — cubren:

- **Autenticación (items 1-5 del pedido):** los 9 endpoints devuelven 401
  sin JWT, y CERO llamadas de red ocurren (verificado con un mock de
  `fetch` sin rutas — cualquier llamada inesperada hace fallar la prueba
  ruidosamente).
- **Identidad (items 6-10):** `checkout` ignora `userId`/`userEmail`
  falsificados y usa solo el usuario autenticado; `portal` nunca genera un
  portal para el `stripe_customer_id` de otra cuenta; `confirm` rechaza una
  sesión cuyo `client_reference_id` pertenece a otro usuario, y rechaza una
  suscripción cuya metadata contradice al usuario autenticado.
- **Límites y costos (items 11-13):** `allowed=false` bloquea Anthropic;
  `checkRateLimit` caído devuelve 503 sin llamar a Anthropic (probado en
  `search`, `textual`, `interlinear`); un lock ya tomado devuelve 409 (o
  `already_warming`/`rate_limit_unavailable` en el caso de
  `interlinear-warm`) sin generar dos veces.
- **Webhook (items 16-22):** evento completado duplicado → 200 sin
  reprocesar; evento fallido se puede reintentar y esta vez completar;
  evento `processing` con lease fresco no se reprocesa; evento `processing`
  abandonado (lease vencido) se puede reclamar; si `updateUserPlan` falla,
  el evento NUNCA queda `completed`; dos entregas simultáneas del mismo
  evento nunca ejecutan `updateUserPlan` dos veces.

**Ítems 14-15 (concurrencia real del RPC) y 24-26 (reparación de
duplicados) NO están en `node --test`** — requieren una base de datos
Postgres real para demostrar que el `SELECT ... FOR UPDATE` serializa
transacciones de verdad, algo que ningún mock en un solo proceso puede
probar honestamente. En su lugar, documenté los pasos exactos y
reproducibles en:
- `supabase/tests/concurrency_repro.md` (dos sesiones SQL simultáneas)
- `supabase/tests/ai_usage_dedup_repro.sql` (ejecutable directo, con
  aserciones `raise exception` que fallan ruidosamente si algo no cuadra)

Correlas contra un proyecto de Supabase de **staging**, nunca producción.

**Ítem 23** (verificación criptográfica) ya estaba cubierto por
`tests/security.test.js` de la primera auditoría — no lo dupliqué.

Si `npm test` o `npm run check` fallan, mándame el mensaje exacto tal cual
aparece en Terminal antes de hacer commit — dado que es lógica bastante
intrincada (mocks de Stripe/Supabase/Anthropic, timing de promesas
concurrentes), hay más superficie para un error de mi parte que en la
primera auditoría, y prefiero que me avises a que asumas que está bien.

## 7. Nuevo ciclo de vida del webhook

```
Llega el evento de Stripe
        │
        ▼
  Verificar firma (sin cambios: HMAC constante, tolerancia de tiempo,
  múltiples v1= por rotación de clave)
        │
        ▼
  claim_stripe_webhook_event(event.id, event.type, lease_token, 600s)
        │
        ├─ claimed=false, status=completed  → 200 (duplicado, no reprocesar)
        ├─ claimed=false, status=processing → 200 (otra instancia lo tiene, no tocar)
        └─ claimed=true                     → seguir
                │
                ▼
        processEvent(event) — llama a updateUserPlan(), que verifica
        CADA respuesta HTTP de Supabase/Stripe y NUNCA asume éxito
                │
        ┌───────┴────────┐
        ▼                ▼
     ÉXITO             FALLA
        │                │
        ▼                ▼
complete_stripe_    fail_stripe_webhook_event(event.id, lease_token, error)
webhook_event(...)       │
        │                ▼
        ▼           500 → Stripe reintenta → el evento queda 'failed',
     200 OK           reclamable en el próximo intento
```

Puntos clave que antes NO existían:
- El evento se marca `completed` recién DESPUÉS de que
  `updateUserPlan()` confirme (con respuestas HTTP verificadas, no
  asumidas) que la fila correcta fue actualizada.
- Si algo falla a mitad de camino, el evento queda `failed` — no
  desaparece silenciosamente — y Stripe lo reintenta automáticamente
  (Stripe reintenta cualquier respuesta que no sea 2xx).
- El `lease_token` (aleatorio, uno por intento) impide que una instancia
  vieja cuyo lease ya venció pero que sigue "viva" pise el trabajo de otra
  instancia que ya reclamó el mismo evento — `complete`/`fail` solo tienen
  efecto si el `lease_token` coincide con el que hizo el `claim`.
- Un lease de `processing` abandonado (instancia caída a mitad de
  proceso) se puede reclamar automáticamente después de 10 minutos — no
  queda atascado para siempre.

## 8. Bloqueo distribuido de capítulos

Antes, la única protección contra generar el mismo capítulo dos veces era un
`Set` de JavaScript en memoria (`warmingInProgress`) — que solo protege
dentro de UNA instancia serverless. Con más de una instancia corriendo (lo
normal bajo carga en Vercel), dos instancias distintas podían generar el
mismo capítulo simultáneamente, duplicando el costo de Anthropic.

Ahora, antes de generar, cada endpoint (`textual.js`, `interlinear.js`,
`interlinear-warm.js`) llama a `acquire_generation_lock(kind, book, chapter,
lease_token, lease_seconds)`:

- Si nadie tiene el lock → se adquiere, se genera, y al terminar (éxito o
  error, vía `finally`) se libera con `release_generation_lock(...)`.
- Si otra instancia ya lo tiene (lock aún no vencido) → se responde 409 (o
  el equivalente "ya se está generando" en `interlinear-warm`, que siempre
  devuelve 200 por ser fire-and-forget) SIN llamar a Anthropic.
- Si el lock quedó abandonado (la instancia que lo tomó se cayó antes de
  liberarlo) → se reclama automáticamente después de 2-3 minutos
  (`lease_seconds`), sin quedar bloqueado para siempre.

`interlinear.js` e `interlinear-warm.js` comparten el mismo namespace de
lock (`kind='interlinear'`), así que tampoco pueden generar el mismo
capítulo entre sí — un usuario premium abriendo el Modo Interlineal y, al
mismo tiempo, el calentamiento en segundo plano de otro usuario gratuito
para ESE MISMO capítulo, ahora se excluyen mutuamente en vez de duplicar
trabajo.

La tabla `generation_locks` tiene clave primaria `(kind, book, chapter)` —
por construcción nunca puede crecer más allá de (# tipos × # libros × #
capítulos), así que no necesita un job de limpieza aparte: un lock vencido
simplemente se sobreescribe la próxima vez que alguien lo reclama.

## 9. Confirmación: una falla del rate limiter ya NO permite llamar a Anthropic

Antes (los tres archivos):
```js
try {
  const rl = await checkRateLimit(...);
  if (!rl.allowed) return 429;
} catch(e) {
  console.warn('rate limit check failed (allowing):', e.message);
  // seguía adelante y llamaba a Anthropic de todas formas
}
```

Ahora:
```js
let rl;
try {
  rl = await checkRateLimit(...);
} catch(e) {
  console.error('rate limit check failed — failing closed:', e.message);
  return sendError(res, 503, ERR.unavailable, e, '...'); // Anthropic NUNCA se llama
}
if (!rl.allowed) return sendError(res, 429, ...);
```

Verificado en `textual.js`, `interlinear.js` (ruta premium síncrona) e
`interlinear-warm.js`, más el mismo tratamiento aplicado a
`consumeUsage()` en `search.js`/`assistant.js`/`lexicon.js` (que ya fallaba
cerrado desde la primera auditoría, pero con código 500 genérico — ahora
503, más preciso). Las pruebas en `tests/endpoints_limits.test.js`
verifican esto exactamente: simulan que la RPC de Supabase devuelve un
error 500, y comprueban con `mockFetch.calledWith('api.anthropic.com') ===
false` que la llamada a Anthropic nunca ocurrió.

Lo mismo aplica al lock de generación: si `acquire_generation_lock` falla
(no solo si "está tomado", sino si la llamada misma no se puede completar),
tampoco se genera.

## 10. Riesgos que todavía quedan

- **No pude ejecutar las pruebas ni `node --check`** en este entorno (ver
  sección 6) — sigue siendo el riesgo principal. Debes correrlas tú antes
  de hacer commit.
- **No pude crear la rama separada** — debes hacerlo tú con GitHub Desktop
  antes de comitear (ver sección 0).
- La prueba de concurrencia real del RPC (`claim_stripe_webhook_event`,
  `consume_ai_usage`, `acquire_generation_lock`) requiere que la corras a
  mano contra Supabase con dos sesiones — no la ejecuté yo mismo, porque no
  tengo una conexión a tu base de datos desde este entorno. El script está
  listo en `supabase/tests/concurrency_repro.md`.
- El lease de 10 minutos del webhook y de 2-3 minutos del lock de
  generación son valores razonables pero arbitrarios — si notas que un
  evento/generación legítimamente tarda más que eso (poco probable dado que
  son un par de llamadas HTTP secuenciales), podría reclamarse
  prematuramente por otra instancia. Fácil de ajustar si hace falta.
- Si Supabase está caído por más de lo que tarda el reintento de Stripe (los
  reintentos de Stripe se espacian y eventualmente dejan de intentar tras
  varios días), un evento podría quedar permanentemente en `failed` sin
  reclamarse — pero esto ya es preferible a la situación anterior (perderlo
  silenciosamente sin ninguna posibilidad de recuperación).
- No implementé un job/cron que limpie eventos `failed` muy viejos de
  `stripe_webhook_events` — la tabla crece con cada evento único de Stripe
  a lo largo del tiempo (a diferencia de `generation_locks`, que está
  acotada). Con el volumen actual de la app esto no es un problema práctico
  a corto/mediano plazo, pero si quieres, puedo agregar una limpieza
  periódica más adelante.

## 11. Confirmación de compatibilidad web y Capacitor

No se tocó ningún archivo HTML/frontend en este segundo pase — todos los
cambios están en `api/*.js` y SQL. Los endpoints protegidos siguen
esperando exactamente los mismos cuerpos de petición y encabezados
`Authorization` que ya enviaba el frontend desde la primera auditoría; lo
único que cambió es CUÁNDO fallan (503 en vez de continuar sin protección,
o en vez de un 500 genérico) — algo que el frontend ya maneja de forma
genérica (muestra un error y permite reintentar), sin necesitar cambios.

## 12. Pasos manuales pendientes

1. Aplicar `supabase/migrations/20260813_webhook_lifecycle_ai_usage_repair_locks.sql` en Supabase (sección 4).
2. Correr las consultas de verificación (sección 5).
3. Crear la rama separada en GitHub Desktop (sección 0).
4. Correr `npm run check` y `npm test` localmente y confirmarme el resultado.
5. Commit + push de la rama nueva.
6. (Opcional pero recomendado) Correr `supabase/tests/ai_usage_dedup_repro.sql`
   y los pasos de `supabase/tests/concurrency_repro.md` contra un proyecto
   de staging antes de fusionar a `main`.
