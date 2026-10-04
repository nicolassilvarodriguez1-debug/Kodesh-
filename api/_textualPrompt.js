// KODESH — Prompt y lectura de respuesta de la Traducción Kodesh.
// Lo comparten api/textual.js (un capítulo al vuelo) y api/textual-pregen.js
// (todos los capítulos por lotes), para que ambos produzcan exactamente lo mismo.
import { applyManuscriptRules, validateChapter, maxTokensFor } from './_textualCheck.js';

export const TEXTUAL_MODEL = 'claude-haiku-4-5-20251001';

export const NT_BOOKS = new Set(['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']);

export const BOOK_NAMES = {
  GEN:'Génesis',EXO:'Éxodo',LEV:'Levítico',NUM:'Números',DEU:'Deuteronomio',
  JOS:'Josué',JDG:'Jueces',RUT:'Rut','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Reyes','2KI':'2 Reyes','1CH':'1 Crónicas','2CH':'2 Crónicas',
  EZR:'Esdras',NEH:'Nehemías',EST:'Ester',JOB:'Job',PSA:'Salmos',
  PRO:'Proverbios',ECC:'Eclesiastés',SNG:'Cantares',ISA:'Isaías',
  JER:'Jeremías',LAM:'Lamentaciones',EZK:'Ezequiel',DAN:'Daniel',
  HOS:'Oseas',JOL:'Joel',AMO:'Amós',OBA:'Abdías',JON:'Jonás',
  MIC:'Miqueas',NAM:'Nahúm',HAB:'Habacuc',ZEP:'Sofonías',HAG:'Hageo',
  ZEC:'Zacarías',MAL:'Malaquías',MAT:'Mateo',MRK:'Marcos',LUK:'Lucas',
  JHN:'Juan',ACT:'Hechos',ROM:'Romanos','1CO':'1 Corintios','2CO':'2 Corintios',
  GAL:'Gálatas',EPH:'Efesios',PHP:'Filipenses',COL:'Colosenses',
  '1TH':'1 Tesalonicenses','2TH':'2 Tesalonicenses','1TI':'1 Timoteo',
  '2TI':'2 Timoteo',TIT:'Tito',PHM:'Filemón',HEB:'Hebreos',JAS:'Santiago',
  '1PE':'1 Pedro','2PE':'2 Pedro','1JN':'1 Juan','2JN':'2 Juan',
  '3JN':'3 Juan',JUD:'Judas',REV:'Apocalipsis'
};

export function sortedVerseKeys(sourceVerses) {
  return Object.keys(sourceVerses).sort((a, b) => parseInt(a) - parseInt(b));
}

// Parámetros de la llamada a Anthropic para un capítulo. `problems` (del
// intento anterior) agrega la nota de reintento.
export function buildTextualParams(bookId, chapter, sourceVerses, problems = null) {
  const verseKeys = sortedVerseKeys(sourceVerses);
  const verseCount = verseKeys.length;
  const sourceText = verseKeys.map(k => `${k}. ${sourceVerses[k]}`).join('\n');
  const isNT = NT_BOOKS.has(bookId);
  const lang = isNT ? 'griego koiné' : 'hebreo bíblico';
  const bookName = BOOK_NAMES[bookId] || bookId;

  const systemPrompt = `Eres un traductor bíblico experto en ${lang} para KODESH, una plataforma de estudio bíblico Hebreo-Mesiánica.

IDIOMA: Escribe TODO en español. Nunca respondas un versículo en inglés ni mezcles palabras en inglés, aunque pienses en otro idioma.

MISIÓN: A partir del texto bíblico en español (RVR60) que te proporciono como referencia, producir una traducción NUEVA al español de EQUIVALENCIA FORMAL — lo más cercana posible al texto original en ${lang}.

PRINCIPIOS DE TRADUCCIÓN:
1. FIDELIDAD AL ORIGINAL: Consulta mentalmente el texto en ${lang} de ${bookName} ${chapter}. Donde la RVR60 se aleja del original (por paráfrasis, adiciones interpretativas, o suavizaciones idiomáticas), corrige hacia lo que dice el ${lang}.
2. ESPAÑOL NATURAL: La traducción debe sonar digna y clara en español — NUNCA arcaica, forzada ni "palabra por palabra sin sentido". Si la estructura literal del ${lang} no funciona en español, reorganiza la frase preservando el significado exacto.
3. PRECISIÓN LÉXICA: Elige la palabra española que mejor refleje el campo semántico de la palabra original. No uses sinónimos genéricos cuando hay una equivalencia precisa disponible.

NOMBRES Y CONVENCIONES KODESH (obligatorias):
- El Tetragrámaton יהוה (solo estas cuatro letras exactas, YHWH) → YHWH. NO confundas Elohim con YHWH. Cuando el hebreo original dice אֱלֹהִים (Elohim, "Dios") → traduce como "Elohim" o "Dios". Cuando el hebreo dice יהוה → YHWH. Cuando dice יהוה אֱלֹהִים (YHWH Elohim) → YHWH Elohim. NUNCA sustituyas Elohim por YHWH. Ejemplo: Génesis 1:1 dice "Bereshit bara Elohim" = "En el principio Elohim creó" (NO YHWH). YHWH aparece por primera vez en Génesis 2:4.
- En el NT griego, κύριος (kurios) cuando cita textos del AT donde había YHWH → YHWH. Cuando κύριος se refiere a un señor humano o título genérico → "señor" (minúscula).
- ישוע / Ἰησοῦς → Yeshúa (nunca "Jesús")
- משיח / Χριστός → Mashíaj (nunca "Cristo", excepto si usas "Mesías" como alternativa aceptable)
- רוח הקודש / Πνεῦμα Ἅγιον → Ruaj HaKódesh o Espíritu Santo (ambos aceptables)
- תורה → Torah (no "la Ley" cuando se refiere a los cinco libros de Moisés)
- Nombres propios hebreos: mantén la forma hebrea cuando sea reconocible (Moshé, Avraham, Yaakov, Yitzjak, Yosef, Miriam, Shaúl/Pablo). Si el nombre hebreo es poco conocido, usa la forma española seguida de la hebrea entre paréntesis solo la primera vez.

CRÍTICA TEXTUAL — VERSÍCULOS INTERPOLADOS:
Algunos versículos en la RVR60 NO aparecen en los manuscritos más antiguos y confiables (NA28/UBS5 para el NT). Son adiciones tardías de copistas. Para estos versículos, NO traduzcas el contenido de la RVR60. En su lugar, escribe EXACTAMENTE:
"[Este versículo no aparece en los manuscritos más antiguos y confiables.]"

Lista de versículos interpolados conocidos del NT (reemplazar con la nota anterior):
- Mateo 17:21, 18:11, 23:14
- Marcos 7:16, 9:44, 9:46, 11:26, 15:28
- Lucas 17:36, 23:17
- Juan 5:4
- Hechos 8:37, 15:34, 24:7, 28:29
- Romanos 16:24

Pasajes extensos disputados (traducir pero con nota al inicio del pasaje):
- Marcos 16:9-20: traducir normalmente pero agregar al inicio del verso 9: "[Los manuscritos más antiguos concluyen Marcos en 16:8. Los versículos 9-20 aparecen en manuscritos posteriores.] "
- Juan 7:53-8:11: traducir normalmente pero agregar al inicio de 7:53: "[Este pasaje no aparece en los manuscritos más antiguos. Su ubicación varía en los que lo incluyen.] "

Adiciones dentro de versículos (palabras o frases añadidas por copistas):
- Cuando una palabra o frase dentro de un versículo NO está en el texto original más antiguo pero sí aparece en la RVR60, OMÍTELA de tu traducción. Traduce solo lo que el manuscrito más antiguo contiene.
- Ejemplo: Mateo 6:13 — la doxología final ("porque tuyo es el reino, y el poder, y la gloria, por todos los siglos. Amén") NO está en los manuscritos más antiguos del NT. No la incluyas.
- Ejemplo: 1 Juan 5:7-8 — el Comma Johanneum ("en el cielo: el Padre, el Verbo y el Espíritu Santo; y estos tres son uno. Y tres son los que dan testimonio en la tierra") es una adición tardía. El versículo 7 SÍ existe: tradúcelo como "Porque tres son los que dan testimonio:" y el 8 como "el Espíritu, el agua y la sangre; y los tres concuerdan en uno." NO pongas la nota de "no aparece" en el 5:7.
- La nota de "[Este versículo no aparece…]" va SOLO en los versículos de la lista de arriba, nunca en otros.

REGLA CRÍTICA DE ESTRUCTURA:
- El texto RVR60 tiene EXACTAMENTE ${verseCount} versículos (del ${verseKeys[0]} al ${verseKeys[verseKeys.length - 1]}).
- Tu traducción DEBE tener EXACTAMENTE los mismos ${verseCount} versículos, con la MISMA numeración.
- NUNCA fusiones, dividas, omitas ni agregues versículos. Verso 1 traduce verso 1, verso 2 traduce verso 2, etc.

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin backticks, sin texto adicional):
{"1":"traducción del verso 1","2":"traducción del verso 2",...,"${verseKeys[verseKeys.length - 1]}":"traducción del último verso"}`;

  const retryNote = !problems ? '' : `\n\nATENCIÓN: el intento anterior tuvo errores (${problems.map(p => `${p.verse ? 'v' + p.verse + ' ' : ''}${p.type}`).join(', ')}). Devuelve los ${verseCount} versículos completos, TODO en español.`;
  return {
    model: TEXTUAL_MODEL,
    max_tokens: maxTokensFor(verseCount),
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Aquí está ${bookName} ${chapter} en RVR60 (${verseCount} versículos). Tradúcelo según las reglas:\n\n${sourceText}${retryNote}`,
    }],
  };
}

// Texto de la IA → { verses, problems }. verses ya trae las reglas de
// manuscritos aplicadas; si problems está vacío, el capítulo se puede guardar.
export function parseTextualReply(bookId, chapter, raw, verseKeys, stopReason) {
  let cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (e) { return { verses: null, problems: [{ type: stopReason === 'max_tokens' ? 'truncated' : 'bad_json' }] }; }
  const only = {};
  for (const k of verseKeys) if (parsed[k] != null) only[k] = String(parsed[k]);
  const verses = applyManuscriptRules(bookId, chapter, only);
  return { verses, problems: validateChapter(bookId, chapter, verses, verseKeys) };
}
