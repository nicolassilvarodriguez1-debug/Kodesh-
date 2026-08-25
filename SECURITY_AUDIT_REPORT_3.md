# KODESH Bible — Tercera auditoría de seguridad: informe de entrega

Fecha: 2026-08-12. Rama de trabajo: crea una rama nueva antes de comitear estos cambios (ver
sección 5) — no puedo crear la rama yo mismo (mismo problema de sandbox de las dos rondas
anteriores: el shell falla con "No space left on device" en todos los intentos).

Este informe cubre la TERCERA pasada, sobre `main` (~commit 8fa885a), que corrige problemas de
concurrencia, migraciones y mantenimiento de repositorio que quedaron después de la segunda
ronda.

## 0. Cómo se hizo esta auditoría

Antes de tocar nada, leí directamente (no asumí desde `SECURITY_AUDIT_REPORT_2.md`):

- `api/webhook.js` completo — confirmé el bug exacto que describiste: `claim.status === 'processing'`
  con lease vigente devolvía 200 en vez de un código recuperable.
- Las dos migraciones existentes (`20260812_security_hardening.sql`, `20260813_...sql`) — confirmé
  el bug de `ctid` (usa `min(ctid)` en un SELECT, hace UPDATE de esa fila, y vuelve a calcular
  `min(ctid)` para decidir qué borrar — un UPDATE le da a la fila un ctid físico nuevo, así que la
  segunda selección puede apuntar a otra fila).
- Cómo corren las migraciones: descubrí que el guard de `ai_usage` de la migración 20260812
  comprueba el constraint por **nombre exacto** (`ai_usage_user_month_key`), mientras que el de
  20260813 lo comprueba por **columnas** — inconsistente, y confirma la dependencia circular que
  señalas: si 20260812 falla a mitad de camino, 20260813 asume un estado que puede no existir.
- El backfill de eventos legacy en 20260813 (`lease_token is null` → `status='completed'`) — until
  confirmé que es una suposición falsa: el código viejo insertaba la fila apenas VEÍA el evento,
  antes de procesar nada.
- Encontré además, sin que estuviera en tu lista original, un **IDOR real** en `api/usage.js`: el
  endpoint tomaba `userId` directamente del body sin ningún `requireUser()` — cualquiera podía
  consultar el plan/uso de cualquier otro usuario adivinando su UUID. Lo corregí como parte de esta
  ronda (ver sección 2).

## 1. Resumen de lo corregido

- **Webhook — nunca más 200 salvo `completed` confirmado.** `claim.status === 'processing'` con
  lease vigente ahora responde **409** (no 2xx) en vez de 200. Si `completeEvent()` lanza excepción
  o devuelve `false`, el handler responde **500** — nunca 200. `updateUserPlan()` sigue siendo
  idempotente, así que un reintento nunca corrompe el estado, solo lo re-escribe con el mismo valor.
- **`ai_usage` — consolidación de duplicados sin bug de `ctid`.** Rediseñada para usar solo
  `(user_id, month)` en todas las sentencias: tabla temporal con totales por grupo, DELETE de todas
  las filas duplicadas, y un solo INSERT reconstruyendo la fila consolidada. Nunca vuelve a
  depender de `ctid` entre sentencias. Incluye verificación de que ningún contador se perdió (si
  los totales no cuadran, hace `raise exception` y revierte todo).
- **Migración autosuficiente `20260814_self_sufficient_repair.sql`.** No asume que 20260812/20260813
  terminaron bien. Verifica/crea/reemplaza TODO lo necesario (constraint, las 6 RPCs anteriores + 1
  nueva, tablas, RLS, grants) sin importar el estado de partida. Es el único archivo que necesitas
  correr ahora (ver sección 5).
- **Eventos legacy del webhook — ya no se asumen `completed`.** Nuevo estado `legacy_unknown`: las
  filas con `lease_token IS NULL` (marca inequívoca de haber sido tocadas solo por el código viejo)
  se reclasifican así, sin importar si una migración anterior ya las había puesto en `completed`
  incorrectamente. El webhook nunca las reprocesa automáticamente (evitaría sobrescribir el plan
  actual con datos viejos) — en su lugar hay un script de reconciliación separado.
- **`node_modules` fuera del repositorio.** `.gitignore` añadido; instrucciones exactas para
  destrackearlo sin borrar `package-lock.json` (sección 6).
- **Objetivo 6 — detalles adicionales:**
  - `sbGet()` en `_limits.js` e `_interlinearCore.js` ahora lanzan excepción si `res.ok` es falso,
    en vez de tratar una respuesta de error como "sin datos".
  - `getUserPlan()`/`getPlan()` ya no atrapan silenciosamente cualquier fallo de Supabase y lo
    convierten en `'free'` — ahora lanzan, y los endpoints que las llaman (`textual.js`,
    `interlinear.js`) fallan cerrado con 503 en vez de mostrar un "no eres premium" engañoso durante
    una caída real.
  - Los locks de generación (`textual`, `interlinear`, `interlinear-warm`) ahora se renuevan
    periódicamente mientras la generación sigue genuinamente en curso (nueva RPC
    `renew_generation_lock`), en vez de depender de un lease fijo que podía expirar a mitad de una
    generación larga (p. ej. Salmo 119, 176 versículos).
  - **Hallazgo adicional fuera de tu lista:** `api/usage.js` no tenía `requireUser()` — IDOR real.
    Corregido: identidad ahora viene solo del JWT, igual que el resto de endpoints. Actualicé
    también `index.html` (`loadUsage()`) para enviar `Authorization` en vez de `userId` en el body.
  - **Hallazgo adicional:** `api/interlinear.js` e `api/interlinear-warm.js` no tenían `maxDuration`
    configurado en `vercel.json` — corrían con el límite por defecto de Vercel (10s en plan Hobby),
    muy por debajo de lo que puede tardar generar un capítulo largo. Añadí `maxDuration: 300` a
    ambos (y subí `textual.js` de 30 a 300 por la misma razón). **Esto requiere un plan de Vercel
    que permita funciones de hasta 300s — confírmalo tú, no lo puedo verificar yo.**

## 2. Lista exacta de archivos modificados/creados

Modificados:
- `api/webhook.js` — lógica de respuesta HTTP corregida (Objetivo 1).
- `api/_limits.js` — `sbGet()` valida `res.ok`; nuevas `renewGenerationLock()` y
  `startLockRenewal()`.
- `api/_interlinearCore.js` — `sbGet()` valida `res.ok`; `getUserPlan()` ya no atrapa errores
  silenciosamente.
- `api/interlinear.js` — captura explícita del fallo de `getUserPlan()` (503); lease de 300s +
  renovación periódica en ambas rutas (síncrona premium y background gratis).
- `api/interlinear-warm.js` — lease de 300s + renovación periódica.
- `api/textual.js` — `getPlan()` ya no atrapa errores silenciosamente (los dos call sites ahora
  fallan cerrado con 503); `getCachedChapter()` ya no trata una respuesta de error como "no
  cacheado" sin loguearlo; lease de 300s + renovación periódica.
- `api/usage.js` — **reescrito**: ahora usa `requireUser()` en vez de `userId` del body (corrige
  IDOR); errores genéricos en vez de `err.message` crudo.
- `index.html` — `loadUsage()` actualizado para enviar `Authorization` (via `authHeaders()`) en vez
  de `{ userId }` en el body, para que siga funcionando con el `api/usage.js` corregido.
- `vercel.json` — `maxDuration: 300` añadido a `interlinear.js` e `interlinear-warm.js`; subido de
  30 a 300 en `textual.js`.
- `package.json` — `test` script incluye los 2 archivos de pruebas nuevos.
- `tests/webhook_lifecycle.test.js` — pruebas existentes actualizadas (item 18 y 22) + 5 pruebas
  nuevas (ver sección 8).
- `supabase/tests/ai_usage_dedup_repro.sql` — nota de "superseded", apunta a la v2.

Creados:
- `supabase/migrations/20260814_self_sufficient_repair.sql` — la migración autosuficiente.
- `supabase/tests/ai_usage_dedup_repro_v2.sql` — reproducción exacta del bug de `ctid` corregido.
- `scripts/reconcile-stripe-subscriptions.mjs` — script admin de reconciliación (NO es un
  endpoint).
- `tests/generation_lock.test.js` — pruebas de acquire/expire/reclaim/renew del lock distribuido.
- `.gitignore` — excluye `node_modules/`, `.env*`, artefactos de SO/editor/Vercel.

No tocados (confirmado): `api/app-version.js`, el enlace temporal de Android, diseño/CSS/HTML
visible, Stripe/Supabase/Anthropic como proveedores, `requireUser()`, validaciones existentes,
límites atómicos (`consume_ai_usage`/`release_ai_usage`), protecciones XSS.

## 3. La nueva migración autosuficiente

`supabase/migrations/20260814_self_sufficient_repair.sql`. No asume que 20260812 o 20260813
terminaron, ni que terminaron bien. Verifica/crea/reemplaza:

- `ai_usage`: constraint `UNIQUE(user_id, month)` (verificado por columnas, no por nombre) con la
  consolidación de duplicados corregida (sin bug de `ctid`), y verificación de que no se perdió
  ningún contador.
- `consume_ai_usage()`, `release_ai_usage()`, `check_rate_limit()` — redefinidas sin condición (
  `create or replace` es en sí mismo idempotente).
- `stripe_webhook_events` con su esquema completo, constraint de estado ampliado a 5 valores
  (`processing`, `completed`, `failed`, `legacy_unknown`, `reconciled`), y el backfill legacy
  corregido.
- `claim_stripe_webhook_event()`, `complete_stripe_webhook_event()`, `fail_stripe_webhook_event()` —
  la primera ahora trata `legacy_unknown`/`reconciled` igual que `completed` (nunca reprocesa
  automáticamente).
- `generation_locks`, `acquire_generation_lock()`, `release_generation_lock()`, y la **nueva**
  `renew_generation_lock()`.
- RLS habilitado en las 4 tablas; grants exclusivos a `service_role` en las 9 funciones.

## 4. Archivo exacto que debes ejecutar en Supabase

**Solo uno:** `supabase/migrations/20260814_self_sufficient_repair.sql`, completo, de una sola vez,
en el SQL Editor de Supabase (Dashboard → tu proyecto → SQL Editor → pega el archivo completo →
Run).

No necesitas volver a correr `20260812` ni `20260813` — ya se aplicaron en las rondas anteriores
(confirmado: tu base de datos ya tenía las 8 RPCs, el constraint y RLS correctos cuando lo
verificamos juntos). `20260814` es seguro de correr sobre ese estado — es mayormente un no-op
excepto por dos correcciones puntuales: reclasificar filas legacy mal etiquetadas (si las hay — ver
verificación (g) abajo) y crear la función `renew_generation_lock` nueva.

## 5. Orden exacto de los pasos manuales

1. En GitHub Desktop, crea una rama nueva desde tu estado actual de `main` (ej. `security-hardening-3`)
   — "Current Branch" → New Branch. Esto conserva todos los archivos que edité sin comitear.
2. Corre `npm ci` (ver sección 6) y confirma que instala limpio.
3. Corre `npm test` y `npm run check` (sección 8) — pégame la salida completa.
4. Cuando todo pase, aplica `20260814_self_sufficient_repair.sql` en Supabase (sección 4).
5. Corre las 7 verificaciones (a)-(g) de la sección 6 de ese mismo archivo (al final, comentadas) y
   pégame los resultados.
6. Si la verificación (g) devuelve más de 0, decide si corres
   `scripts/reconcile-stripe-subscriptions.mjs` (ver sección 7 — primero en modo dry-run).
7. Confirma en Vercel (Project Settings → tu plan) que puedes usar `maxDuration: 300` — si tu plan
   no lo permite, avísame y ajustamos el número o la estrategia.
8. Commit + push de la rama nueva (no mergees a `main` todavía).
9. Prueba en el preview deployment de Vercel: Traducción Kodesh e Interlineal en un capítulo largo
   (p. ej. Salmo 119) con una cuenta premium — es la ruta que más cambió (lease + renovación).
10. Cuando estés conforme, mergea a `main`.

## 6. `node_modules` fuera del repositorio

Ya añadí `.gitignore`. Como no puedo correr `git` yo mismo, hazlo tú en tu terminal (o dime y te
guío paso a paso por GitHub Desktop si prefieres):

```
cd "/Users/Niko2510/Documents/GitHub/Kodesh-"
git rm -r --cached node_modules
npm ci
npm test
node --check api/webhook.js && node --check api/_limits.js && node --check api/_interlinearCore.js && node --check api/textual.js && node --check api/interlinear.js && node --check api/interlinear-warm.js && node --check api/usage.js && echo "syntax OK"
git ls-files node_modules
```

`git rm -r --cached node_modules` quita los archivos del control de versiones SIN borrarlos de tu
disco (siguen ahí, solo dejan de rastrearse). `package-lock.json` no se toca. La última línea
(`git ls-files node_modules`) debe devolver **nada** — eso confirma que ya no hay ningún archivo de
`node_modules` rastreado. Pégame toda esta salida.

## 7. Estrategia para eventos legacy del webhook

- La migración `20260814` reclasifica cualquier fila con `lease_token IS NULL` como
  `legacy_unknown` (nunca `completed`), sin importar qué migración anterior la haya tocado.
- El webhook nunca reprocesa automáticamente una fila `legacy_unknown`/`reconciled` — evita
  sobrescribir el plan ACTUAL de un usuario con el payload de un evento de hace meses/años que
  pudo haber sido superado por eventos posteriores.
- `scripts/reconcile-stripe-subscriptions.mjs` es la reconciliación real: para cada
  `stripe_customer_id` en `user_plans`, consulta el estado ACTUAL de la suscripción directamente en
  Stripe (no el payload histórico) y corrige `user_plans` si no coincide. Al final marca todas las
  filas `legacy_unknown` como `reconciled`. No es un endpoint — es un script de línea de comandos,
  con modo dry-run por defecto (necesitas pasar `--apply` para escribir).
- Antes de correrlo, ejecuta la verificación (g) de la migración:
  ```sql
  select count(*) from public.stripe_webhook_events where status = 'legacy_unknown';
  ```
  Si devuelve 0, no hay nada que reconciliar y puedes saltarte el script por completo.

## 8. Pruebas nuevas del webhook (Objetivo 1)

En `tests/webhook_lifecycle.test.js`:

1. Item 16 (ya existía) — duplicado de evento `completed` → 200.
2. Item 18 (actualizado) — `processing` vigente → **no-2xx** (409), `user_plans` nunca tocado.
3. Item 19 (ya existía) — lease abandonado/expirado → se reclama y procesa.
4. **Nueva** — `completeEvent()` lanza excepción (RPC falla) → 500, evento queda `processing` (NO
   se marca `failed` porque el plan sí se aplicó correctamente).
5. **Nueva** — `completeEvent()` devuelve `false` (lease ya perdido) → 500, nunca 200.
6. **Nueva** — dos entregas de eventos distintos con el mismo estado de suscripción → ambas
   exitosas, mismos valores en el PATCH (idempotencia).
7. **Nueva** — evento sin caso manejado (`invoice.payment_failed`) → se reclama, se completa, 200
   (uno de los 3 únicos caminos válidos a 200).
8. **Nueva** — carrera explícita: A reclama y "se cae" (nunca completa/falla) → B recibe 409 →
   lease de A expira → C reclama y completa exitosamente. Prueba el ciclo completo descrito en tu
   Objetivo 1.
9. Item 22 (actualizado) — dos entregas simultáneas del MISMO evento nuevo: exactamente un ganador
   (200 sin `duplicate`), el perdedor es 200-duplicado o no-2xx (nunca un 200 "silencioso").

`tests/generation_lock.test.js` (nuevo): acquire en fresco, rechazo con lease vigente, reclamo tras
expirar, `release` respeta `lease_token`, y la prueba explícita de que la renovación mantiene el
lock vivo más allá de lo que habría durado sin renovar (simula una generación larga).

`supabase/tests/ai_usage_dedup_repro_v2.sql`: reproduce exactamente tu escenario (searches 2/3/4,
assistant 1/5/2, lexicon 7/8/9) usando el código REAL de la migración (copiado literal, no una
reimplementación), verifica 9/8/24 en una sola fila, que el constraint rechaza un duplicado nuevo,
y que re-ejecutar la lógica es un no-op que preserva los totales.

## 9. Resultado de `npm ci` y todas las pruebas

**No pude ejecutarlas yo mismo** — el mismo problema de sandbox de las dos rondas anteriores
persiste en esta sesión (`useradd failed: No space left on device`, confirmado tras 7 intentos
fallidos consecutivos). Necesito que tú corras los comandos de las secciones 5 y 6 y me pegues la
salida completa antes de que yo pueda confirmar que esto está realmente corregido — no voy a
afirmar que "ya quedó" sin ver esos resultados, tal como pediste explícitamente.

## 10. Confirmación: `node_modules` ya no versionado

Pendiente de que corras `git rm -r --cached node_modules` y `git ls-files node_modules` (sección 6)
y me confirmes que la segunda línea no devuelve nada.

## 11. Compatibilidad web y Capacitor

- `index.html` es el único archivo de frontend tocado, y solo en `loadUsage()` — cambié cómo se
  autentica la llamada a `/api/usage` (de `{userId}` en el body a `Authorization: Bearer`), sin
  tocar el flujo visible ni el resto de la UI.
- Ningún otro flujo de frontend (Stripe Checkout/Portal/confirm, RevenueCat, Asistente, Búsqueda,
  Léxico, Traducción Kodesh, Interlineal) cambió su contrato con el backend — los endpoints que
  toqué (`textual.js`, `interlinear.js`, `interlinear-warm.js`, `webhook.js`) mantienen exactamente
  los mismos parámetros de entrada/salida esperados por el frontend actual; solo cambié su
  comportamiento interno ante fallos (fail-closed más estricto) y los códigos de estado en
  escenarios de error/carrera que antes no estaban bien manejados.
- `kapiFetch()` (el wrapper que soporta Capacitor nativo) no fue tocado.

## 12. Riesgos que todavía quedan (sin disfrazar)

- **No pude ejecutar ninguna prueba yo mismo** — todo lo de la sección 9 depende de que tú las
  corras y me confirmes resultados.
- **`maxDuration: 300` en Vercel requiere un plan que lo soporte** (Hobby limita a 10s). Si tu plan
  no lo permite, la renovación de lock que implementé no sirve de nada porque Vercel mataría la
  función mucho antes — avísame qué plan tienes.
- **La verdadera atomicidad cross-transacción de las RPCs SQL** (claim/complete/fail,
  acquire/renew/release) solo se puede demostrar con dos sesiones reales de Postgres — igual que en
  la ronda anterior, esto está documentado como procedimiento manual
  (`supabase/tests/concurrency_repro.md`), no como prueba automática.
- **El script de reconciliación no ha corrido nunca** — si la verificación (g) muestra filas
  `legacy_unknown`, corre primero en modo dry-run y revisa la salida con calma antes de `--apply`.
- **No revisé cada archivo del repositorio línea por línea buscando secretos** — sí busqué patrones
  comunes (`sk_live_`, `sk_test_`, claves de servicio, `.env`) y no encontré nada; los JWT
  encontrados en HTML son la clave `anon` pública de Supabase (rol `anon`, diseñada para exponerse
  en frontend, protegida por RLS) — pero una revisión manual adicional de tu parte no está de más
  antes de hacer público el repo si no lo es ya.
- **`sync-premium.js`** tiene un `fetch` a `user_plans` sin comprobar `res.ok` en el upsert final —
  lo dejé sin tocar porque está fuera del alcance explícito de tus 6 objetivos y el riesgo es bajo
  (fallo silencioso de guardado, no un problema de seguridad), pero lo anoto para una futura pasada.
