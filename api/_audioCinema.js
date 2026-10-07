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
];
export const LIB = Object.fromEntries(LIBRARY.map(x => [x.key, x]));
export const MUSIC_SECONDS = 120;

// ── Banda sonora del capítulo (la propone la IA) ──
export function soundtrackPrompt(bookName, chapter, segments) {
  const byV = {};
  for (const s of segments) (byV[s.v] = byV[s.v] || []).push(`${s.character === 'narrador' ? '' : s.character + ': '}${s.text}`);
  const lines = Object.keys(byV).map(Number).sort((a, b) => a - b).map(v => `${v}| ${byV[v].join(' ')}`).join('\n');
  const list = kind => LIBRARY.filter(x => x.kind === kind).map(x => `${x.key} (${x.label})`).join(', ');
  return {
    system: `Diseñas la banda sonora de una Biblia en audio dramatizada, como una película, con reverencia y buen gusto. Recibes un capítulo con sus versículos y eliges sonidos SOLO de esta biblioteca:
- Ambientes (fondo continuo de un lugar): ${list('amb')}
- Efectos puntuales: ${list('sfx')}
- Música de fondo: ${list('music')}

REGLAS
1. Ambiente solo donde el lugar es claro en el texto. Puede haber huecos sin ambiente. Máximo 5 ambientes por capítulo; cada uno cubre un rango de versículos seguido.
2. Música: de 1 a 4 tramos por capítulo, según el ánimo de cada escena, como la banda sonora de una película: la creación (m_creacion), el Edén (m_eden), la caída o una traición (m_caida), el juicio o el diluvio (m_juicio), las batallas (m_batalla), las promesas de Elohim (m_alianza), los viajes (m_viaje). En discursos largos de enseñanza usa música suave (m_reverente o m_paz) o ninguna. En genealogías largas, música muy suave o ninguna.
3. Efectos: cuando el texto describe ese sonido o acción de forma concreta (el gallo canta, la piedra es removida, la tormenta, «sea la luz», las aguas que se separan, el golpe de Caín, la puerta del arca, las espadas). Máximo 8 por capítulo. Nunca efectos encima de las palabras de Yeshúa salvo que el texto lo pida.
4. "when": "start" (al comenzar el versículo) o "end" (al terminar).
5. Si nada encaja, deja las listas vacías. Menos es más.

Responde SOLO con JSON: {"ambience":[{"from":1,"to":5,"key":"mar_calmo"}],"music":[{"from":1,"to":12,"key":"m_reverente"}],"sfx":[{"v":34,"key":"gallo","when":"end"}]}`,
    user: `${bookName} capítulo ${chapter}.\n${lines}`,
  };
}

// Limpia la propuesta: solo claves de la biblioteca, rangos válidos, sin solapes, con topes.
export function cleanSoundtrack(raw, verseNumbers) {
  const vs = [...verseNumbers].map(Number).sort((a, b) => a - b);
  const min = vs[0] || 1, max = vs[vs.length - 1] || 1;
  const ranges = (arr, kind, limit) => {
    const out = [];
    for (const r of Array.isArray(arr) ? arr : []) {
      const key = String(r?.key || ''); if (!LIB[key] || LIB[key].kind !== kind) continue;
      let from = Math.max(min, Math.round(Number(r.from))), to = Math.min(max, Math.round(Number(r.to)));
      if (!(from <= to)) continue;
      if (out.some(o => from <= o.to && to >= o.from)) continue;   // sin solapes
      out.push({ from, to, key });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => a.from - b.from);
  };
  const sfx = [];
  for (const e of Array.isArray(raw?.sfx) ? raw.sfx : []) {
    const key = String(e?.key || ''); const v = Math.round(Number(e?.v));
    if (!LIB[key] || LIB[key].kind !== 'sfx' || !(v >= min && v <= max)) continue;
    sfx.push({ v, key, when: e.when === 'end' ? 'end' : 'start' });
    if (sfx.length >= 8) break;
  }
  return { ambience: ranges(raw?.ambience, 'amb', 5), music: ranges(raw?.music, 'music', 4), sfx };
}

// Segundos de inicio/fin de cada versículo a partir de los tiempos del audio.
export function verseSpans(timings, total) {
  const t = [...(timings || [])].sort((a, b) => a[1] - b[1]);
  const spans = {};
  t.forEach(([v, s], i) => { spans[v] = { start: s, end: i + 1 < t.length ? t[i + 1][1] : total }; });
  return spans;
}

// Plan de mezcla: qué archivo suena, desde qué segundo, cuánto dura y a qué volumen.
export const LEVELS = { amb: 0.22, music: 0.15, sfx: 0.5 };
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

// Argumentos de ffmpeg para mezclar la voz con las capas.
// files: { key → ruta local }; la voz es la entrada 0.
export function ffmpegArgs(voicePath, layers, files, outPath) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', voicePath];
  const used = layers.filter(l => files[l.key]);
  used.forEach(l => {
    if (l.loop) args.push('-stream_loop', '-1');
    args.push('-t', String(l.dur + 0.5), '-i', files[l.key]);
  });
  const fmt = 'aformat=sample_rates=44100:channel_layouts=stereo';
  const parts = [used.length ? `[0:a]${fmt},asplit=2[voice][key]` : `[0:a]${fmt}[voice]`];
  const labels = [];
  used.forEach((l, i) => {
    const d = l.dur, f = Math.min(l.fade, d / 3);
    const ms = Math.round(l.start * 1000);
    parts.push(`[${i + 1}:a]${fmt},atrim=0:${d},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${f},afade=t=out:st=${round(d - f)}:d=${f},volume=${l.gain},adelay=${ms}|${ms}[l${i}]`);
    labels.push(`[l${i}]`);
  });
  if (!labels.length) {
    parts.push('[voice]anull[mix]');
  } else {
    parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest[bed]`);
    // La música y los ambientes bajan solos cuando alguien habla
    parts.push('[bed][key]sidechaincompress=threshold=0.04:ratio=5:attack=30:release=500:makeup=1[ducked]');
    parts.push('[voice][ducked]amix=inputs=2:normalize=0:duration=first[mix]');
  }
  parts.push('[mix]alimiter=limit=0.95[out]');
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', outPath);
  return args;
}
