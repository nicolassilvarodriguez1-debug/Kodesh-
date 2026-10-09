// KODESH Admin API — only accessible by users with a role in admin_roles,
// verified via JWT + 2FA (aal2). See api/_auth.js.
import { requireAdmin } from './_auth.js';
import { applyCors, handleOptions } from './_security.js';
import { getFcm } from './_firebase.js';
import { loadCalendar } from './_calendar.js';
import { openManualPeriod, closeManualPeriods } from './_premiumHistory.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return res.json();
}

// Fetch ALL rows for a query, paginating past Supabase's default 1000-row limit.
async function sbGetAll(path) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const pageUrl = `${path}${sep}limit=${PAGE}&offset=${offset}`;
    const rows = await sbGet(pageUrl);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// Count rows server-side (no rows downloaded, no 1000-row cap). PostgREST
// returns the total in Content-Range: "*/1550".
async function sbCount(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Prefer': 'count=exact',
    }
  });
  if (!res.ok) throw new Error(`sbCount ${path} -> ${res.status}`);
  const total = res.headers.get('content-range')?.split('/')[1];
  return parseInt(total, 10) || 0;
}

// Fetch ALL auth users, paginating (GoTrue caps per_page; with a single
// request of per_page=500, user #501+ silently disappeared from the panel).
async function getAllAuthUsers() {
  const PER_PAGE = 200;
  const all = [];
  for (let page = 1; page <= 500; page++) {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    if (!r.ok) throw new Error(`auth users page ${page} -> ${r.status}`);
    const users = (await r.json()).users || [];
    all.push(...users);
    if (users.length < PER_PAGE) break;
  }
  return all;
}

async function sbRpc(fn, args = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`sbRpc ${fn} -> ${res.status}`);
  return res.json();
}

async function sbUpsert(table, body, onConflict) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(body)
  });
  return res.ok;
}

// Fila en push_notification_log — ver también api/cron-daily-reminder.js,
// que tiene su propia copia de esta función (los recordatorios masivos
// corren en ese archivo, no aquí, y no vale la pena compartir un módulo
// solo para esto).
async function logNotification({ admin, kind, targetLabel, title, body, sent, failed }) {
  const row = {
    sent_by: admin?.id || null,
    sent_by_email: admin?.email || null,
    kind,
    target_label: targetLabel,
    title,
    body: body || null,
    sent_count: sent,
    failed_count: failed,
    total_count: sent + failed,
  };
  await fetch(`${SB_URL}/rest/v1/push_notification_log`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  }).catch(err => console.warn('logNotification: fallo al guardar en el historial:', err.message));
}

// ── Insignias de las porciones (Storage público «insignias» + index.json) ──
const BADGE_BUCKET = 'insignias';
const BADGE_SEED = Object.fromEntries([1, 2, 3, 4].map(n => [n, `https://www.kodeshbible.com/insignias/${n}.webp?v=20261008`]));
const badgePublic = p => `${SB_URL}/storage/v1/object/public/${BADGE_BUCKET}/${p}`;
async function badgeEnsureBucket() {
  const r = await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BADGE_BUCKET, name: BADGE_BUCKET, public: true, allowed_mime_types: ['image/webp', 'image/png', 'image/jpeg', 'application/json'], file_size_limit: 3145728 }),
  });
  if (!r.ok && r.status !== 409 && r.status !== 400) throw new Error(`bucket → ${r.status}`);
}
async function badgeManifest() {
  const r = await fetch(`${badgePublic('index.json')}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return { ...BADGE_SEED };
  try { return await r.json(); } catch (e) { return { ...BADGE_SEED }; }
}
async function badgePut(path, body, type, cache = 'max-age=31536000') {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BADGE_BUCKET}/${path}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': cache },
    body,
  });
  if (!r.ok) throw new Error(`storage → ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`);
}
async function badgeSaveManifest(m) {
  const sorted = Object.fromEntries(Object.entries(m).sort((a, b) => a[0] - b[0]));
  await badgePut('index.json', JSON.stringify(sorted), 'application/json', 'max-age=0');
  return sorted;
}


// ── Arte de las fiestas y ajustes del calendario bíblico (mismo bucket público) ──
import { HOME_IDS, TIEMPO_IDS } from './_art.js';
const FEAST_IDS = ['pesaj', 'matzot', 'bikurim', 'shavuot', 'terua', 'kipur', 'sukot', 'shabat'];
async function publicJson(path, fallback) {
  const r = await fetch(`${badgePublic(path)}?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return fallback;
  try { return await r.json(); } catch (e) { return fallback; }
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function cleanCalendarAdj(raw) {
  const out = { m: {}, n: {} };
  for (const [k, v] of Object.entries(raw?.m || {})) {
    if (!ISO.test(k) || !ISO.test(v)) continue;
    const d = (Date.parse(v) - Date.parse(k)) / 864e5;
    if (Math.abs(d) <= 2 && d !== 0) out.m[k] = v;
  }
  for (const [y, v] of Object.entries(raw?.n || {})) if (/^\d{4}$/.test(y) && ISO.test(v)) out.n[y] = v;
  // c: lunas confirmadas (vistas) en la fecha que se esperaba
  const c = {}; for (const [k, v] of Object.entries(raw?.c || {})) if (ISO.test(k) && v === true) c[k] = true;
  if (Object.keys(c).length) out.c = c;
  return out;
}

export default async function handler(req, res) {
  // Was previously hand-rolled with `Access-Control-Allow-Headers: Content-Type`
  // only (missing Authorization) — the only authenticated POST endpoint in
  // /api that diverged from the shared allowlist. A same-origin fetch()
  // (the normal admin.html path) isn't affected by this, but any request
  // that ends up cross-origin (e.g. the WKWebView fetch() fallback in
  // index.html's kapiFetch, or a Vercel preview URL) would have its
  // preflight silently strip the Authorization header, producing a 401 that
  // looks identical to an expired/invalid token. Now matches every other
  // protected endpoint (search.js, assistant.js, lexicon.js, textual.js,
  // interlinear.js).
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return; // requireAdmin already sent 401/403

  const { action } = req.body;

  // Actions that touch billing/PII (plans, user list, lookups by email) are superadmin-only.
  const SUPERADMIN_ONLY_ACTIONS = new Set(['find_user', 'set_plan', 'premium_history']);
  const isDashboard = !action; // default (no action) branch = full user dashboard
  if (admin.role !== 'superadmin' && (SUPERADMIN_ONLY_ACTIONS.has(action) || isDashboard)) {
    return res.status(403).json({ error: 'forbidden_role' });
  }

  // ── ACTION: insignias (arte de las 54 porciones) ──
  if (action === 'badge_art_list') {
    try { return res.status(200).json({ art: await badgeManifest() }); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }
  if (action === 'badge_art_upload' || action === 'badge_art_delete') {
    const num = parseInt(req.body.num, 10);
    if (!(num >= 1 && num <= 54)) return res.status(400).json({ error: 'Número de porción inválido (1–54)' });
    try {
      await badgeEnsureBucket();
      const m = await badgeManifest();
      if (action === 'badge_art_delete') { delete m[num]; return res.status(200).json({ art: await badgeSaveManifest(m) }); }
      const type = ['image/webp', 'image/png', 'image/jpeg'].includes(req.body.type) ? req.body.type : null;
      if (!type || typeof req.body.data !== 'string') return res.status(400).json({ error: 'Imagen inválida' });
      const buf = Buffer.from(req.body.data, 'base64');
      if (buf.length < 1000 || buf.length > 3145728) return res.status(400).json({ error: 'La imagen debe pesar menos de 3 MB' });
      const ext = type.split('/')[1].replace('jpeg', 'jpg');
      const path = `${num}-${Date.now()}.${ext}`;
      await badgePut(path, buf, type);
      m[num] = badgePublic(path);
      return res.status(200).json({ art: await badgeSaveManifest(m), url: m[num] });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ACTION: arte de las fiestas ──
  if (action === 'feast_art_list') {
    try { return res.status(200).json({ art: await publicJson(req.body.set === 'inicio' ? 'inicio.json' : 'fiestas.json', {}) }); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }
  if (action === 'feast_art_upload' || action === 'feast_art_delete') {
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
    const id = String(req.body.id || '');
    const home = req.body.set === 'inicio', file = home ? 'inicio.json' : 'fiestas.json';
    if (home ? !(HOME_IDS.includes(id) || /^p([1-9]|[1-4]\d|5[0-4])$/.test(id) || (id.startsWith('tl_') && TIEMPO_IDS.includes(id.slice(3)))) : !FEAST_IDS.includes(id)) return res.status(400).json({ error: 'Imagen inválida' });
    try {
      await badgeEnsureBucket();
      const m = await publicJson(file, {});
      if (action === 'feast_art_delete') delete m[id];
      else {
        const type = ['image/webp', 'image/png', 'image/jpeg'].includes(req.body.type) ? req.body.type : null;
        if (!type || typeof req.body.data !== 'string') return res.status(400).json({ error: 'Imagen inválida' });
        const buf = Buffer.from(req.body.data, 'base64');
        if (buf.length < 1000 || buf.length > 3145728) return res.status(400).json({ error: 'La imagen debe pesar menos de 3 MB' });
        const path = `${home ? 'inicio' : 'fiesta'}-${id}-${Date.now()}.${type.split('/')[1].replace('jpeg', 'jpg')}`;
        await badgePut(path, buf, type);
        m[id] = badgePublic(path);
      }
      await badgePut(file, JSON.stringify(m), 'application/json', 'max-age=0');
      return res.status(200).json({ art: m });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }
  // ── ACTION: ajustes del calendario bíblico (luna vista / cebada aviv) ──
  if (action === 'calendar_get') {
    try { return res.status(200).json({ adj: cleanCalendarAdj(await publicJson('calendario.json', {})) }); }
    catch (err) { return res.status(500).json({ error: err.message }); }
  }
  if (action === 'calendar_save') {
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
    try {
      await badgeEnsureBucket();
      const adj = cleanCalendarAdj(req.body.adj);
      adj.updated = new Date().toISOString();
      await badgePut('calendario.json', JSON.stringify(adj), 'application/json', 'max-age=0');
      return res.status(200).json({ adj });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ACTION: luna nueva confirmada → guarda y avisa a quien lo pidió (tema FCM) ──
  if (action === 'moon_announce') {
    if (admin.role !== 'superadmin') return res.status(403).json({ error: 'forbidden_role' });
    const pred = req.body.pred;
    if (!ISO.test(pred || '')) return res.status(400).json({ error: 'Mes inválido' });
    try {
      await badgeEnsureBucket();
      const adj = cleanCalendarAdj(await publicJson('calendario.json', {}));
      if (!adj.m[pred]) { adj.c = adj.c || {}; adj.c[pred] = true; }
      adj.updated = new Date().toISOString();
      await badgePut('calendario.json', JSON.stringify(adj), 'application/json', 'max-age=0');
      const C = await loadCalendar(adj), ms = C.months(), k = ms.findIndex(m => m.pred === pred);
      if (k < 0) return res.status(400).json({ error: 'Mes fuera de la tabla' });
      const nm = C.monthName(C.monthNum(k)), full = nm.ord.toLowerCase() + (nm.old ? ` (${nm.old})` : '');
      const title = '🌙 Se vio la luna nueva';
      const body = `Desde Jerusalén. Al atardecer comienza el ${full}.`;
      let sent = 0, failed = 0;
      if (req.body.notify !== false) {
        try { await getFcm().send({ topic: 'luna-nueva', notification: { title, body }, data: { kind: 'moon' } }); sent = 1; }
        catch (e) { failed = 1; console.warn('moon_announce push:', e.message); }
        await logNotification({ admin, kind: 'moon', targetLabel: 'Tema: luna-nueva', title, body, sent, failed });
      }
      return res.status(200).json({ adj, sent: !!sent, body });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ACTION: find_user (used by roles tab) ──
  if (action === 'find_user') {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email requerido' });
    try {
      const authUsers = await getAllAuthUsers();
      const found = authUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
      return res.status(200).json({ foundUser: found ? { id: found.id, email: found.email } : null });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: premium_history (quién tuvo Premium y cuánto tiempo) ──
  if (action === 'premium_history') {
    try {
      const [periods, authUsers, profiles] = await Promise.all([
        sbGetAll('premium_periods?select=user_id,source,product,status,had_trial,started_at,ended_at&order=started_at.desc,id.desc'),
        getAllAuthUsers(),
        sbGetAll('user_profiles?select=id,display_name&order=id'),
      ]);
      const nameMap = {};
      (profiles || []).forEach(p => { nameMap[p.id] = p.display_name; });
      const userMap = {};
      authUsers.forEach(u => { userMap[u.id] = u; });
      const rows = (periods || []).map(p => {
        const u = userMap[p.user_id];
        return {
          ...p,
          email: u?.email || null,
          name: nameMap[p.user_id] || u?.user_metadata?.full_name || u?.email?.split('@')[0] || '(cuenta eliminada)',
        };
      });
      return res.status(200).json({ periods: rows });
    } catch (err) {
      console.error('premium_history error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: set_plan (upgrade/downgrade user) ──
  if (action === 'set_plan') {
    const { targetUserId, plan } = req.body;
    if (!targetUserId || !['free', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'targetUserId y plan (free|premium) son requeridos' });
    }
    try {
      const body = {
        user_id: targetUserId,
        plan,
        subscription_status: plan === 'premium' ? 'active' : 'inactive',
        current_period_end: null,
        updated_at: new Date().toISOString(),
      };
      const ok = await sbUpsert('user_plans', body, 'user_id');
      if (!ok) throw new Error('No se pudo actualizar el plan');
      // Historial Premium: el regalo manual abre/cierra su propio período.
      // Si falla no se revierte el cambio de plan — el cron diario lo repara.
      try {
        if (plan === 'premium') await openManualPeriod(targetUserId);
        else await closeManualPeriods(targetUserId);
      } catch (e) { console.warn('premium_periods (set_plan):', e.message); }
      return res.status(200).json({ success: true, plan });
    } catch(err) {
      console.error('set_plan error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: send_user_push (mandar un push a un usuario específico) ──
  // A diferencia de push-test.js (solo al propio admin) o cron-daily-reminder
  // (masivo a todos), esto manda a los tokens de UN userId puntual — pensado
  // para usarse junto con find_user (buscar por email en el panel) para
  // resolver el targetUserId antes de llamar aquí.
  if (action === 'send_user_push') {
    const { targetUserId, targetEmail, title, body: pushBody } = req.body;
    if (!targetUserId || !title || !pushBody) {
      return res.status(400).json({ error: 'targetUserId, title y body son requeridos' });
    }
    try {
      const tokens = await sbGet(`user_push_tokens?user_id=eq.${targetUserId}&select=id,token`);
      if (!Array.isArray(tokens) || tokens.length === 0) {
        return res.status(404).json({ error: 'no_token_registered' });
      }

      const fcm = getFcm();
      const results = await Promise.allSettled(tokens.map(t =>
        fcm.send({ token: t.token, notification: { title, body: pushBody } })
      ));

      let sent = 0;
      const staleIds = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          sent++;
        } else {
          const code = result.reason?.errorInfo?.code || result.reason?.code || '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
            staleIds.push(tokens[i].id);
          }
          console.warn('send_user_push: fallo al enviar a un token:', code || result.reason?.message);
        }
      });

      if (staleIds.length) {
        await fetch(`${SB_URL}/rest/v1/user_push_tokens?id=in.(${staleIds.join(',')})`, {
          method: 'DELETE',
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        }).catch(() => {});
      }

      await logNotification({
        admin, kind: 'individual', title, body: pushBody,
        targetLabel: targetEmail || targetUserId,
        sent, failed: tokens.length - sent,
      });

      return res.status(200).json({ success: true, sent, total: tokens.length });
    } catch (err) {
      console.error('send_user_push error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: notification_log (historial de push enviados) ──
  if (action === 'notification_log') {
    try {
      const rows = await sbGet('push_notification_log?select=*&order=sent_at.desc&limit=50');
      return res.status(200).json({ rows: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      console.error('notification_log error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: interlinear_coverage (cache coverage by book/chapter) ──
  if (action === 'interlinear_coverage') {
    const BOOK_CHAPTERS = {
      GEN:50, EXO:40, LEV:27, NUM:36, DEU:34, JOS:24, JDG:21, RUT:4, '1SA':31, '2SA':24,
      '1KI':22, '2KI':25, '1CH':29, '2CH':36, EZR:10, NEH:13, EST:10, JOB:42, PSA:150, PRO:31,
      ECC:12, SNG:8, ISA:66, JER:52, LAM:5, EZK:48, DAN:12, HOS:14, JOL:3, AMO:9,
      OBA:1, JON:4, MIC:7, NAM:3, HAB:3, ZEP:3, HAG:2, ZEC:14, MAL:4,
      MAT:28, MRK:16, LUK:24, JHN:21, ACT:28, ROM:16, '1CO':16, '2CO':13, GAL:6, EPH:6,
      PHP:4, COL:4, '1TH':5, '2TH':3, '1TI':6, '2TI':4, TIT:3, PHM:1, HEB:13, JAS:5,
      '1PE':5, '2PE':3, '1JN':5, '2JN':1, '3JN':1, JUD:1, REV:22,
    };
    const BOOK_NAMES = {
      GEN:'Génesis', EXO:'Éxodo', LEV:'Levítico', NUM:'Números', DEU:'Deuteronomio',
      JOS:'Josué', JDG:'Jueces', RUT:'Rut', '1SA':'1 Samuel', '2SA':'2 Samuel',
      '1KI':'1 Reyes', '2KI':'2 Reyes', '1CH':'1 Crónicas', '2CH':'2 Crónicas', EZR:'Esdras',
      NEH:'Nehemías', EST:'Ester', JOB:'Job', PSA:'Salmos', PRO:'Proverbios',
      ECC:'Eclesiastés', SNG:'Cantares', ISA:'Isaías', JER:'Jeremías', LAM:'Lamentaciones',
      EZK:'Ezequiel', DAN:'Daniel', HOS:'Oseas', JOL:'Joel', AMO:'Amós',
      OBA:'Abdías', JON:'Jonás', MIC:'Miqueas', NAM:'Nahúm', HAB:'Habacuc',
      ZEP:'Sofonías', HAG:'Hageo', ZEC:'Zacarías', MAL:'Malaquías',
      MAT:'Mateo', MRK:'Marcos', LUK:'Lucas', JHN:'Juan', ACT:'Hechos',
      ROM:'Romanos', '1CO':'1 Corintios', '2CO':'2 Corintios', GAL:'Gálatas', EPH:'Efesios',
      PHP:'Filipenses', COL:'Colosenses', '1TH':'1 Tesalonicenses', '2TH':'2 Tesalonicenses',
      '1TI':'1 Timoteo', '2TI':'2 Timoteo', TIT:'Tito', PHM:'Filemón', HEB:'Hebreos', JAS:'Santiago',
      '1PE':'1 Pedro', '2PE':'2 Pedro', '1JN':'1 Juan', '2JN':'2 Juan', '3JN':'3 Juan', JUD:'Judas', REV:'Apocalipsis',
    };
    const BOOK_ORDER = Object.keys(BOOK_CHAPTERS);

    try {
      // interlinear_cache guarda una fila por PALABRA, no por capítulo (ya
      // son ~238k filas para ~560 capítulos), así que traer la tabla entera
      // con sbGetAll y deduplicar en JS se volvió demasiado lento (llegó a
      // no cargar, por exceder el timeout de la función). En vez de eso,
      // pedimos los pares (book, chapter) ya distintos vía una función SQL
      // — ver migración interlinear_cached_chapters_rpc.
      const cached = await sbRpc('interlinear_cached_chapters');
      const cachedSet = new Set((cached || []).map(r => `${r.book}:${r.chapter}`));

      let totalCached = 0;
      let totalChapters = 0;
      const books = BOOK_ORDER.map(id => {
        const total = BOOK_CHAPTERS[id];
        const chapters = [];
        let cachedCount = 0;
        for (let ch = 1; ch <= total; ch++) {
          const isCached = cachedSet.has(`${id}:${ch}`);
          if (isCached) cachedCount++;
          chapters.push({ chapter: ch, cached: isCached });
        }
        totalCached += cachedCount;
        totalChapters += total;
        return { id, name: BOOK_NAMES[id] || id, total, cached: cachedCount, chapters };
      });

      return res.status(200).json({ totalCached, totalChapters, books });
    } catch(err) {
      console.error('interlinear_coverage error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: traduccion_kodesh_coverage ──
  if (action === 'traduccion_kodesh_coverage') {
    const BOOK_CHAPTERS = {
      GEN:50,EXO:40,LEV:27,NUM:36,DEU:34,JOS:24,JDG:21,RUT:4,'1SA':31,'2SA':24,
      '1KI':22,'2KI':25,'1CH':29,'2CH':36,EZR:10,NEH:13,EST:10,JOB:42,PSA:150,PRO:31,
      ECC:12,SNG:8,ISA:66,JER:52,LAM:5,EZK:48,DAN:12,HOS:14,JOL:3,AMO:9,
      OBA:1,JON:4,MIC:7,NAM:3,HAB:3,ZEP:3,HAG:2,ZEC:14,MAL:4,
      MAT:28,MRK:16,LUK:24,JHN:21,ACT:28,ROM:16,'1CO':16,'2CO':13,GAL:6,EPH:6,
      PHP:4,COL:4,'1TH':5,'2TH':3,'1TI':6,'2TI':4,TIT:3,PHM:1,HEB:13,JAS:5,
      '1PE':5,'2PE':3,'1JN':5,'2JN':1,'3JN':1,JUD:1,REV:22,
    };
    const BOOK_NAMES = {
      GEN:'Génesis',EXO:'Éxodo',LEV:'Levítico',NUM:'Números',DEU:'Deuteronomio',
      JOS:'Josué',JDG:'Jueces',RUT:'Rut','1SA':'1 Samuel','2SA':'2 Samuel',
      '1KI':'1 Reyes','2KI':'2 Reyes','1CH':'1 Crónicas','2CH':'2 Crónicas',EZR:'Esdras',
      NEH:'Nehemías',EST:'Ester',JOB:'Job',PSA:'Salmos',PRO:'Proverbios',
      ECC:'Eclesiastés',SNG:'Cantares',ISA:'Isaías',JER:'Jeremías',LAM:'Lamentaciones',
      EZK:'Ezequiel',DAN:'Daniel',HOS:'Oseas',JOL:'Joel',AMO:'Amós',
      OBA:'Abdías',JON:'Jonás',MIC:'Miqueas',NAM:'Nahúm',HAB:'Habacuc',
      ZEP:'Sofonías',HAG:'Hageo',ZEC:'Zacarías',MAL:'Malaquías',
      MAT:'Mateo',MRK:'Marcos',LUK:'Lucas',JHN:'Juan',ACT:'Hechos',
      ROM:'Romanos','1CO':'1 Corintios','2CO':'2 Corintios',GAL:'Gálatas',EPH:'Efesios',
      PHP:'Filipenses',COL:'Colosenses','1TH':'1 Tesalonicenses','2TH':'2 Tesalonicenses',
      '1TI':'1 Timoteo','2TI':'2 Timoteo',TIT:'Tito',PHM:'Filemón',HEB:'Hebreos',JAS:'Santiago',
      '1PE':'1 Pedro','2PE':'2 Pedro','1JN':'1 Juan','2JN':'2 Juan','3JN':'3 Juan',JUD:'Judas',REV:'Apocalipsis',
    };
    const BOOK_ORDER = Object.keys(BOOK_CHAPTERS);
    try {
      const [cached, reports, lastGenArr] = await Promise.all([
        sbGetAll('textual_cache?select=book_id,chapter'),
        sbGet('textual_reports?select=id,book_id,chapter,verse,comment,created_at&order=created_at.desc&limit=50'),
        sbGet('textual_cache?select=book_id,chapter,created_at&order=created_at.desc&limit=1'),
      ]);

      const cachedSet = new Set((cached || []).map(r => `${r.book_id}:${r.chapter}`));

      // Enriquecer reportes con nombre del libro
      const enrichedReports = (reports || []).map(r => ({
        ...r, book_name: BOOK_NAMES[r.book_id] || r.book_id,
      }));

      let totalCached = 0, totalChapters = 0;
      const books = BOOK_ORDER.map(id => {
        const total = BOOK_CHAPTERS[id];
        let cachedCount = 0;
        const chapters = [];
        for (let ch = 1; ch <= total; ch++) {
          const isCached = cachedSet.has(`${id}:${ch}`);
          if (isCached) cachedCount++;
          chapters.push({ chapter: ch, cached: isCached });
        }
        totalCached += cachedCount;
        totalChapters += total;
        return { id, name: BOOK_NAMES[id] || id, total, cached: cachedCount, chapters };
      });

      return res.status(200).json({
        totalCached, totalChapters, books,
        reports: enrichedReports,
        lastGenerated: (lastGenArr || [])[0] || null,
      });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── ACTION: delete_textual_report ──
  if (action === 'delete_textual_report') {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ error: 'reportId requerido' });
    try {
      const r = await fetch(`${SB_URL}/rest/v1/textual_reports?id=eq.${reportId}`, {
        method: 'DELETE',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      });
      return r.ok ? res.status(200).json({ ok: true }) : res.status(500).json({ error: 'No se pudo borrar' });
    } catch(err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ACTION: delete_textual_cache ──
  if (action === 'delete_textual_cache') {
    const { bookId, chapter } = req.body;
    if (!bookId || !chapter) return res.status(400).json({ error: 'bookId y chapter requeridos' });
    try {
      const r = await fetch(`${SB_URL}/rest/v1/textual_cache?book_id=eq.${bookId}&chapter=eq.${chapter}`, {
        method: 'DELETE',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
      });
      return r.ok ? res.status(200).json({ ok: true }) : res.status(500).json({ error: 'No se pudo borrar' });
    } catch(err) { return res.status(500).json({ error: err.message }); }
  }

  // ── DEFAULT ACTION: dashboard data ──
  const month = new Date().toISOString().slice(0, 7);
  try {
    // Get all auth users via admin API
    // Get profiles, plans, usage — sbGetAll paginates past the 1000-row cap;
    // order= makes offset pagination stable. Lexicon cache is counted in
    // Postgres instead of downloading rows (it was stuck at exactly 1000).
    const [authUsers, profiles, plans, usage, cacheAT, cacheNT] = await Promise.all([
      getAllAuthUsers(),
      sbGetAll('user_profiles?select=id,display_name&order=id'),
      sbGetAll('user_plans?select=user_id,plan,subscription_status,current_period_end&order=user_id'),
      sbGetAll(`ai_usage?select=user_id,searches_used,assistant_used,lexicon_used&month=eq.${month}&order=user_id`),
      sbCount('lexicon_cache?testament=eq.AT'),
      sbCount('lexicon_cache?testament=eq.NT'),
    ]);

    // Build maps
    const profileMap = {};
    (profiles || []).forEach(p => profileMap[p.id] = p.display_name);
    const planMap = {};
    (plans || []).forEach(p => planMap[p.user_id] = p);
    const usageMap = {};
    (usage || []).forEach(u => usageMap[u.user_id] = u);

    // Build user list from auth users
    const users = authUsers.map(u => {
      const profile = profileMap[u.id];
      const plan = planMap[u.id];
      const use = usageMap[u.id] || {};
      const isPremium = plan?.plan === 'premium' && (plan?.subscription_status === 'active' || plan?.subscription_status === 'trialing');
      return {
        id: u.id,
        email: u.email,
        name: profile || u.user_metadata?.full_name || u.email?.split('@')[0] || '—',
        plan: isPremium ? 'premium' : 'free',
        subscription_status: plan?.subscription_status || null,
        provider: u.app_metadata?.provider || 'email',
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        searches: use.searches_used || 0,
        assistant: use.assistant_used || 0,
        lexicon: use.lexicon_used || 0,
      };
    });

    return res.status(200).json({
      users,
      month,
      cache: { total: cacheAT + cacheNT, at: cacheAT, nt: cacheNT },
    });
  } catch(err) {
    console.error('Admin error:', err);
    return res.status(500).json({ error: err.message });
  }
}
