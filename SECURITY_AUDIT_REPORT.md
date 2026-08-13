# KODESH Bible — Auditoría de seguridad: informe de entrega

Fecha: 2026-08-12

## 1. Resumen de las correcciones

Se cerraron las siete categorías de vulnerabilidades solicitadas:

- **Checkout, confirmación y portal de Stripe** ya no confían en `userId`/`userEmail` enviados por el cliente. Los tres endpoints exigen un JWT válido de Supabase (`requireUser()`) y derivan la identidad exclusivamente del token verificado.
- **Todos los endpoints que llaman a Anthropic** (`search`, `assistant`, `lexicon`, `textual`, `interlinear`, `interlinear-warm`) ahora exigen autenticación antes de gastar cuota o llamar al proveedor de IA. `interlinear-warm.js` — el más grave, invocable anónimamente en cada carga de capítulo — ahora requiere sesión, tiene rate limiting y de-duplicación de generaciones concurrentes.
- **Los límites de uso son atómicos.** Se reemplazó el patrón "leer, sumar 1, escribir" (vulnerable a condiciones de carrera) por una función RPC de PostgreSQL (`consume_ai_usage`) que bloquea la fila con `SELECT ... FOR UPDATE` dentro de la misma transacción.
- **XSS eliminado** en `home.html`, `admin.html`, `profile.html`, `upload.html`, `actividades.html`, `cronicas.html`, `landing.html` e `index.html`: todo dato dinámico (nombres, comentarios, notas, URLs de imágenes/audio, resultados de búsqueda IA, mensajes del asistente) pasa por `textContent`/construcción DOM o por un escapado HTML explícito antes de tocar el DOM. Las URLs dinámicas se validan contra `https:` únicamente antes de asignarse a `href`/`src`.
- **El webhook de Stripe** ahora compara firmas en tiempo constante, tolera la rotación de firmas (`v1=` múltiples) y es idempotente frente a reentregas del mismo evento.
- **CORS** usa una lista explícita de orígenes (`kodeshbible.com`, `www.kodeshbible.com`, `capacitor://localhost`, `ionic://localhost`, `http://localhost`) en vez de reflejar cualquier origen.
- **Manejo de errores** consistente: nunca se reenvía `err.message` de Stripe/Supabase/Anthropic al cliente; los detalles quedan solo en logs de servidor.

## 2. Lista exacta de archivos modificados

**Backend (`api/`)**
- `api/_security.js` — nuevo (helpers de CORS, errores, validación)
- `api/_limits.js` — `consumeUsage()`, `releaseUsage()`, `checkRateLimit()` atómicos vía RPC
- `api/checkout.js` — reescrito
- `api/confirm.js` — reescrito
- `api/portal.js` — reescrito
- `api/search.js` — reescrito
- `api/assistant.js` — reescrito
- `api/lexicon.js` — reescrito
- `api/textual.js` — modificado (auth, rate limit, validación de `sourceVerses`)
- `api/interlinear.js` — reescrito
- `api/interlinear-warm.js` — reescrito
- `api/webhook.js` — reescrito (firma segura, idempotencia)

**Frontend**
- `home.html` — XSS (avatar, saludo, pill de usuario)
- `admin.html` — XSS (reportes, usuarios, canciones, actividades, cobertura de libros); `onclick` con datos dinámicos reemplazados por `addEventListener`
- `profile.html` — XSS (avatar, nombre, notas, marcadores, metas de estudio); `Authorization` en llamada a `/api/portal`
- `upload.html` — XSS (canciones/actividades del panel de carga)
- `actividades.html` — XSS (tarjetas de actividades públicas)
- `cronicas.html` — XSS (canciones/actividades públicas, reproductor)
- `landing.html` — XSS (pill de usuario, saludo, chat del asistente general); `Authorization` en `/api/assistant`
- `index.html` — `Authorization` en `/api/checkout`, `/api/search`, `/api/assistant`, `/api/lexicon` (×2), `/api/textual`, `/api/interlinear`, `/api/interlinear-warm`; XSS en resultados de búsqueda y burbujas de chat del asistente
- `auth.js` — `Authorization` en `/api/confirm`

**Configuración / dependencias**
- `package.json` — se agregó `"type": "module"` (los archivos ya usaban `import`/`export`; esto hace que `node --check`/`node --test` locales los interpreten correctamente, igual que ya lo hace el runtime de Vercel) y scripts `test`/`check`

**Pruebas**
- `tests/security.test.js` — nuevo (ver sección 6)

**No modificado (por instrucción explícita):**
- `api/app-version.js` y su enlace temporal de Android — sin tocar.

## 3. Migraciones SQL creadas

`supabase/migrations/20260812_security_hardening.sql` (idempotente, se puede ejecutar varias veces sin error). Contiene:

1. Restricción `UNIQUE(user_id, month)` en `ai_usage`.
2. `consume_ai_usage(p_user_id, p_type)` — función RPC atómica (bloqueo de fila) que determina el plan efectivo (`active`/`trialing` cuentan como premium, `free` en cualquier otro caso), aplica el límite correspondiente, e incrementa solo si queda cuota. Devuelve `allowed, used, remaining, limit, plan, month`.
3. `release_ai_usage(p_user_id, p_type)` — libera una unidad de cuota si la llamada a Anthropic falla después de reservarla.
4. `api_rate_limit` (tabla) + `check_rate_limit(p_user_id, p_endpoint, p_max, p_window_seconds)` — limitador de ventana fija genérico, usado por `textual` (20/hora) e `interlinear`/`interlinear-warm` (30/hora).
5. `stripe_webhook_events` (tabla) — usada por `api/webhook.js` para idempotencia de eventos.
6. Ambas funciones nuevas quedan restringidas a `service_role` (revocadas de `public`/`anon`/`authenticated`).
7. **RLS habilitado** en `api_rate_limit` y `stripe_webhook_events` (sin políticas — solo `service_role`, que ignora RLS, puede tocarlas).
8. **RLS habilitado en `ai_usage`** con políticas `SELECT`/`DELETE` limitadas a `auth.uid() = user_id` — necesario porque `profile.html` lee y borra su propia fila directamente con el cliente de Supabase; deliberadamente **no** se agregó política de `INSERT`/`UPDATE` para `authenticated`, así que los contadores solo pueden modificarse a través del RPC (`service_role`).

### Cómo aplicarla (instrucciones exactas)

1. Entra a tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor**.
2. Abre `supabase/migrations/20260812_security_hardening.sql` de este repo, copia todo el contenido.
3. Pégalo en el SQL Editor y presiona **Run**.
4. Verifica que no haya errores en la salida. Si ya la habías aplicado antes, puedes volver a ejecutarla sin problema (es idempotente).
5. Alternativa vía CLI: `supabase db push` (o `supabase migration up`) si usas el CLI de Supabase localmente y tienes el proyecto vinculado.

## 4. Variables de entorno nuevas o modificadas

**Ninguna nueva.** Todas las correcciones usan las variables que ya existían en Vercel:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (solo servidor)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (solo servidor)
- `ANTHROPIC_API_KEY` (solo servidor)
- Clave anon/pública de Supabase (sigue en el cliente, como debe ser)

No hace falta configurar nada nuevo en Vercel para estos cambios.

## 5. Instrucciones manuales

### Supabase
- Ejecuta la migración SQL descrita en la sección 3 (obligatorio antes de desplegar, porque `api/_limits.js`, `api/textual.js` e `api/interlinear.js` ya llaman a `consume_ai_usage`, `release_ai_usage` y `check_rate_limit`, y `api/webhook.js` ya escribe en `stripe_webhook_events`).

### Stripe
- No se requiere ningún cambio de configuración en el dashboard de Stripe. El webhook sigue apuntando al mismo endpoint (`/api/webhook`) y usando el mismo `STRIPE_WEBHOOK_SECRET`.

### Vercel / GitHub
- No hay cambios en `vercel.json` ni variables nuevas.
- **Archivos duplicados en la raíz del repo — pendiente de borrado manual**, porque no cuento con una herramienta de borrado de archivos en este entorno:
  - `checkout.js` (raíz)
  - `confirm.js` (raíz)
  - `usage.js` (raíz)

  Confirmé que son código muerto:
  - Ninguno aparece en la sección `functions` de `vercel.json` (que solo lista `api/*.js`), y Vercel no despliega automáticamente archivos `.js` sueltos en la raíz del proyecto como funciones serverless.
  - `usage.js` (raíz) importa `./_limits.js`, que **no existe en la raíz** (solo existe en `api/_limits.js`) — es decir, ni siquiera podría compilarse si Vercel intentara usarlo.

  Para borrarlos con GitHub Desktop: en el panel de archivos, haz clic derecho sobre `checkout.js`, `confirm.js` y `usage.js` (los de la raíz, **no** los de `api/`) → "Move to Trash" (o bórralos desde Finder) → vuelve a GitHub Desktop y confirma el commit. Si prefieres terminal:
  ```
  git rm checkout.js confirm.js usage.js
  git commit -m "Remove dead duplicate root-level API files"
  ```

## 6. Resultado de las pruebas

**Importante — limitación de este entorno:** el sandbox de shell de esta sesión falló de forma persistente (`No space left on device` / `useradd failed`) durante toda la tarea, incluida ahora. No pude ejecutar `node --check` ni `npm test` yo mismo. Siguiendo la instrucción de no afirmar que algo está corregido sin probarlo, aquí está exactamente qué se verificó y cómo, y qué falta que ejecutes tú:

**Verificado por revisión manual de código (lectura completa de cada archivo modificado, trazando el flujo de datos):**

| # | Prueba solicitada | Verificación |
|---|---|---|
| 1 | `checkout` devuelve 401 sin JWT | `requireUser()` se llama antes de cualquier lógica de Stripe; si falla, ya envió 401 y retorna |
| 2 | `checkout` ignora userId falsificado | El body solo se lee para `userName` (saneado, opcional); `userId`/`userEmail` vienen de `user.id`/`user.email` |
| 3 | `portal` devuelve 401 sin JWT | Mismo patrón `requireUser()` |
| 4 | `portal` nunca abre el cliente Stripe de otro usuario | `customerId` se busca filtrando por el `userId` autenticado; el body ya no se lee para `userId` |
| 5 | `confirm` rechaza sesión de otro usuario | Compara `session.client_reference_id`/`metadata.supabase_user_id` (fijados por nuestro propio `checkout.js`, no por el cliente) contra el `userId` del JWT; 403 si no coincide |
| 6 | `search`/`assistant` devuelven 401 sin JWT y no llaman a Anthropic | `requireUser()` retorna antes del `fetch` a `api.anthropic.com` en ambos archivos (verificado por orden de líneas) |
| 7 | Los endpoints de IA no permiten saltar límites omitiendo userId | `userId` ya no se lee del body en ningún endpoint de IA — siempre viene del JWT |
| 8 | Solicitudes concurrentes no pierden incrementos | `consume_ai_usage()` usa `SELECT ... FOR UPDATE`, serializando transacciones sobre la misma fila `(user_id, month)` — verificado por diseño de la función SQL; **recomiendo una prueba de carga real tras desplegar** |
| 9 | Una solicitud bloqueada por límite no llama a Anthropic | `consumeUsage()` se llama y se verifica `allowed` antes del `fetch` a Anthropic en `search.js`/`assistant.js`/`lexicon.js` |
| 10 | HTML malicioso se muestra como texto | Rastreado manualmente: `<img src=x onerror="alert('xss')">` → `escHtml()` → `&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;` (nunca se interpreta como HTML) |
| 11 | URLs `javascript:` no llegan a `href`/`src` | `safeUrl()` solo acepta `protocol === 'https:'`, usado en todos los puntos donde una URL dinámica se asigna a `src`/`href` en los 8 archivos frontend tocados |
| 12 | `active`/`trialing` se interpretan correctamente | Verificado en `_limits.js`, la función SQL `consume_ai_usage`, `webhook.js`, `checkout.js`, `confirm.js`, `home.html`, `landing.html` |

**Escrito pero NO ejecutado por mí (requiere que lo corras tú):**

- `tests/security.test.js` — suite con `node:test` que cubre de forma automatizada y ejecutable: escapado XSS (incluyendo el payload exacto `<img src=x onerror="alert('xss')">` que pediste verificar), rechazo de URLs `javascript:`/`data:`, validación de `book`/`chapter`/`verse`, límites de tamaño en `history` y `sourceVerses` (la superficie de abuso de `textual.js`), comparación de firma en tiempo constante del webhook (incluyendo el caso de rotación con múltiples `v1=`), rechazo de payload alterado, rechazo de timestamp viejo, e interpretación de `active`/`trialing`.
- Prueba #13 (`node --check` sobre todo el JS de servidor): agregué el script `npm run check`, que ejecuta `node --check` sobre `api/*.js` y los `.js` de la raíz.

**Comandos exactos para que los corras tú** (en la carpeta del repo, con Node ≥ 18.17 o idealmente 20 LTS instalado):
```
npm test
npm run check
```
Si `npm test` reporta algún fallo o `npm run check` marca un error de sintaxis, avísame el mensaje exacto y lo corrijo de inmediato — no debería haber ninguno dado que cada archivo fue revisado línea por línea, pero no puedo garantizarlo sin ejecutarlo.

## 7. Riesgos que todavía quedan

- **No pude ejecutar las pruebas automatizadas ni `node --check` en este entorno** (ver sección 6) — es el riesgo más importante pendiente. Corre los dos comandos de arriba antes de hacer deploy a producción.
- **Rate limiting por IP** no se implementó (solo por usuario autenticado vía `check_rate_limit`), porque Vercel serverless no expone de forma confiable la IP real sin configuración adicional de proxy/edge, y el pedido lo marcaba como "si la arquitectura lo permite". El límite por usuario ya cubre el caso principal (una cuenta no puede abusar del sistema), pero un atacante con muchas cuentas gratuitas podría, en teoría, distribuir carga. Si te preocupa, puedo añadir un límite adicional por IP usando `req.headers['x-forwarded-for']` como aproximación.
- **CSP (Content-Security-Policy) no se implementó todavía.** El proyecto usa scripts inline extensivamente (handlers `onclick` restantes en atributos estáticos, bloques `<script>` inline) en varios HTML, lo que haría que una CSP estricta sin `unsafe-inline` rompiera la app tal como está hoy. Recomiendo una migración gradual: primero mover todo el JS inline a archivos `.js` externos (ya existe el patrón con `auth.js`), y solo entonces añadir una CSP como `default-src 'self'; script-src 'self' https://js.stripe.com; connect-src 'self' https://*.supabase.co https://api.stripe.com; frame-src https://js.stripe.com; img-src 'self' https: data:;` (sin `unsafe-eval`, como pediste). No la agregué en este pase para no arriesgar romper la app en producción sin poder probarlo en vivo.
- **Rate limiting por IP para usuarios NO autenticados** no aplica ya en la práctica: todos los endpoints de IA ahora exigen JWT, así que un visitante anónimo no puede ni siquiera llegar al punto donde se necesitaría ese control.
- Los 3 archivos duplicados en la raíz (`checkout.js`, `confirm.js`, `usage.js`) siguen en el repo — confirmé que son código muerto pero no los borré por no tener herramienta de borrado de archivos en este entorno (ver sección 5 para instrucciones exactas).
- El escaneo de XSS cubrió exhaustivamente los archivos nombrados explícitamente (`home.html`, `landing.html`, `admin.html`, `profile.html`, `actividades.html`, `cronicas.html`, `upload.html`, `auth.js`) más `index.html` (no estaba en la lista pero es el archivo más grande y central de la app). No revisé cada archivo `.html` del repo de forma exhaustiva línea por línea si no aparecía en un `grep` de `innerHTML` — si existe alguna otra página HTML del sitio con contenido dinámico que no haya sido `grep`eada, podría tener el mismo patrón. Puedo hacer una segunda pasada si me confirmas qué otras páginas existen.

## 8. Confirmación de compatibilidad web y Capacitor

- **Web:** todos los endpoints protegidos ahora reciben `Authorization: Bearer <token>` desde `kapiFetch()`/`fetch()` en `index.html`, `profile.html`, `landing.html` y `auth.js`, usando el token de la sesión activa de Supabase (`getSupabase().auth.getSession()`). El flujo de Stripe Checkout, el portal de facturación y la confirmación post-pago funcionan igual que antes desde la perspectiva del usuario — solo que ahora el servidor verifica la identidad en vez de confiar en el cliente.
- **Capacitor (nativo):** `kapiFetch()` sigue funcionando igual — para nativo usa `CapacitorHttp.request()` con los headers que le pasamos, y ahora esos headers incluyen `Authorization` cuando corresponde. Encontré y corregí una regresión que casi introduzco: en la Traducción Kodesh (`api/textual`), el código original leía `res.headers.get('content-type')`, pero el objeto que devuelve `kapiFetch()` en nativo (vía `CapacitorHttp`) no tiene `.headers`. Lo protegí con una verificación (`res.headers && typeof res.headers.get === 'function'`) que asume JSON cuando no hay `headers` disponibles — que es siempre el caso en nuestra propia API. Sin este ajuste, la app nativa se habría roto al abrir la Traducción Kodesh.
- El flujo de compra directa por RevenueCat/StoreKit en nativo (`purchasePremiumDirect()`) no fue tocado — sigue sin pasar por `api/checkout.js`, como ya funcionaba.
- `api/app-version.js` y el enlace temporal de Android no se tocaron, tal como pediste.

## 9. Cómo cambió cada flujo

**Stripe Checkout:** antes → el cliente enviaba `userId/userEmail/userName` y el servidor confiaba en ellos. Ahora → el servidor exige JWT, ignora identidad del body, y el frontend agrega `Authorization: Bearer <token>` a la llamada.

**Confirmación post-pago:** antes → `{userId, sessionId}` sin verificar que la sesión perteneciera a ese usuario. Ahora → `{sessionId}` con `Authorization`; el servidor recupera la sesión de Stripe y compara `client_reference_id`/`metadata` contra el JWT antes de activar Premium.

**Portal de facturación:** antes → `{userId}` del body. Ahora → sin body, solo `Authorization`; el servidor busca el `stripe_customer_id` del usuario autenticado.

**Búsqueda / Asistente / Léxico:** antes → `userId` opcional en el body (si se omitía, sin límite). Ahora → `Authorization` obligatorio, 401 si falta, cuota reservada atómicamente antes de llamar a Anthropic, liberada si la llamada falla.

**Traducción Kodesh (`textual`):** antes → sin autenticación, aceptaba `sourceVerses` arbitrario. Ahora → requiere `Authorization` y plan premium, valida `sourceVerses` (máx. 176 versículos, 2000 caracteres cada uno), rate limit de 20 generaciones/hora.

**Interlineal / calentamiento de caché:** antes → `interlinear-warm` completamente público, invocable en cada carga de capítulo por cualquiera. Ahora → requiere sesión, rate limit de 30/hora, y bloqueo contra generación duplicada simultánea del mismo capítulo.

**Webhook de Stripe:** antes → comparación de firma con `!==` (no es tiempo-constante), solo revisaba la primera firma `v1=`, sin protección contra reentregas duplicadas. Ahora → comparación con `crypto.timingSafeEqual`, revisa todas las firmas `v1=` presentes (tolera rotación de secreto), y usa la tabla `stripe_webhook_events` para ignorar eventos ya procesados.

**XSS en toda la app:** antes → nombres, comentarios, notas, URLs de imágenes y resultados de búsqueda de IA se insertaban con `innerHTML` sin escapar. Ahora → todo pasa por `textContent`/construcción DOM (`createElement`, `appendChild`) o por `escHtml()` antes de tocar el DOM; las URLs dinámicas pasan por `safeUrl()`, que solo acepta `https:`.
