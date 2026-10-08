// KODESH — Paralelos de los Evangelios: prompt y validación de «qué aporta
// cada uno». Probadas en tests/parallels.test.js.
// Los datos de la armonía (orden y referencias) están en data/paralelos.json;
// la IA solo compara los textos de cada hecho y dice qué detalle trae SOLO un
// Evangelio. Cada frase se valida contra el texto (RVR, el que trae la app).

export const PARALLELS_MODEL = 'claude-sonnet-4-5';
export const GOSPELS = { MAT: 'Mateo', MRK: 'Marcos', LUK: 'Lucas', JHN: 'Juan' };

export const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[«»“”"'.,;:¿?¡!()—–\-]/g, ' ').replace(/\s+/g, ' ').trim();

// Versículos [c, v, texto] de una referencia [c1, v1, c2, v2]
export function passage(bible, g, [c1, v1, c2, v2]) {
  const out = [];
  for (let c = c1; c <= c2; c++) {
    const ch = bible?.[g]?.[String(c)] || {};
    for (const k of Object.keys(ch).map(Number).sort((a, b) => a - b)) {
      if ((c === c1 && k < v1) || (c === c2 && k > v2)) continue;
      out.push([c, k, String(ch[String(k)]).replace(/\s+/g, ' ').trim()]);
    }
  }
  return out;
}
// Solo los hechos que cuentan dos o más Evangelios (primera referencia de cada uno)
export function comparable(ev) {
  const gs = Object.keys(ev.r || {}).filter(g => GOSPELS[g]);
  return !ev.dup && gs.length >= 2;
}

export function parallelsPrompt(items) {
  return `Eres un erudito de los Evangelios (perspectiva hebreo-mesiánica). Para cada hecho comparas cómo lo cuentan los Evangelios que te doy.

Para CADA hecho devuelve:
- "coinciden": una frase (máx. 160 caracteres) con lo que todos cuentan igual.
- "u": para cada Evangelio, de 0 a 4 detalles que trae SOLO ese Evangelio entre los que te doy. Cada detalle:
   "ref": "capítulo:versículo" donde está,
   "frase": las palabras EXACTAS del texto (de 2 a 10 palabras, copiadas tal cual) que muestran ese detalle,
   "nota": por qué importa, en una frase (máx. 150 caracteres). Si hay un eco claro del Tanaj, puedes mencionarlo con su cita (p. ej. «Compáralo con 2 Reyes 4:42–44»).
- Solo detalles reales y significativos (personas, lugares, tiempos, palabras de Yeshúa, cifras). No inventes. Si un Evangelio no aporta nada propio, deja su lista vacía.

Usa Yeshúa (nunca "Jesús"), Mashíaj (nunca "Cristo"), Elohim/YHWH.

${items.map(it => `### Hecho ${it.id}: ${it.t}\n${it.texts.map(([g, lines]) => `[${g}] ${GOSPELS[g]}\n${lines.map(([c, v, t]) => `${c}:${v} ${t}`).join('\n')}`).join('\n\n')}`).join('\n\n')}

Responde SOLO con JSON: {"d":[{"id":146,"coinciden":"","u":{"MAT":[{"ref":"14:21","frase":"","nota":""}],"MRK":[],"LUK":[],"JHN":[]}}]}`;
}

// Valida: el Evangelio está en el hecho, el versículo está dentro del pasaje
// y la frase está de verdad en ese versículo.
export function cleanParallels(raw, items) {
  const byId = new Map(items.map(it => [it.id, it]));
  const out = {};
  for (const d of (raw && Array.isArray(raw.d) ? raw.d : [])) {
    const it = byId.get(Number(d?.id));
    if (!it) continue;
    const s = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const u = {};
    for (const [g, lines] of it.texts) {
      const list = Array.isArray(d.u?.[g]) ? d.u[g] : [];
      const ok = [];
      for (const x of list) {
        const m = /^(\d+):(\d+)$/.exec(s(x?.ref, 12));
        const frase = s(x?.frase, 120), nota = s(x?.nota, 200);
        if (!m || !frase || !nota) continue;
        const line = lines.find(([c, v]) => c === +m[1] && v === +m[2]);
        const words = norm(frase).split(' ').length;
        if (!line || words < 2 || words > 12 || !norm(line[2]).includes(norm(frase))) continue;
        ok.push({ c: +m[1], v: +m[2], f: frase, n: nota });
        if (ok.length >= 4) break;
      }
      if (ok.length) u[g] = ok;
    }
    const coinciden = s(d.coinciden, 220);
    if (coinciden) out[it.id] = { c: coinciden, u };
  }
  return out;
}
