// KODESH — Recordatorio diario por push notification.
//
// Se dispara de dos formas:
//   1. Vercel Cron (GET, autenticado con CRON_SECRET — ver vercel.json).
//   2. Botón manual en el panel admin (POST, autenticado como admin normal),
//      para poder probarlo o dispararlo a mano sin esperar al cron.
//
// Lógica por usuario (solo a quienes tienen al menos un token push guardado):
//   - Si ya leyó hoy (reading_streaks.last_read_date === hoy en UTC) → se
//     omite, no lo molestamos.
//   - Si tiene una racha activa (current_streak > 0) pero no ha leído hoy →
//     "no pierdas tu racha".
//   - Si no tiene racha activa → la promesa del día (misma fórmula que
//     index.html, así coincide con lo que vería si abre la app).
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

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
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

async function buildReminders() {
  const [tokens, streaks] = await Promise.all([
    sbGet('user_push_tokens?select=id,user_id,token'),
    sbGet('reading_streaks?select=user_id,current_streak,last_read_date'),
  ]);

  const streakByUser = new Map(streaks.map(s => [s.user_id, s]));
  const today = todayUTC();

  const tokensByUser = new Map();
  for (const t of tokens) {
    if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, []);
    tokensByUser.get(t.user_id).push(t);
  }

  const jobs = [];
  for (const [userId, userTokens] of tokensByUser) {
    const streak = streakByUser.get(userId);

    if (streak && streak.last_read_date === today) continue; // ya leyó hoy

    let title, body, category;
    if (streak && streak.current_streak > 0) {
      category = 'streak_risk';
      title = '🔥 No pierdas tu racha';
      body = `Llevas ${streak.current_streak} día${streak.current_streak === 1 ? '' : 's'} seguidos leyendo. Lee un capítulo hoy para no perderla.`;
    } else {
      category = 'daily_promise';
      const promesa = getDailyPromiseForUser(userId);
      title = '✨ Promesa de hoy';
      body = `"${promesa.texto}" — ${promesa.ref}`;
    }

    jobs.push({ userId, tokens: userTokens, title, body, category });
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

  if (req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const secret = process.env.CRON_SECRET;
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return sendError(res, 401, ERR.unauthorized, null, 'cron-daily-reminder');
    }
  } else if (req.method === 'POST') {
    const admin = await requireAdmin(req, res);
    if (!admin) return; // requireAdmin ya mandó 401/403
  } else {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const dryRun = req.method === 'GET'
    ? getQueryParam(req, 'dry_run') === '1'
    : req.body?.dryRun === true;

  try {
    const jobs = await buildReminders();

    if (dryRun) {
      const byCategory = jobs.reduce((acc, j) => {
        acc[j.category] = (acc[j.category] || 0) + 1;
        return acc;
      }, {});
      return res.status(200).json({ success: true, dryRun: true, usersToNotify: jobs.length, byCategory });
    }

    const result = await sendReminders(jobs);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, 500, ERR.internal, err, 'cron-daily-reminder');
  }
}
