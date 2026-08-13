import { requireUser } from './_auth.js';
import { consumeUsage, releaseUsage } from './_limits.js';
import { applyCors, handleOptions, sendError, ERR, isNonEmptyString } from './_security.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const user = await requireUser(req, res);
  if (!user) return; // 401 already sent, Anthropic never called
  const userId = user.id;

  const { query } = req.body || {};
  if (!isNonEmptyString(query, 500)) return sendError(res, 400, ERR.badRequest, null, 'search');

  // Reserve quota atomically BEFORE calling Anthropic.
  let usageResult;
  try {
    usageResult = await consumeUsage(userId, 'search');
  } catch(e) {
    return sendError(res, 500, ERR.internal, e, 'search:consumeUsage');
  }
  if (!usageResult.allowed) {
    return res.status(429).json({
      error: 'limit_reached',
      plan: usageResult.plan, used: usageResult.used, limit: usageResult.limit,
      message: usageResult.plan === 'free'
        ? `Alcanzaste tu límite de ${usageResult.limit} búsquedas este mes. Actualiza a Premium para continuar.`
        : `Alcanzaste tu límite de ${usageResult.limit} búsquedas este mes.`,
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: `Eres un asistente bíblico para KODESH, plataforma Hebreo-Mesiánica. Encuentra los 3 versículos más relevantes. Usa YHWH, Yeshúa, Mashíaj.

IDs de libros EXACTOS que debes usar:
AT: GEN,EXO,LEV,NUM,DEU,JOS,JDG,RUT,1SA,2SA,1KI,2KI,1CH,2CH,EZR,NEH,EST,JOB,PSA,PRO,ECC,SNG,ISA,JER,LAM,EZK,DAN,HOS,JOL,AMO,OBA,JON,MIC,NAM,HAB,ZEP,HAG,ZEC,MAL
NT: MAT,MRK,LUK,JHN,ACT,ROM,1CO,2CO,GAL,EPH,PHP,COL,1TH,2TH,1TI,2TI,TIT,PHM,HEB,JAS,1PE,2PE,1JN,2JN,3JN,JUD,REV

Responde SOLO en JSON: {"resultados":[{"referencia":"Juan 21:1","libro_id":"JHN","capitulo":21,"versiculo":1,"texto":"texto...","razon":"razón"}]}`,
        messages: [{ role: 'user', content: query }]
      })
    });

    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text.trim()); }
    catch(e) { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { resultados: [] }; }

    return res.status(200).json(parsed);
  } catch(err) {
    await releaseUsage(userId, 'search');
    return sendError(res, 500, ERR.internal, err, 'search');
  }
}
