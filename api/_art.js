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
export const parashaPrompt = p => `${PHOTO_STYLE}\n\nScene (historically accurate ancient Israel / Ancient Near East, no faces): ${String(PARASHA_SCENES[p.num] || p.tema).replace(/\.$/, '')}. Wide 3:2 composition, the right side brighter and the left side calmer.`;
// Si el filtro de OpenAI rechaza la escena, se usa una versión simbólica sin personas
export const parashaSafePrompt = p => `${PHOTO_STYLE}\n\nScene: a quiet, symbolic landscape or still life of ancient Israel evoking the biblical portion «${p.nombre}» (${p.torah}) — natural scenery, ancient stone, oil lamps, scrolls, olive trees, wheat or sheep. Absolutely no people. Wide 3:2 composition, the right side brighter and the left side calmer.`;
export const homePrompt = id => `${PHOTO_STYLE}\n\nScene: ${HOME_SCENES[id][0]}`;

// Escena icónica de cada porción (1–54): lo que todos reconocen de ella
export const PARASHA_SCENES = [null,
  'The Garden of Eden at dawn: a lush garden with a clear river dividing into streams, a single majestic fruit tree glowing in golden light, mist over primordial waters.',
  'A massive weathered wooden ark resting on the rocky slopes of the mountains of Ararat after the flood, a vivid rainbow across the clearing sky, animals walking down the slope in pairs, a white dove with an olive leaf.',
  'A caravan of tents, camels and sheep crossing the desert toward the hills of Canaan under an immense starry night sky, a lone traveler seen from behind looking up at the countless stars.',
  'The summit of Mount Moriah at sunrise: a simple stone altar with wood laid on it, a knife resting on a rock, and a ram caught by its horns in a thicket nearby.',
  'An ancient stone well outside a town in Mesopotamia at evening, camels kneeling to drink, a clay water jar resting on the well\'s rim.',
  'Inside a goat-hair tent at dusk: a clay pot of red lentil stew over embers, bread beside it, a hunter\'s bow and quiver leaning at the entrance.',
  'A rocky hillside at night where a traveler sleeps with his head on a stone, seen from afar, and a radiant stairway of light rises from the ground to the stars.',
  'The ford of the Jabbok river at first light, mist on the water, a lone man seen from behind crossing alone toward the dawn.',
  'A richly colored long-sleeved tunic lying torn beside an empty dry cistern in the pastures of Dothan, flocks grazing in the distance.',
  'Great Egyptian granaries overflowing with grain beside the Nile at sunrise, seven sleek cows grazing among the reeds.',
  'Egyptian wagons loaded with grain and goods arriving in the green land of Goshen, palm trees and flocks, warm afternoon light.',
  'A dim chamber in Egypt: an old patriarch\'s bed with a wooden staff leaning on it, twelve small clay oil lamps burning in a row.',
  'A thornbush on the slopes of Mount Horeb burning with bright fire yet not consumed, a pair of worn sandals left on the ground before it.',
  'The Nile turned blood-red under a dark stormy sky, frogs on the muddy banks, Egyptian temples and obelisks in the background.',
  'Night in Egypt: a doorway whose doorposts and lintel are marked with blood from a hyssop branch, inside a table with roasted leg of lamb, unleavened bread and bitter herbs, travel staffs ready, a full moon outside.',
  'The Red Sea parted into towering walls of water on both sides of a dry seabed path at night, a pillar of fire glowing over the shore.',
  'Mount Sinai wrapped in thick dark cloud with lightning and fire on its summit, the tents of a great camp at its foot in the desert.',
  'At the foot of Mount Sinai: a stone altar and twelve standing stone pillars, a book scroll on a rock, morning light.',
  'The ark of the covenant of gold with two golden cherubim facing each other, wings outstretched, standing inside a tent of fine blue, purple and scarlet linen.',
  'The high priest\'s breastplate with twelve precious gemstones in four rows resting on fine linen, beside the golden seven-branched lampstand burning with pure olive oil.',
  'Two stone tablets resting on a rock high on Mount Sinai, rays of light breaking through clouds, the desert far below.',
  'An ancient craftsmen\'s workshop: gold sheets, acacia wood, spools of blue, purple and scarlet yarn, fine linen and tools on wooden tables.',
  'The completed Tabernacle standing in the desert at dusk, its linen courtyard walls glowing, a luminous cloud resting over it.',
  'The bronze altar of burnt offering in the Tabernacle courtyard with smoke rising straight into a clear morning sky.',
  'The fire on the bronze altar burning through the night, folded white linen priestly garments resting nearby, stars above the courtyard.',
  'Fire descending from heaven onto the altar in the Tabernacle courtyard, the golden lampstand glowing through the open entrance.',
  'Two turtledoves in a woven basket beside the entrance of the Tabernacle courtyard, soft morning light.',
  'Two small birds, a piece of cedar wood, scarlet yarn and a sprig of hyssop beside an earthen vessel of fresh spring water.',
  'Two goats standing at the entrance of the Tabernacle; in the distance one goat being led alone into the barren wilderness at sunset.',
  'A golden wheat field at harvest with its corners left uncut, small gleaning baskets at the edge, olive trees beyond.',
  'A harvest table in ancient Israel: a sheaf of barley, two loaves of bread, palm branches, willow and myrtle, a citron.',
  'A ram\'s horn shofar resting on a hilltop overlooking terraced fields lying fallow in the Sabbath year, wild flowers growing.',
  'An abundant vineyard and olive grove in the hills of Israel, heavy rain clouds bringing rain in season, ripe grapes and olives.',
  'The camp of Israel in the desert arranged around the Tabernacle, rows of tents with colorful tribal banners on poles, seen from above at dawn.',
  'The tents of Israel at sunset seen from behind a priest whose hands are raised in blessing over the camp, golden light.',
  'Two silver trumpets resting on linen beside the golden lampstand, through the tent opening a cloud lifting over the camp.',
  'Two men seen from behind carrying an enormous cluster of grapes on a pole through the green hills of Canaan.',
  'A wooden staff that has budded overnight with almond blossoms and ripe almonds, resting before the ark in the tent.',
  'Water gushing from a split rock in the desert, a dry wilderness turning green around the stream.',
  'A donkey stopped on a narrow path between stone vineyard walls, a dazzling light blocking the way ahead.',
  'The tents of Israel on the plains of Moab at sunset, the Jordan river and the hills of the promised land in the distance.',
  'Sheepfolds and flocks in the green pastures of Gilead east of the Jordan river, stone walls and shepherds\' huts.',
  'A long trail of ancient campsites winding through the wilderness, from the desert mountains toward the Jordan valley, seen from a high ridge.',
  'An ancient scroll open on a rock overlooking the Jordan valley from the plains of Moab, morning haze.',
  'A small mezuzah on the stone doorpost of an ancient Israelite house at dawn, light falling on the doorway.',
  'A still life of the seven species of the land: wheat, barley, grapes, figs, pomegranates, olives and dates with a jar of honey.',
  'Two mountains facing each other across a valley: one green and blessed, the other barren and rocky, under dramatic light.',
  'The gate of an ancient Israelite city at morning with stone benches where the elders and judges sit.',
  'A bird\'s nest on a branch with a mother bird sheltering her eggs, a flat stone rooftop with a parapet behind.',
  'A woven basket of firstfruits — wheat, grapes, figs, pomegranates and olives — set before a stone altar.',
  'Two paths at dawn diverging in the hills: one leads into a lush green valley full of life, the other into dry wasteland.',
  'A Torah scroll placed beside the ark of the covenant inside the tent, a lamp burning softly.',
  'An eagle hovering over its nest on a high cliff above the desert, spreading its wings over its young.',
  'The view from Mount Nebo at sunset over the promised land: the Jordan river, the palms of Jericho and distant hills.',
];
