// KODESH — Audio «como película»: biblioteca de ambientes, efectos y música,
// banda sonora por capítulo (la decide la IA) y mezcla con ffmpeg.
// Funciones puras, probadas en tests/audio.test.js.
//
// La biblioteca se genera UNA vez con ElevenLabs y se reutiliza en todos los
// capítulos: así cuesta poco y todo suena coherente.

// ── Biblioteca ──
// kind: 'amb' (ambiente que se repite), 'sfx' (efecto puntual), 'music' (fondo musical)
export const LIBRARY = [
  // Ambientes (30 s en bucle)
  { key: 'viento_desierto', kind: 'amb', label: 'Viento del desierto', prompt: 'Gentle desert wind blowing over sand and rocks in the ancient Middle East, natural, no music, no voices' },
  { key: 'noche_aldea', kind: 'amb', label: 'Noche en la aldea', prompt: 'Quiet night in an ancient Judean village, crickets, a distant dog, soft breeze, no music' },
  { key: 'mar_calmo', kind: 'amb', label: 'Orilla del mar de Galilea', prompt: 'Calm lake shore, small waves lapping, a wooden fishing boat gently creaking, seagulls far away, no music' },
  { key: 'mar_tormenta', kind: 'amb', label: 'Tormenta en el mar', prompt: 'Violent storm on a lake at night, howling wind, crashing waves, heavy rain, wooden boat straining, no music' },
  { key: 'multitud', kind: 'amb', label: 'Multitud al aire libre', prompt: 'Large ancient crowd murmuring outdoors on a hillside, many indistinct voices, no clear words, no music' },
  { key: 'mercado', kind: 'amb', label: 'Mercado antiguo', prompt: 'Busy ancient Middle Eastern market, distant indistinct voices, donkeys, sheep, footsteps on stone, no music' },
  { key: 'templo', kind: 'amb', label: 'Atrio del templo', prompt: 'Large stone temple courtyard in ancient Jerusalem, echoing footsteps, distant murmurs, doves cooing, no music' },
  { key: 'campo', kind: 'amb', label: 'Campo con ovejas', prompt: 'Open countryside, sheep bleating softly, gentle wind through grass, birds singing, no music' },
  { key: 'pozo', kind: 'amb', label: 'Pozo al mediodía', prompt: 'Village well at noon in the desert, light wind, insects buzzing, occasional water drip, no music' },
  { key: 'fogata', kind: 'amb', label: 'Fogata de noche', prompt: 'Small campfire crackling at night in a courtyard, quiet outdoors, no music' },
  { key: 'jardin_noche', kind: 'amb', label: 'Huerto de olivos de noche', prompt: 'Olive garden at night, wind through leaves, crickets, very quiet, no music' },
  { key: 'casa', kind: 'amb', label: 'Interior de una casa', prompt: 'Quiet interior of an ancient stone house, oil lamp flickering, subtle room tone, no music' },
  { key: 'boda', kind: 'amb', label: 'Fiesta de bodas', prompt: 'Ancient village wedding feast, people celebrating, clapping, indistinct joyful voices, distant flute and frame drum' },
  { key: 'rio', kind: 'amb', label: 'Río Jordán', prompt: 'Flowing river water, gentle current, reeds in the wind, birds, no music' },
  { key: 'tumba', kind: 'amb', label: 'Sepulcro', prompt: 'Silent rock-cut tomb, faint dripping water, hollow echo, very quiet, no music' },
  { key: 'lluvia', kind: 'amb', label: 'Lluvia', prompt: 'Steady rain falling on stone and leaves, no thunder, no music' },
  // Ambientes del Tanaj (cinematográficos)
  { key: 'abismo', kind: 'amb', label: 'Abismo y aguas primordiales', prompt: 'Primordial dark void before creation, deep cosmic low drone, vast dark waters moving slowly, mysterious and awe-inspiring, no music, no voices' },
  { key: 'eden', kind: 'amb', label: 'Jardín del Edén', prompt: 'Lush paradise garden, gentle stream, exotic birds singing, soft breeze through trees, peaceful and pristine, no music' },
  { key: 'diluvio', kind: 'amb', label: 'Diluvio', prompt: 'Torrential relentless rain, rising flood waters, rolling thunder, wind howling, catastrophic storm, no music' },
  { key: 'arca', kind: 'amb', label: 'Dentro del arca', prompt: 'Inside a huge wooden ark on stormy waters, creaking timbers, rain on the roof, animals stirring, muffled waves, no music' },
  { key: 'batalla', kind: 'amb', label: 'Batalla antigua', prompt: 'Ancient battlefield, armies clashing, swords and shields, war cries, horses, distant chaos, cinematic, no music' },
  { key: 'campamento', kind: 'amb', label: 'Campamento de noche', prompt: 'Nomadic tent camp at night in the desert, campfires crackling, camels and goats, distant quiet voices, wind, no music' },
  { key: 'egipto_palacio', kind: 'amb', label: 'Palacio de Egipto', prompt: 'Grand ancient Egyptian palace hall, vast stone echo, distant attendants, fountains, faint ceremonial atmosphere, no music' },
  { key: 'desierto_noche', kind: 'amb', label: 'Desierto de noche', prompt: 'Vast desert at night, cold wind, distant jackals, silence and stars, no music' },
  // Efectos puntuales
  { key: 'gallo', kind: 'sfx', seconds: 3, label: 'Canto del gallo', prompt: 'A rooster crowing at dawn, single crow' },
  { key: 'trueno', kind: 'sfx', seconds: 5, label: 'Trueno', prompt: 'Distant rolling thunder' },
  { key: 'puerta', kind: 'sfx', seconds: 3, label: 'Puerta de madera', prompt: 'Heavy ancient wooden door opening and closing' },
  { key: 'pasos', kind: 'sfx', seconds: 4, label: 'Pasos en camino de tierra', prompt: 'Footsteps of a few people walking on a dusty stone path' },
  { key: 'agua_vasija', kind: 'sfx', seconds: 4, label: 'Agua de una tinaja', prompt: 'Water being poured from a large clay jar' },
  { key: 'grito_multitud', kind: 'sfx', seconds: 4, label: 'Multitud que grita', prompt: 'Angry ancient crowd shouting, indistinct, no clear words' },
  { key: 'asombro', kind: 'sfx', seconds: 3, label: 'Asombro de la gente', prompt: 'A crowd gasping in amazement, then murmuring' },
  { key: 'monedas_mesas', kind: 'sfx', seconds: 4, label: 'Mesas y monedas volcadas', prompt: 'Wooden tables overturned and coins scattering on a stone floor' },
  { key: 'latigo', kind: 'sfx', seconds: 2, label: 'Látigo', prompt: 'A single whip crack' },
  { key: 'martillo', kind: 'sfx', seconds: 4, label: 'Martillo y clavos', prompt: 'Slow heavy hammer strikes on nails into wood' },
  { key: 'terremoto', kind: 'sfx', seconds: 6, label: 'Terremoto', prompt: 'Deep earthquake rumble, rocks shaking and cracking' },
  { key: 'piedra', kind: 'sfx', seconds: 5, label: 'Piedra que se rueda', prompt: 'A large heavy round stone rolling away from a cave entrance' },
  { key: 'shofar', kind: 'sfx', seconds: 4, label: 'Shofar', prompt: 'A single long shofar ram horn blast' },
  { key: 'ola', kind: 'sfx', seconds: 3, label: 'Ola contra la barca', prompt: 'A big wave crashing against a wooden boat' },
  { key: 'red_peces', kind: 'sfx', seconds: 4, label: 'Red llena de peces', prompt: 'A fishing net full of fish pulled from the water, splashing' },
  { key: 'pan', kind: 'sfx', seconds: 2, label: 'Partir el pan', prompt: 'Breaking a loaf of crusty bread by hand' },
  { key: 'espada', kind: 'sfx', seconds: 2, label: 'Espada', prompt: 'A sword drawn from its sheath' },
  { key: 'viento_recio', kind: 'sfx', seconds: 5, label: 'Viento recio', prompt: 'Sudden rushing mighty wind filling a room' },
  { key: 'llanto', kind: 'sfx', seconds: 5, label: 'Llanto', prompt: 'Several women weeping softly in mourning' },
  { key: 'cadenas', kind: 'sfx', seconds: 3, label: 'Cadenas', prompt: 'Heavy iron chains rattling' },
  // Efectos cinematográficos del Tanaj
  { key: 'luz', kind: 'sfx', seconds: 6, label: '«Sea la luz»', prompt: 'Cinematic burst of divine light, massive shimmering swell and bright whoosh rising from darkness, awe-inspiring' },
  { key: 'aguas_separan', kind: 'sfx', seconds: 6, label: 'Aguas que se separan', prompt: 'Enormous body of water rushing and parting apart, deep roaring waves, cinematic' },
  { key: 'tierra_surge', kind: 'sfx', seconds: 6, label: 'La tierra surge', prompt: 'Land rising from the sea, deep rumbling earth, water cascading off rocks, cinematic' },
  { key: 'vida_brota', kind: 'sfx', seconds: 5, label: 'La vida brota', prompt: 'Plants and trees bursting into life, rustling leaves growing rapidly, magical organic swell' },
  { key: 'animales', kind: 'sfx', seconds: 6, label: 'Animales que aparecen', prompt: 'Chorus of animals appearing: birds taking flight, distant lion roar, cattle, wings flapping, cinematic nature swell' },
  { key: 'aliento_vida', kind: 'sfx', seconds: 4, label: 'Aliento de vida', prompt: 'A deep gentle divine breath, soft wind blowing into a body, then a first human gasp of life' },
  { key: 'fruto', kind: 'sfx', seconds: 2, label: 'Morder el fruto', prompt: 'Biting into a crisp juicy fruit' },
  { key: 'silbido_serpiente', kind: 'sfx', seconds: 3, label: 'Siseo de serpiente', prompt: 'Sinister serpent hiss and slithering through leaves' },
  { key: 'golpe_muerte', kind: 'sfx', seconds: 3, label: 'Golpe mortal', prompt: 'A heavy blunt blow and a body falling to the ground in a field, dramatic' },
  { key: 'espada_fuego', kind: 'sfx', seconds: 4, label: 'Espada de fuego', prompt: 'Flaming sword ignites and swirls, roaring fire whoosh, cinematic' },
  { key: 'puerta_arca', kind: 'sfx', seconds: 4, label: 'Se cierra el arca', prompt: 'Enormous wooden door slowly closing and sealing with a deep boom' },
  { key: 'trueno_divino', kind: 'sfx', seconds: 6, label: 'Trueno divino', prompt: 'Massive close thunder crack rolling across the sky, cinematic and powerful' },
  { key: 'choque_espadas', kind: 'sfx', seconds: 4, label: 'Choque de espadas', prompt: 'Swords clashing in combat, several strikes, metal ringing' },
  { key: 'flechas', kind: 'sfx', seconds: 3, label: 'Lluvia de flechas', prompt: 'Volley of arrows whistling through the air and striking wood and shields' },
  { key: 'galope', kind: 'sfx', seconds: 5, label: 'Caballos al galope', prompt: 'Many horses and chariots galloping past on hard ground' },
  { key: 'cuerno_guerra', kind: 'sfx', seconds: 4, label: 'Cuerno de guerra', prompt: 'Ancient war horn blast calling an army to battle, echoing over hills' },
  { key: 'fuego_altar', kind: 'sfx', seconds: 4, label: 'Fuego del altar', prompt: 'Fire flaring up on a stone altar, crackling, sacrifice smoke' },
  { key: 'risa', kind: 'sfx', seconds: 3, label: 'Risa de incredulidad', prompt: 'An elderly woman quietly laughing to herself in disbelief' },
  { key: 'pozo_cae', kind: 'sfx', seconds: 3, label: 'Caer a un pozo', prompt: 'A person thrown down into a dry stone pit, thud and dust, echo' },
  { key: 'plaga', kind: 'sfx', seconds: 5, label: 'Plaga (enjambre)', prompt: 'Huge swarm of insects buzzing and descending, ominous' },
  // Música de fondo (instrumental, ~2 min)
  { key: 'm_reverente', kind: 'music', label: 'Música: reverente', prompt: 'Reverent, contemplative instrumental with soft oud, ney flute and warm low strings, ancient Middle Eastern modes, slow, gentle, no drums, no vocals, suitable as background under narration' },
  { key: 'm_esperanza', kind: 'music', label: 'Música: esperanza', prompt: 'Hopeful, gentle instrumental with harp, soft strings and a lyre, ancient Israel atmosphere, warm and uplifting, no vocals, background under narration' },
  { key: 'm_tension', kind: 'music', label: 'Música: tensión', prompt: 'Tense, suspenseful instrumental with low strings, soft frame drum pulse and dark drones, ancient Middle Eastern scale, no vocals, background under narration' },
  { key: 'm_tristeza', kind: 'music', label: 'Música: tristeza', prompt: 'Sorrowful lament, solo duduk with soft sustained strings, slow and tender, no vocals, background under narration' },
  { key: 'm_triunfo', kind: 'music', label: 'Música: triunfo', prompt: 'Triumphant majestic instrumental, orchestral swell with brass, frame drums and strings, ancient Middle Eastern color, no vocals, background under narration' },
  { key: 'm_asombro', kind: 'music', label: 'Música: asombro', prompt: 'Awe and wonder, shimmering strings and airy pads, slow ancient Middle Eastern melody on ney flute, no vocals, background under narration' },
  { key: 'm_paz', kind: 'music', label: 'Música: paz', prompt: 'Peaceful pastoral instrumental, shepherd flute and lyre, gentle and calm, no vocals, background under narration' },
  { key: 'm_creacion', kind: 'music', label: 'Música: la creación', prompt: 'Epic cinematic creation theme, starts from near silence with deep low strings and slowly builds into a vast majestic orchestral swell with soaring strings, horns and wordless airy pads, awe and wonder, no vocals, film score' },
  { key: 'm_eden', kind: 'music', label: 'Música: Edén', prompt: 'Innocent and beautiful paradise theme, harp, celesta, soft woodwinds and gentle strings, pure and luminous, no vocals, film score' },
  { key: 'm_caida', kind: 'music', label: 'Música: la caída / traición', prompt: 'Dark betrayal theme, unsettling low strings, dissonant pads, slow ominous pulse, sorrow and dread, no vocals, film score' },
  { key: 'm_juicio', kind: 'music', label: 'Música: juicio', prompt: 'Ominous divine judgment theme, deep brass, timpani rolls, low choir-like synth pads without words, heavy and solemn, no vocals, film score' },
  { key: 'm_batalla', kind: 'music', label: 'Música: batalla', prompt: 'Epic ancient battle music, thunderous war drums, driving low strings, heroic brass, Middle Eastern percussion, intense, no vocals, film score' },
  { key: 'm_alianza', kind: 'music', label: 'Música: alianza / promesa', prompt: 'Majestic and warm covenant theme, noble horns and strings, hopeful and solemn, ancient Middle Eastern color, no vocals, film score' },
  { key: 'm_viaje', kind: 'music', label: 'Música: travesía', prompt: 'Journey through the desert, steady frame drum, oud and ney flute melody, sense of movement and destiny, no vocals, film score' },
  // Más efectos (foley)
  { key: 'aves_vuelo', kind: 'sfx', seconds: 4, label: 'Aves que alzan el vuelo', prompt: 'A flock of birds suddenly taking flight, many wings flapping, chirping' },
  { key: 'rugido_leon', kind: 'sfx', seconds: 3, label: 'Rugido de león', prompt: 'A lion roaring in the distance across open land' },
  { key: 'ganado', kind: 'sfx', seconds: 4, label: 'Ganado y rebaños', prompt: 'Herd of cattle, sheep and goats moving, lowing and bleating, hooves on dirt' },
  { key: 'latido', kind: 'sfx', seconds: 5, label: 'Latido (tensión)', prompt: 'Slow deep heartbeat, tense and suspenseful, cinematic' },
  { key: 'bendicion', kind: 'sfx', seconds: 4, label: 'Destello de bendición', prompt: 'Soft heavenly shimmer, gentle bell-like sparkle and warm swell, sacred and luminous' },
  { key: 'oleaje', kind: 'sfx', seconds: 5, label: 'Oleaje del mar', prompt: 'Large ocean waves rolling and crashing on the shore' },
  { key: 'llanto_hombre', kind: 'sfx', seconds: 4, label: 'Lamento de un hombre', prompt: 'A man crying out in anguish, then sobbing, distant echo' },
  { key: 'cuchillo', kind: 'sfx', seconds: 2, label: 'Cuchillo', prompt: 'A knife raised and gripped, metallic scrape' },
  // ── Radionovela ──
  // Sintonía de entrada y cierre (identidad de la serie)
  { key: 'sintonia', kind: 'theme', seconds: 30, label: 'Sintonía de entrada', prompt: 'Opening theme of an epic biblical radio drama series: solemn majestic orchestral fanfare with noble horns, soaring strings and deep frame drums, ancient Middle Eastern color, memorable heroic melody, builds to a climax in the first 12 seconds then settles into a soft sustained chord, no vocals' },
  { key: 'cierre', kind: 'theme', seconds: 20, label: 'Cierre del capítulo', prompt: 'Closing theme of an epic biblical radio drama: the same noble melody played gently by strings and oud, warm and reflective, ends with a final resolved chord and long fade, no vocals' },
  // Tema de Elohim (leitmotiv): suena encima de la música cuando Dios habla
  { key: 'tema_divino', kind: 'motif', seconds: 60, label: 'Tema de Elohim (cuando Dios habla)', prompt: 'Solemn sacred leitmotif for the voice of God: very slow sustained ethereal pads, soft pipe organ drones, shimmering high strings and celesta, a simple holy melody of few notes, reverent awe and majesty, no percussion, no vocals, seamless and calm' },
  // Cortinas / puentes musicales entre escenas (cambio de lugar o de tiempo)
  { key: 'puente_solemne', kind: 'bridge', seconds: 10, label: 'Cortina: solemne', prompt: 'Short radio drama music bridge: solemn majestic orchestral phrase with horns and strings, rises and resolves cleanly, ancient Middle Eastern color, no vocals' },
  { key: 'puente_asombro', kind: 'bridge', seconds: 10, label: 'Cortina: asombro', prompt: 'Short radio drama music bridge: shimmering awe-inspiring swell with harp glissando, airy strings and ney flute, resolves softly, no vocals' },
  { key: 'puente_drama', kind: 'bridge', seconds: 10, label: 'Cortina: dramática', prompt: 'Short radio drama music bridge: dramatic tense orchestral phrase with low strings, timpani hit and dark brass, ends on a suspended chord, no vocals' },
  { key: 'puente_tristeza', kind: 'bridge', seconds: 10, label: 'Cortina: tristeza', prompt: 'Short radio drama music bridge: sorrowful duduk phrase over soft strings, slow and tender, resolves sadly, no vocals' },
  { key: 'puente_esperanza', kind: 'bridge', seconds: 10, label: 'Cortina: esperanza', prompt: 'Short radio drama music bridge: hopeful warm phrase with lyre, harp and gentle strings, rising and luminous, no vocals' },
  { key: 'puente_viaje', kind: 'bridge', seconds: 10, label: 'Cortina: travesía', prompt: 'Short radio drama music bridge: oud and frame drum phrase suggesting a journey and passing of time, ends cleanly, no vocals' },
  // Golpes musicales (subrayan un momento dramático)
  { key: 'golpe_drama', kind: 'sting', seconds: 3, label: 'Golpe: dramático', prompt: 'Dramatic orchestral stinger hit, low brass and timpani, short and powerful' },
  { key: 'golpe_revelacion', kind: 'sting', seconds: 4, label: 'Golpe: revelación', prompt: 'Revelation musical stinger, bright rising string swell with harp and soft choir-like pad, short' },
  { key: 'golpe_juicio', kind: 'sting', seconds: 4, label: 'Golpe: juicio', prompt: 'Ominous judgment stinger, deep boom, dark brass cluster and rumble, short' },
  { key: 'golpe_suspenso', kind: 'sting', seconds: 3, label: 'Golpe: suspenso', prompt: 'Suspense stinger, dissonant high string screech rising and cut off, short' },
  { key: 'golpe_tristeza', kind: 'sting', seconds: 4, label: 'Golpe: tristeza', prompt: 'Sad musical stinger, single low cello note with soft piano chord, short and somber' },
  { key: 'golpe_gloria', kind: 'sting', seconds: 4, label: 'Golpe: gloria', prompt: 'Glorious triumphant stinger, bright brass fanfare chord with cymbal swell, short' },
];
export const LIB = Object.fromEntries(LIBRARY.map(x => [x.key, x]));
// Se generan con la API de música de ElevenLabs (lo demás con la de efectos)
export const MUSIC_KINDS = ['music', 'theme', 'bridge', 'motif'];
export const MUSIC_SECONDS = 120;

// ── Banda sonora del capítulo (la propone la IA, como director de radionovela) ──
export const SOUNDTRACK_VERSION = 3;
export function soundtrackPrompt(bookName, chapter, segments) {
  const byV = {};
  for (const s of segments) (byV[s.v] = byV[s.v] || []).push(`${s.character === 'narrador' ? '' : s.character + ': '}${s.text}`);
  const lines = Object.keys(byV).map(Number).sort((a, b) => a - b).map(v => `${v}| ${byV[v].join(' ')}`).join('\n');
  const list = kind => LIBRARY.filter(x => x.kind === kind).map(x => `${x.key} (${x.label})`).join(', ');
  return {
    system: `Eres el director de sonido de una RADIONOVELA bíblica de gran producción, al estilo de las radionovelas clásicas pero con calidad de cine. El oyente no ve nada: todo lo que imagina sale del sonido. Recibes un capítulo con sus versículos y eliges sonidos SOLO de esta biblioteca:
- Ambientes (fondo continuo de un lugar): ${list('amb')}
- Efectos sonoros: ${list('sfx')}
- Música de fondo (colchón musical): ${list('music')}
- Cortinas musicales (puente entre escenas): ${list('bridge')}
- Golpes musicales (subrayan un instante): ${list('sting')}
(La sintonía de entrada, el cierre y el tema de Elohim cuando Dios habla se ponen solos; no los elijas.)

EL LENGUAJE DE LA RADIONOVELA
1. ESCENAS: divide el capítulo en escenas. Hay escena nueva cuando cambia el lugar, el tiempo (otro día, «después de esto», años después) o el bloque de la historia. En Génesis 1 cada día de la creación es una escena. Marca en "scenes" el versículo donde EMPIEZA cada escena (no el primero del capítulo) y la cortina que la anuncia según el ánimo de lo que viene. Entre escenas habrá un silencio de voces de unos segundos lleno por esa cortina. De 2 a 10 escenas por capítulo si la historia lo permite.
2. MÚSICA DE FONDO SIEMPRE: la radionovela casi nunca queda en silencio musical. Cubre TODO el capítulo con tramos seguidos de música, cambiando de tema cuando cambia el ánimo o la escena (hasta 8 tramos): la creación (m_creacion), el Edén (m_eden), la caída o una traición (m_caida), el juicio o el diluvio (m_juicio), batallas (m_batalla), promesas de Elohim (m_alianza), viajes (m_viaje), tensión (m_tension), tristeza (m_tristeza), triunfo (m_triunfo), asombro (m_asombro), paz (m_paz), reverencia (m_reverente). En genealogías o leyes usa m_reverente o m_paz.
3. AMBIENTES: pinta cada lugar con su ambiente (hasta 8 tramos). Si el lugar se intuye, úsalo.
4. EFECTOS: generosos, como en la radio: cada acción que se pueda oír lleva su sonido (la luz que irrumpe, las aguas, la tierra, las aves, los animales, el aliento de vida, pasos, puertas, golpes, fuego, espadas, llanto, el trueno). Hasta 16 por capítulo. "when": "start" (al comenzar el versículo) o "end" (al terminar).
4b. EFECTOS QUE HACEN SOÑAR («hold»): en los momentos visuales grandes la narración se DETIENE y el efecto suena solo, fuerte, 2 a 4 segundos, para que el oyente imagine lo que pasa; luego sigue la voz. Úsalo cuando algo sucede ante los ojos: cada acto de la creación al cumplirse («y fue así», «y fue la luz», «creó Elohim…»), las aguas del diluvio, un trueno de juicio, una batalla, una puerta que se cierra para siempre. Ponle "hold" (segundos) y "after" con las ÚLTIMAS palabras EXACTAS del texto tras las cuales debe sonar (cópialas tal cual del versículo). Hasta 10 por capítulo. Ejemplo: {"v":9,"key":"aguas_separan","hold":3,"after":"y fue así"}.
5. GOLPES MUSICALES: en los instantes que cortan la respiración (una revelación, un juicio, una muerte, una traición, una victoria, una bendición solemne). Hasta 6 por capítulo.
6. SILENCIOS DRAMÁTICOS: el silencio también es lenguaje. En "pauses" indica antes de qué versículo hace falta un silencio de 1 a 2 segundos para que el momento respire (después de un golpe, antes de una frase decisiva). Hasta 6.
7. Nunca tapes las palabras de Yeshúa con efectos salvo que el texto lo pida.

Responde SOLO con JSON:
{"scenes":[{"v":6,"bridge":"puente_asombro"}],"pauses":[{"v":26,"s":1.5}],"ambience":[{"from":1,"to":5,"key":"abismo"}],"music":[{"from":1,"to":31,"key":"m_creacion"}],"sfx":[{"v":3,"key":"luz","hold":3,"after":"y fue la luz"},{"v":11,"key":"vida_brota","when":"end"}],"stings":[{"v":27,"key":"golpe_revelacion","when":"start"}]}`,
    user: `${bookName} capítulo ${chapter}.\n${lines}`,
  };
}

// Limpia la propuesta: solo claves de la biblioteca, rangos válidos, sin solapes, con topes.
export function cleanSoundtrack(raw, verseNumbers) {
  const vs = [...verseNumbers].map(Number).sort((a, b) => a - b);
  const min = vs[0] || 1, max = vs[vs.length - 1] || 1;
  const okKey = (key, kind) => LIB[key] && LIB[key].kind === kind;
  const ranges = (arr, kind, limit) => {
    const out = [];
    for (const r of Array.isArray(arr) ? arr : []) {
      const key = String(r?.key || ''); if (!okKey(key, kind)) continue;
      let from = Math.max(min, Math.round(Number(r.from))), to = Math.min(max, Math.round(Number(r.to)));
      if (!(from <= to)) continue;
      if (out.some(o => from <= o.to && to >= o.from)) continue;   // sin solapes
      out.push({ from, to, key });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => a.from - b.from);
  };
  const points = (arr, kind, limit) => {
    const out = [];
    for (const e of Array.isArray(arr) ? arr : []) {
      const key = String(e?.key || ''); const v = Math.round(Number(e?.v));
      if (!okKey(key, kind) || !(v >= min && v <= max)) continue;
      const item = { v, key, when: e.when === 'end' ? 'end' : 'start' };
      // «hold»: la narración se detiene y el efecto suena solo unos segundos
      if (kind === 'sfx' && Number(e?.hold) > 0 && out.filter(x => x.hold).length < 10) {
        item.hold = Math.round(Math.min(4, Math.max(1.5, Number(e.hold))) * 10) / 10;
        const after = String(e?.after || '').trim().slice(0, 140);
        if (after) item.after = after;
      }
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  };
  const ambience = ranges(raw?.ambience, 'amb', 8);
  const music = ranges(raw?.music, 'music', 8);
  const sfx = points(raw?.sfx, 'sfx', 16);
  const out = { ambience, music, sfx };
  if (raw && (raw.scenes || raw.stings || raw.pauses || raw.v === SOUNDTRACK_VERSION)) {
    // Música de fondo siempre: los tramos se tocan entre sí y cubren todo el capítulo
    if (!music.length) music.push({ from: min, to: max, key: 'm_reverente' });
    music[0].from = min; music[music.length - 1].to = max;
    for (let k = 0; k + 1 < music.length; k++) music[k].to = music[k + 1].from - 1;
    const seen = new Set();
    out.scenes = [];
    for (const e of Array.isArray(raw?.scenes) ? raw.scenes : []) {
      const v = Math.round(Number(e?.v)); if (!(v > min && v <= max) || seen.has(v)) continue;
      const bridge = okKey(String(e?.bridge || ''), 'bridge') ? e.bridge : 'puente_solemne';
      seen.add(v); out.scenes.push({ v, bridge });
      if (out.scenes.length >= 10) break;
    }
    out.scenes.sort((a, b) => a.v - b.v);
    out.pauses = [];
    for (const e of Array.isArray(raw?.pauses) ? raw.pauses : []) {
      const v = Math.round(Number(e?.v)); if (!(v > min && v <= max) || seen.has(v)) continue;
      seen.add(v); out.pauses.push({ v, s: Math.min(2.5, Math.max(0.8, Number(e?.s) || 1.5)) });
      if (out.pauses.length >= 6) break;
    }
    out.stings = points(raw?.stings, 'sting', 6);
    out.v = SOUNDTRACK_VERSION;
  }
  return out;
}

// Segundos de inicio/fin de cada versículo a partir de los tiempos del audio.
export function verseSpans(timings, total) {
  const t = [...(timings || [])].sort((a, b) => a[1] - b[1]);
  const spans = {};
  t.forEach(([v, s], i) => { spans[v] = { start: s, end: i + 1 < t.length ? t[i + 1][1] : total }; });
  return spans;
}

// Plan de mezcla: qué archivo suena, desde qué segundo, cuánto dura y a qué volumen.
export const LEVELS = { amb: 0.22, music: 0.2, sfx: 0.55, bridge: 0.5, sting: 0.5, theme: 0.5, motif: 0.32, hold: 0.85 };
export function mixPlan(soundtrack, timings, total, sfxSeconds = {}) {
  const spans = verseSpans(timings, total);
  const at = v => spans[v];
  const layers = [];
  for (const kind of ['ambience', 'music']) {
    for (const r of soundtrack?.[kind] || []) {
      const a = at(r.from), b = at(r.to);
      if (!a || !b) continue;
      const start = Math.max(0, a.start - (kind === 'music' ? 1.5 : 0.5));
      const end = Math.min(total, b.end + (kind === 'music' ? 2.5 : 1));
      if (end - start < 3) continue;
      layers.push({ key: r.key, kind: kind === 'music' ? 'music' : 'amb', start: round(start), dur: round(end - start), fade: kind === 'music' ? 4 : 2, loop: true, gain: kind === 'music' ? LEVELS.music : LEVELS.amb });
    }
  }
  for (const e of soundtrack?.sfx || []) {
    const s = at(e.v); if (!s) continue;
    const len = sfxSeconds[e.key] || LIB[e.key]?.seconds || 3;
    const start = e.when === 'end' ? Math.max(s.start, s.end - len * 0.6) : s.start + 0.2;
    layers.push({ key: e.key, kind: 'sfx', start: round(start), dur: round(len), fade: 0.3, loop: false, gain: LEVELS.sfx });
  }
  return layers;
}
const round = x => Math.round(x * 100) / 100;

// ── Radionovela: línea de tiempo ──
// La voz se corta antes de ciertos versículos para abrir silencios (cambio de
// escena o silencio dramático); al principio va la sintonía sola y al final
// el cierre. Devuelve las piezas de voz, los tiempos nuevos y los huecos.
export const RADIO = { lead: 7, tail: 9, scene: 3.5 };
export function radioTimeline(timings, total, st, opts = {}) {
  const R = { ...RADIO, ...opts };
  const t = [...(timings || [])].sort((a, b) => a[1] - b[1]);
  const inserts = {};
  for (const sc of st?.scenes || []) inserts[sc.v] = { dur: R.scene, kind: 'scene', bridge: sc.bridge };
  for (const p of st?.pauses || []) if (!inserts[p.v]) inserts[p.v] = { dur: p.s, kind: 'pause' };
  const cuts = [];
  for (const [v, start] of t) if (inserts[v] && start > 0.2) cuts.push({ v, at: Math.max(0, start - 0.05), ...inserts[v] });
  // Efectos con «hold»: la voz se abre en ese punto exacto (opts.holds trae el segundo)
  for (const h of opts.holds || []) if (h.at > 0.2 && h.at < total - 0.1) cuts.push({ v: h.v, at: h.at, dur: h.dur, kind: 'hold', key: h.key });
  // Un hold justo antes de un cambio de escena va primero; luego la cortina
  cuts.sort((a, b) => a.at - b.at || (a.kind === 'hold' ? -1 : 1));
  const pieces = []; const gaps = [];
  let from = 0, shift = R.lead;
  for (const c of cuts) {
    if (c.at < from - 1e-6) continue;
    if (c.at > from + 1e-6) pieces.push({ from: round(from), to: round(c.at), at: round(from + shift) });
    gaps.push({ v: c.v, at: round(c.at + shift), dur: c.dur, kind: c.kind, bridge: c.bridge, key: c.key, src: c.at });
    shift += c.dur; from = c.at;
  }
  pieces.push({ from: round(from), to: round(total), at: round(from + shift) });
  const map = x => { let sh = R.lead; for (const g of gaps) if (g.src <= x + 1e-6) sh += g.dur; return round(x + sh); };
  // El versículo «empieza» después de los silencios que caen justo en su arranque
  const vmap = x => map(x + 0.06) - 0.06;
  return { pieces, gaps, map, timings: t.map(([v, s]) => [v, round(vmap(s))]), total: round(total + shift + R.tail), voiceEnd: round(total + shift), lead: R.lead, tail: R.tail };
}

// Silencios del audio de voz (salida de ffmpeg silencedetect) → [[inicio, fin]]
export function parseSilences(stderr) {
  const out = []; let start = null;
  for (const line of String(stderr || '').split('\n')) {
    const a = line.match(/silence_start:\s*(-?[\d.]+)/); if (a) start = Math.max(0, Number(a[1]));
    const b = line.match(/silence_end:\s*([\d.]+)/); if (b && start != null) { out.push([start, Number(b[1])]); start = null; }
  }
  return out;
}

// Dónde abrir la voz para cada efecto con «hold»: tras las palabras indicadas
// (posición estimada dentro del versículo) y ajustado al silencio más cercano,
// para no cortar nunca una palabra.
const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function holdPoints(st, segments, timings, total, silences) {
  const spans = verseSpans(timings, total);
  const out = [];
  for (const e of st?.sfx || []) {
    if (!e.hold) continue;
    const sp = spans[e.v]; if (!sp) continue;
    let est = e.when === 'start' && !e.after ? sp.start : sp.end;
    if (e.after) {
      const parts = (segments || []).filter(x => x.v === e.v).map(x => x.text);
      const full = norm(parts.join(' ')), key = norm(e.after);
      const k = key ? full.lastIndexOf(key) : -1;
      if (k >= 0 && full.length) est = sp.start + ((k + key.length) / full.length) * (sp.end - sp.start);
    }
    // Silencio más cercano (dentro de ±2 s); se corta en su mitad
    let best = null;
    for (const [a, b] of silences || []) {
      const mid = (a + b) / 2, d = Math.abs(mid - est);
      if (d <= 2 && (!best || d < best.d)) best = { d, at: Math.min(b - 0.05, a + 0.2) };
    }
    const at = best ? best.at : (Math.abs(est - sp.end) < Math.abs(est - sp.start) ? sp.end - 0.05 : sp.start - 0.05);
    out.push({ v: e.v, key: e.key, dur: e.hold, at: round(Math.max(0.25, Math.min(total - 0.2, at))) });
  }
  // dos holds casi en el mismo sitio → uno solo
  return out.sort((a, b) => a.at - b.at).filter((h, i, arr) => !i || h.at - arr[i - 1].at > 0.5);
}

// Dónde habla Elohim (segundos del audio de voz). Si la grabación guardó los
// tramos exactos se usan; si no, se estiman por la proporción de letras
// dentro de cada versículo.
export function divineSpans(segments, timings, total, exact) {
  if (Array.isArray(exact) && exact.length) return exact.map(x => [x.s, x.e]);
  const spans = verseSpans(timings, total);
  const byV = {};
  for (const sg of segments || []) (byV[sg.v] = byV[sg.v] || []).push(sg);
  const out = [];
  for (const [v, list] of Object.entries(byV)) {
    const sp = spans[v]; if (!sp) continue;
    const len = list.reduce((a, x) => a + x.text.length + 1, 0);
    let acc = 0;
    for (const x of list) {
      const a = acc; acc += x.text.length + 1;
      if (!/^(elohim|adonai|dios|yhwh)/i.test(String(x.character || '').trim())) continue;
      out.push([sp.start + (a / len) * (sp.end - sp.start), sp.start + (acc / len) * (sp.end - sp.start)]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of out) { const last = merged[merged.length - 1]; if (last && s[0] - last[1] < 2) last[1] = Math.max(last[1], s[1]); else merged.push([...s]); }
  return merged;
}

// Plan completo de la radionovela sobre la línea de tiempo nueva.
export function radioPlan(st, tl, divine, sfxSeconds = {}) {
  const body = tl.voiceEnd;   // donde termina la última palabra
  const layers = mixPlan({ ...st, sfx: (st?.sfx || []).filter(e => !e.hold) }, tl.timings, body, sfxSeconds);
  // Efectos para imaginar: suenan en el silencio que abrió la voz
  for (const g of tl.gaps) {
    if (g.kind !== 'hold' || !g.key) continue;
    const len = Math.max(sfxSeconds[g.key] || LIB[g.key]?.seconds || 3, g.dur + 1.2);
    layers.push({ key: g.key, kind: 'sfx', start: round(Math.max(0, g.at - 0.25)), dur: round(len), fade: 0.4, loop: false, gain: LEVELS.hold });
  }
  const spans = verseSpans(tl.timings, body);
  // Sintonía: sola al principio y se esconde bajo la voz del narrador
  layers.push({ key: 'sintonia', kind: 'theme', start: 0, dur: round(tl.lead + 6), fade: 2.5, loop: false, gain: LEVELS.theme });
  // Cierre: entra al terminar la última frase
  layers.push({ key: 'cierre', kind: 'theme', start: round(Math.max(0, body - 1)), dur: round(tl.tail + 1), fade: 2, loop: false, gain: LEVELS.theme });
  // Cortinas entre escenas, en el silencio de las voces
  for (const g of tl.gaps) {
    if (g.kind !== 'scene') continue;
    layers.push({ key: g.bridge || 'puente_solemne', kind: 'bridge', start: round(Math.max(0, g.at - 0.4)), dur: round(g.dur + 2.6), fade: 0.5, loop: false, gain: LEVELS.bridge });
  }
  // Golpes musicales
  for (const e of st?.stings || []) {
    const s = spans[e.v]; if (!s) continue;
    const len = LIB[e.key]?.seconds || 3;
    const start = e.when === 'end' ? Math.max(s.start, s.end - 0.3) : Math.max(0, s.start - 0.4);
    layers.push({ key: e.key, kind: 'sting', start: round(start), dur: len, fade: 0.2, loop: false, gain: LEVELS.sting });
  }
  // Tema de Elohim: encima de todo, sin bajar con la voz
  for (const [a, b] of divine || []) {
    const s = tl.map(a), e = tl.map(b);
    layers.push({ key: 'tema_divino', kind: 'motif', start: round(Math.max(0, s - 1)), dur: round(e - s + 2.5), fade: 1.2, loop: true, gain: LEVELS.motif, bus: 'motif' });
  }
  return layers;
}

// Argumentos de ffmpeg para mezclar la voz con las capas.
// files: { key → ruta local }; la voz es la entrada 0.
export function ffmpegArgs(voicePath, layers, files, outPath, opts = {}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', voicePath];
  const used = layers.filter(l => files[l.key]);
  used.forEach(l => {
    if (l.loop) args.push('-stream_loop', '-1');
    args.push('-t', String(l.dur + 0.5), '-i', files[l.key]);
  });
  const fmt = 'aformat=sample_rates=44100:channel_layouts=stereo';
  const parts = [];
  // Voz: entera, o en piezas colocadas en su sitio con silencios entre medio
  const pieces = opts.pieces || null;
  if (pieces && pieces.length > 1) {
    parts.push(`[0:a]${fmt},asplit=${pieces.length}${pieces.map((_, k) => `[p${k}]`).join('')}`);
    pieces.forEach((pc, k) => {
      const ms = Math.round(pc.at * 1000);
      parts.push(`[p${k}]atrim=${pc.from}:${pc.to},asetpts=PTS-STARTPTS,adelay=${ms}|${ms}[q${k}]`);
    });
    parts.push(`${pieces.map((_, k) => `[q${k}]`).join('')}amix=inputs=${pieces.length}:normalize=0:duration=longest,apad=whole_dur=${opts.total}[vfull]`);
  } else if (pieces && pieces.length === 1) {
    const ms = Math.round(pieces[0].at * 1000);
    parts.push(`[0:a]${fmt},adelay=${ms}|${ms},apad=whole_dur=${opts.total}[vfull]`);
  } else {
    parts.push(`[0:a]${fmt}[vfull]`);
  }
  const bed = [], motif = [];
  used.forEach((l, i) => {
    const d = l.dur, f = Math.min(l.fade, d / 3);
    const ms = Math.round(l.start * 1000);
    parts.push(`[${i + 1}:a]${fmt},atrim=0:${d},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${f},afade=t=out:st=${round(d - f)}:d=${f},volume=${l.gain},adelay=${ms}|${ms}[l${i}]`);
    (l.bus === 'motif' ? motif : bed).push(`[l${i}]`);
  });
  if (!bed.length && !motif.length) {
    parts.push('[vfull]anull[mix]');
  } else {
    const finals = [];
    if (bed.length) {
      parts.push('[vfull]asplit=2[voice][key]');
      // Cuando habla Elohim la música de fondo baja un poco más para dejar sitio a su tema
      const dv = (opts.divine || []).map(([a, b]) => `between(t,${round(a)},${round(b)})`).join('+');
      parts.push(`${bed.join('')}amix=inputs=${bed.length}:normalize=0:duration=longest${dv ? `,volume=enable='${dv}':volume=0.5` : ''}[bed]`);
      // La música y los ambientes bajan solos cuando alguien habla
      parts.push('[bed][key]sidechaincompress=threshold=0.04:ratio=5:attack=30:release=500:makeup=1[ducked]');
      finals.push('[voice]', '[ducked]');
    } else finals.push('[vfull]');
    if (motif.length) {
      parts.push(`${motif.join('')}amix=inputs=${motif.length}:normalize=0:duration=longest[motif]`);
      finals.push('[motif]');
    }
    parts.push(`${finals.join('')}amix=inputs=${finals.length}:normalize=0:duration=first[mix]`);
  }
  parts.push('[mix]alimiter=limit=0.95[out]');
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', outPath);
  return args;
}
