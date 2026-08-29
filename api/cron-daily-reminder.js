// KODESH — Recordatorios diarios por push notification, en tres momentos:
//
//   type=promise  (mañana) — la promesa del día, a TODOS los que tienen un
//                 token guardado. Es contenido devocional, no un recordatorio
//                 condicional — sale todos los días sin importar el estado
//                 de lectura del usuario.
//
//   type=reading  (tarde)  — a quien NO ha leído hoy todavía. Se ramifica en
//                 tres categorías, mutuamente excluyentes por usuario:
//                   - winback: no ha vuelto a abrir la app en exactamente
//                     3, 7, 14 o 30 días desde su última lectura — "te
//                     extrañamos". Los días exactos (no "3+") evitan
//                     bombardear todos los días a alguien ya inactivo.
//                   - streak_risk: tiene una racha activa (current_streak>0)
//                     y no ha leído hoy — "no pierdas tu racha".
//                   - reading_reminder: cualquier otro caso (sin racha,
//                     nunca leyó, o lejos de los cortes de winback) —
//                     recordatorio genérico de lectura.
//
//   type=night    (noche)  — devocional nocturno, invitación a cerrar el día
//                 con la Palabra antes de dormir. Sale para TODOS los que
//                 tienen un token guardado, igual que type=promise — no
//                 depende de si el usuario ya leyó hoy.
//
// Se dispara de dos formas:
//   1. Vercel Cron (GET, autenticado con CRON_SECRET — ver vercel.json),
//      una vez por tipo, en horarios distintos.
//   2. Botones manuales en el panel admin (POST, autenticado como admin
//      normal), para probar o disparar a mano sin esperar al cron.
//
// Nota sobre zonas horarias: last_read_date es una columna `date` sin huso
// horario guardada desde el navegador del usuario (ver auth.js updateStreak).
// No sabemos el huso horario real de cada usuario, así que comparamos contra
// la fecha UTC del servidor — puede haber un desfase de hasta un día cerca
// de la medianoche para algunos usuarios. Aceptable para un recordatorio.
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions, sendError, ERR } from './_security.js';
import { getFcm } from './_firebase.js';
import { getDailyPromiseForUser } from './_promises.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// Días exactos de inactividad en los que mandamos "te extrañamos" — no en
// cada uno de forma continua, solo en estos cortes.
const WINBACK_DAYS = [3, 7, 14, 30];

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(dateStr, todayStr) {
  const a = new Date(dateStr + 'T00:00:00Z');
  const b = new Date(todayStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] !== 'undefined') return req.query[name];
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get(name);
  } catch {
    return null;
  }
}

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`sbGet ${path} -> ${r.status}`);
  return r.json();
}

async function sbDeleteTokens(ids) {
  if (!ids.length) return;
  await fetch(`${SB_URL}/rest/v1/user_push_tokens?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }).catch(() => {});
}

// Fila en push_notification_log para el historial visible en el panel admin.
// admin es null cuando dispara Vercel Cron (no hay sesión) — se guarda como
// "Vercel Cron" para que quede claro en el historial que no fue manual.
async function logNotification({ admin, kind, targetLabel, title, body, result }) {
  const row = {
    sent_by: admin?.id || null,
    sent_by_email: admin?.email || 'Vercel Cron',
    kind,
    target_label: targetLabel,
    title,
    body: body || null,
    sent_count: result.sent,
    failed_count: result.failed,
    total_count: result.sent + result.failed,
  };
  await fetch(`${SB_URL}/rest/v1/push_notification_log`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  }).catch(err => console.warn('logNotification: fallo al guardar en el historial:', err.message));
}

const TYPE_TITLES = {
  promise: 'Promesa del día',
  reading: 'Lectura / Racha / Te extrañamos',
  night: 'Antes de dormir',
};

function groupTokensByUser(tokens) {
  const map = new Map();
  for (const t of tokens) {
    if (!map.has(t.user_id)) map.set(t.user_id, []);
    map.get(t.user_id).push(t);
  }
  return map;
}

// ── type=promise — mañana, a todos ──
async function buildPromiseReminders() {
  const tokens = await sbGet('user_push_tokens?select=id,user_id,token');
  const tokensByUser = groupTokensByUser(tokens);

  const jobs = [];
  for (const [userId, userTokens] of tokensByUser) {
    const promesa = getDailyPromiseForUser(userId);
    jobs.push({
      userId,
      tokens: userTokens,
      category: 'daily_promise',
      title: '✨ Promesa de hoy',
      body: `"${promesa.texto}" — ${promesa.ref}`,
    });
  }
  return jobs;
}

// ── type=reading — tarde, condicional por usuario ──
async function buildReadingReminders() {
  const [tokens, streaks] = await Promise.all([
    sbGet('user_push_tokens?select=id,user_id,token'),
    sbGet('reading_streaks?select=user_id,current_streak,last_read_date'),
  ]);

  const streakByUser = new Map(streaks.map(s => [s.user_id, s]));
  const today = todayUTC();
  const tokensByUser = groupTokensByUser(tokens);

  const jobs = [];
  for (const [userId, userTokens] of tokensByUser) {
    const streak = streakByUser.get(userId);

    if (streak && streak.last_read_date === today) continue; // ya leyó hoy

    const inactiveDays = streak?.last_read_date ? daysSince(streak.last_read_date, today) : null;

    if (inactiveDays !== null && WINBACK_DAYS.includes(inactiveDays)) {
      jobs.push({
        userId, tokens: userTokens, category: 'winback',
        title: '💛 Te extrañamos',
        body: `Hace ${inactiveDays} días que no abres KODESH. Tu Biblia te está esperando.`,
      });
    } else if (streak && streak.current_streak > 0) {
      jobs.push({
        userId, tokens: userTokens, category: 'streak_risk',
        title: '🔥 No pierdas tu racha',
        body: `Llevas ${streak.current_streak} día${streak.current_streak === 1 ? '' : 's'} seguidos leyendo. Lee un capítulo hoy para no perderla.`,
      });
    } else {
      jobs.push({
        userId, tokens: userTokens, category: 'reading_reminder',
        title: '📖 Un momento para leer',
        body: 'Aparta unos minutos hoy para leer tu Biblia.',
      });
    }
  }
  return jobs;
}

// ── type=night — devocional nocturno, a TODOS los que tienen un token ──
// Invitación a cerrar el día con la Palabra antes de dormir. A diferencia de
// type=reading, no depende de si el usuario ya leyó hoy — es un devocional
// nocturno, no un recordatorio de racha/inactividad, así que sale para todos
// por igual (mismo criterio que type=promise).
async function buildNightReminders() {
  const tokens = await sbGet('user_push_tokens?select=id,user_id,token');
  const tokensByUser = groupTokensByUser(tokens);

  const jobs = [];
  for (const [userId, userTokens] of tokensByUser) {
    jobs.push({
      userId, tokens: userTokens, category: 'night_reading',
      title: '🌙 Antes de dormir',
      body: 'Cierra el día con la Palabra — un capítulo antes de dormir.',
    });
  }
  return jobs;
}

async function sendReminders(jobs) {
  const fcm = getFcm();
  const staleIds = [];
  const byCategory = {};
  let sent = 0, failed = 0;

  const results = await Promise.allSettled(
    jobs.flatMap(job =>
      job.tokens.map(t =>
        fcm.send({ token: t.token, notification: { title: job.title, body: job.body } })
          .then(() => { byCategory[job.category] = (byCategory[job.category] || 0) + 1; })
          .catch(err => {
            const code = err?.errorInfo?.code || err?.code || '';
            if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
              staleIds.push(t.id);
            }
            throw err;
          })
      )
    )
  );

  results.forEach(r => { if (r.status === 'fulfilled') sent++; else failed++; });
  await sbDeleteTokens(staleIds);

  return { sent, failed, staleRemoved: staleIds.length, byCategory, usersNotified: jobs.length };
}

export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, POST, OPTIONS' });
  if (handleOptions(req, res)) return;

  let admin = null;
  if (req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return sendError(res, 401, ERR.unauthorized, null, 'cron-daily-reminder');
    }
  } else if (req.method === 'POST') {
    admin = await requireAdmin(req, res);
    if (!admin) return; // requireAdmin ya mandó 401/403
  } else {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const type = req.method === 'GET' ? getQueryParam(req, 'type') : req.body?.type;
  if (type !== 'promise' && type !== 'reading' && type !== 'night') {
    return sendError(res, 400, ERR.badRequest, null, 'cron-daily-reminder');
  }

  const dryRun = req.method === 'GET'
    ? getQueryParam(req, 'dry_run') === '1'
    : req.body?.dryRun === true;

  try {
    const jobs = type === 'promise' ? await buildPromiseReminders()
      : type === 'reading' ? await buildReadingReminders()
      : await buildNightReminders();

    if (dryRun) {
      const byCategory = jobs.reduce((acc, j) => {
        acc[j.category] = (acc[j.category] || 0) + 1;
        return acc;
      }, {});
      return res.status(200).json({ success: true, dryRun: true, type, usersToNotify: jobs.length, byCategory });
    }

    const result = await sendReminders(jobs);
    await logNotification({
      admin, kind: type, title: TYPE_TITLES[type] || type,
      targetLabel: `${jobs.length} usuario${jobs.length === 1 ? '' : 's'} elegible${jobs.length === 1 ? '' : 's'}`,
      result,
    });
    return res.status(200).json({ success: true, type, ...result });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'cron-daily-reminder');
  }
}
