// KODESH — Promesas del día, copiadas 1:1 del array PROMESAS en index.html
// (líneas ~5219-5250) para que el recordatorio push muestre exactamente la
// misma promesa que el usuario vería si abriera la app ese día.
//
// Si algún día se edita la lista en index.html, hay que reflejar el mismo
// cambio aquí — no hay una única fuente de verdad en DB todavía (son solo
// 30 entradas estáticas, no hay tabla ni UI de admin para editarlas).
export const PROMESAS = [
  { texto: "Todo lo puedo en Yeshúa que me fortalece.", ref: "Filipenses 4:13", libro: "PHP", cap: 4 },
  { texto: "YHWH es mi pastor; nada me faltará.", ref: "Salmos 23:1", libro: "PSA", cap: 23 },
  { texto: "Porque yo sé los planes que tengo para vosotros, dice YHWH, planes de bienestar y no de mal.", ref: "Jeremías 29:11", libro: "JER", cap: 29 },
  { texto: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios.", ref: "Isaías 41:10", libro: "ISA", cap: 41 },
  { texto: "Encomienda a YHWH tu camino, y confía en él; y él hará.", ref: "Salmos 37:5", libro: "PSA", cap: 37 },
  { texto: "Mas los que esperan en YHWH tendrán nuevas fuerzas.", ref: "Isaías 40:31", libro: "ISA", cap: 40 },
  { texto: "El amor nunca deja de ser; pero las profecías se acabarán.", ref: "1 Corintios 13:8", libro: "1CO", cap: 13 },
  { texto: "Pedid, y se os dará; buscad, y hallaréis; llamad, y se os abrirá.", ref: "Mateo 7:7", libro: "MAT", cap: 7 },
  { texto: "Fíate de YHWH con todo tu corazón, y no te apoyes en tu propia prudencia.", ref: "Proverbios 3:5", libro: "PRO", cap: 3 },
  { texto: "YHWH peleará por vosotros, y vosotros estaréis tranquilos.", ref: "Éxodo 14:14", libro: "EXO", cap: 14 },
  { texto: "Esta es la confianza que tenemos en él: que si pedimos algo conforme a su voluntad, él nos oye.", ref: "1 Juan 5:14", libro: "1JN", cap: 5 },
  { texto: "Porque de tal manera amó YHWH al mundo, que dio a su Hijo unigénito.", ref: "Juan 3:16", libro: "JHN", cap: 3 },
  { texto: "La paz os dejo, mi paz os doy; no como el mundo la da, yo os la doy.", ref: "Juan 14:27", libro: "JHN", cap: 14 },
  { texto: "No os ha sobrevenido ninguna tentación que no sea humana; pero fiel es YHWH, que no os dejará ser tentados más de lo que podéis resistir.", ref: "1 Corintios 10:13", libro: "1CO", cap: 10 },
  { texto: "Y sabemos que a los que aman a YHWH, todas las cosas les ayudan a bien.", ref: "Romanos 8:28", libro: "ROM", cap: 8 },
  { texto: "Esfuérzate y sé valiente; no temas ni desmayes, porque YHWH tu Dios estará contigo.", ref: "Josué 1:9", libro: "JOS", cap: 1 },
  { texto: "El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente.", ref: "Salmos 91:1", libro: "PSA", cap: 91 },
  { texto: "Mas la misericordia de YHWH es desde la eternidad y hasta la eternidad sobre los que le temen.", ref: "Salmos 103:17", libro: "PSA", cap: 103 },
  { texto: "Y mi Dios proveerá a todas vuestras necesidades conforme a sus riquezas en gloria en Yeshúa.", ref: "Filipenses 4:19", libro: "PHP", cap: 4 },
  { texto: "No nos cansemos, pues, de hacer bien; porque a su tiempo segaremos, si no desmayamos.", ref: "Gálatas 6:9", libro: "GAL", cap: 6 },
  { texto: "Lámpara es a mis pies tu palabra, y lumbrera a mi camino.", ref: "Salmos 119:105", libro: "PSA", cap: 119 },
  { texto: "Jehová es mi luz y mi salvación; ¿de quién temeré?", ref: "Salmos 27:1", libro: "PSA", cap: 27 },
  { texto: "Porque las montañas se moverán, y los collados temblarán, pero mi misericordia no se apartará de ti.", ref: "Isaías 54:10", libro: "ISA", cap: 54 },
  { texto: "El Espíritu mismo da testimonio a nuestro espíritu, de que somos hijos de YHWH.", ref: "Romanos 8:16", libro: "ROM", cap: 8 },
  { texto: "Bendito sea YHWH, que cada día nos colma de beneficios.", ref: "Salmos 68:19", libro: "PSA", cap: 68 },
  { texto: "Cuando pases por las aguas, yo estaré contigo; y si por los ríos, no te anegarán.", ref: "Isaías 43:2", libro: "ISA", cap: 43 },
  { texto: "Hijitos míos, os escribo estas cosas para que no pequéis; y si alguno hubiere pecado, abogado tenemos.", ref: "1 Juan 2:1", libro: "1JN", cap: 2 },
  { texto: "En todo tiempo ama el amigo, y es como un hermano en tiempo de angustia.", ref: "Proverbios 17:17", libro: "PRO", cap: 17 },
  { texto: "Gustad, y ved que es bueno YHWH; dichoso el hombre que confía en él.", ref: "Salmos 34:8", libro: "PSA", cap: 34 },
  { texto: "Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados.", ref: "1 Juan 1:9", libro: "1JN", cap: 1 },
];

// Misma fórmula que getDailyPromise(userId) en index.html — así el push que
// recibe un usuario coincide con la promesa que vería si abriera la app hoy.
export function getDailyPromiseForUser(userId) {
  let hash = 0;
  const id = String(userId || '');
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const userOffset = Math.abs(hash) % PROMESAS.length;

  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  const index = (dayOfYear + userOffset) % PROMESAS.length;
  return PROMESAS[index];
}
