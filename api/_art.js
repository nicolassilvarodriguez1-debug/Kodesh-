// KODESH — Pinturas de las fiestas y del Shabat: estilo común y escenas.
// Se generan desde el admin con la API de imágenes de OpenAI (api/art-gen.js).
export const ART_STYLE = 'Classical oil painting on canvas, visible brushstrokes, Rembrandt-style chiaroscuro with warm golden light against deep midnight-blue shadows, palette of antique gold, ochre, umber and night blue. Historically accurate ancient Israel / first-century Judea: linen and wool robes, head coverings, stone houses, clay lamps. Reverent, quiet, cinematic. Wide horizontal composition (3:2), like a museum landscape painting: the main subject centered with breathing room on both sides, the bottom edge slightly darker and calm. No text, no letters, no Hebrew script, no halos, no crosses, no modern objects, no close-up faces looking at the viewer.';

export const ART_SCENES = {
  pesaj: 'Night in an ancient Israelite home in Egypt: through an arched stone window a full moon in a starry sky; on a rough wooden table below, a roasted leg of lamb on the bone (clearly lamb, never a bird or poultry), a stack of flat unleavened bread, bitter herbs, a clay cup of wine and a small oil lamp; a wooden staff and travel sandals beside the table; the doorposts of the open door faintly marked with blood from a hyssop branch.',
  matzot: 'Dawn exodus: women kneading flat unleavened dough in wooden troughs wrapped in cloaks on their shoulders, flat round bread baking on hot stones, a long line of families and animals leaving under a pale golden sky.',
  bikurim: 'Early spring sunrise over fields of young barley near Jerusalem: a priest in white linen lifting and waving a single sheaf of green-gold barley before the altar, soft smoke rising, farmers watching with baskets; an empty rock-cut tomb with its round stone rolled away glowing faintly in the distance.',
  shavuot: 'Golden wheat harvest at sunset in the hills of Judea: reapers with sickles, sheaves standing in rows, a young woman gleaning at the edge of the field, and in the distance Jerusalem on the hill; above, soft tongues of flame-like light in the evening sky.',
  terua: 'Twilight on the first day of the seventh month: a man on a stone rooftop in Jerusalem blowing a long curved ram\'s horn shofar toward the sky, a thin new crescent moon just visible above the western hills, people looking up from the streets below.',
  kipur: 'Inside the Holy of Holies seen from behind the high priest: the high priest in plain white linen garments, a censer of incense rising as a cloud, the golden ark faintly glowing in the smoke, the heavy embroidered veil torn from top to bottom letting golden light pour in; deep silence.',
  sukot: 'Harvest evening in Jerusalem: a booth made of palm branches and leafy boughs on a stone rooftop, fruit hanging from its roof, a family inside sharing a meal by lamplight, children holding palm, myrtle and willow branches with a citron; in the background the Temple court lit by enormous golden lampstands under the night sky.',
  shabat: 'Friday at sunset in the hills of Galilee: the sun setting over a winding river valley, golden rays breaking through the clouds, a thin crescent moon rising in the darkening sky; in the foreground a simple wooden table with two lit oil lamps, a round loaf of bread under a linen cloth and a clay cup of wine.',
};
export const ART_IDS = Object.keys(ART_SCENES);
export const artPrompt = id => `${ART_STYLE}\n\nScene: ${ART_SCENES[id]}`;

// ── Imágenes del inicio: fotografía realista (no óleo) ──
export const PHOTO_STYLE = 'Photorealistic, cinematic photograph shot on a full-frame camera with a 35mm lens, natural golden-hour light, soft atmospheric haze, shallow depth of field, warm cream, sand, ochre and olive-green tones, gentle film grain, high dynamic range, ultra detailed, calm and reverent mood. Real textures (stone, linen, parchment, wood, leaves). No text, no letters, no logos, no watermarks, no modern objects, no faces visible (people, if any, only small and distant or seen from behind).';
export const HOME_SCENES = {
  hero_day: ['Jerusalem\'s ancient stone walls at golden sunset seen from the Mount of Olives, tall cypress trees along the wall, the sun low and glowing on the horizon, out-of-focus olive branches framing the upper right corner. The left half of the frame is open, bright, softly hazy sky fading to warm cream, empty for a title.', '1536x1024'],
  hero_night: ['Jerusalem\'s ancient stone walls seen from the Mount of Olives at blue hour, deep indigo sky with the first stars and a thin crescent moon, warm lamplight glowing on the stones, olive branches in the upper right corner. The left half is calm, dark, empty sky.', '1536x1024'],
  promesa: ['An ancient parchment scroll partly unrolled on soft, wrinkled cream linen, gentle window light from the right, very shallow depth of field. The left two thirds are plain, bright and out of focus.', '1536x1024'],
  continua: ['An old open Bible with worn pages on a dark walnut table, a small fresh olive branch beside it, warm candlelight from the right, deep shadows. The left two thirds are dark and empty.', '1536x1024'],
  ex_asistente: ['Soft, low-contrast macro photograph of an aged parchment with handwritten Hebrew letters and a quill, faded toward cream on the left, minimal and elegant.', '1024x1024'],
  ex_ciclo: ['Soft, low-contrast photograph of weathered limestone temple columns in warm light, faded toward cream on the left, minimal and elegant.', '1024x1024'],
  ex_mapas: ['Soft, low-contrast macro photograph of an antique brass compass resting on an old parchment map of the Mediterranean, faded toward cream on the left, minimal and elegant.', '1024x1024'],
  ex_buscar: ['Soft, low-contrast macro photograph of an old magnifying glass over the pages of an ancient book, faded toward cream on the left, minimal and elegant.', '1024x1024'],
  ex_estudio: ['Soft, low-contrast photograph of a wooden desk with an open notebook, a pen and an olive sprig, faded toward cream on the left, minimal and elegant.', '1024x1024'],
  ex_tutorial: ['Soft, low-contrast macro photograph of an old leather-bound guidebook and a small oil lamp, faded toward cream on the left, minimal and elegant.', '1024x1024'],
};
export const HOME_IDS = Object.keys(HOME_SCENES);
// Porciones: la escena sale del tema de cada porción (parashot-data.json)
export const parashaPrompt = p => `${PHOTO_STYLE}\n\nScene (landscape or symbolic objects from the biblical story, historically accurate ancient Israel / Ancient Near East, no faces): ${p.tema}. Portion «${p.nombre}» (${p.torah}). Wide 3:2 composition, the right side brighter and the left side calmer.`;
// Si el filtro de OpenAI rechaza la escena, se usa una versión simbólica sin personas
export const parashaSafePrompt = p => `${PHOTO_STYLE}\n\nScene: a quiet, symbolic landscape or still life of ancient Israel evoking the biblical portion «${p.nombre}» (${p.torah}) — natural scenery, ancient stone, oil lamps, scrolls, olive trees, wheat or sheep. Absolutely no people. Wide 3:2 composition, the right side brighter and the left side calmer.`;
export const homePrompt = id => `${PHOTO_STYLE}\n\nScene: ${HOME_SCENES[id][0]}`;
