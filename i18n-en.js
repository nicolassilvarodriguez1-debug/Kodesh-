/* KODESH — Diccionario español → inglés de la interfaz (ver i18n.js).
   Claves: el texto exacto en español (los espacios se normalizan). Reglas: textos con números o nombres. */
(function () {
  'use strict';
  const I = window.KodeshI18n; if (!I || !I.isEn) return;
  I.add({
    // ── Inicio ──
    'Buenos días': 'Good morning', 'Buenas tardes': 'Good afternoon', 'Buenas noches': 'Good evening', 'Hoy': 'Today',
    'Bienvenido a Kodesh': 'Welcome to Kodesh', 'Bienvenida a Kodesh': 'Welcome to Kodesh',
    '❝ Promesa del día': '❝ Promise of the day', 'Promesa del día': 'Promise of the day', '✦ PROMESA DEL DÍA': '✦ PROMISE OF THE DAY',
    'Empieza a leer': 'Start reading', 'Comienza por Génesis 1 o por el evangelio de Juan.': 'Begin with Genesis 1 or with the Gospel of John.',
    'Continúa tu lectura': 'Continue reading', 'Continuar': 'Continue', 'Seguir leyendo': 'Keep reading',
    'Parashá de la semana': 'Parashah of the week', 'Ver más ›': 'See more ›', 'Ver más': 'See more', 'Lectura de hoy': "Today's reading",
    'Torá': 'Torah', 'Haftará': 'Haftarah', 'Brit Jadashá': 'Brit Hadashah',
    '¿Guardas el Shabat y las fiestas bíblicas? Puedes verlos aquí en tu inicio.': 'Do you keep Shabbat and the biblical feasts? You can see them here on your home screen.',
    'Mostrar': 'Show', 'Ahora no': 'Not now', 'Explora Kodesh': 'Explore Kodesh',
    'Asistente': 'Assistant', 'Pregunta sobre las Escrituras': 'Ask about the Scriptures', 'Ciclo de estudio': 'Study cycle',
    '54 porciones de la Torá': '54 Torah portions', 'Mapas': 'Maps', 'Viajes y lugares en el globo': 'Journeys and places on the globe',
    'Buscar': 'Search', 'Encuentra cualquier pasaje': 'Find any passage', 'Mi estudio': 'My study', 'Tus notas y estudios': 'Your notes and studies',
    'Tutorial': 'Tutorial', 'Aprende a usar Kodesh': 'Learn to use Kodesh', 'Hebreo': 'Hebrew', 'Griego': 'Greek',
    'Abrir el ciclo de estudio': 'Open the study cycle', 'Marcar la lectura de hoy': "Mark today's reading",
    'Cambiar tema': 'Change theme', 'Modo día': 'Day mode', 'Modo noche': 'Night mode', 'Ver racha, maná y protectores': 'See streak, manna and shields',
    // ── Menú y navegación ──
    'Biblia de estudio': 'Study Bible', 'Navegar': 'Navigate', 'Inicio': 'Home', 'Leer la Biblia': 'Read the Bible',
    'Armonía de los Evangelios': 'Harmony of the Gospels', 'Mapas bíblicos': 'Bible maps', 'Fiestas de YHWH': 'Feasts of YHWH', 'Shabat': 'Shabbat',
    'Luna y calendario': 'Moon and calendar', 'Línea de tiempo': 'Timeline', 'Lienzo de estudio': 'Study canvas', '✎ Lienzo de estudio': '✎ Study canvas',
    'Lexicón': 'Lexicon', 'Crónicas del Reino': 'Chronicles of the Kingdom', 'Actividades': 'Activities', 'Ajustes': 'Settings', 'Ayuda': 'Help',
    'Biblia': 'Bible', 'Estudiar': 'Study', '✦ Estudiar': '✦ Study', 'Perfil': 'Profile', 'Menú de KODESH': 'KODESH menu', 'Inicio de KODESH': 'KODESH home',
    'Cerrar menú': 'Close menu', 'Secciones': 'Sections', 'Accesos': 'Shortcuts', 'Menú': 'Menu', 'Guardados': 'Saved', 'Colores': 'Colors',
    'Testamento': 'Testament', 'Libros': 'Books', 'Escrituras': 'Scriptures', 'Antiguo Pacto': 'Old Covenant', 'Nuevo Pacto': 'New Covenant',
    '← Libros': '← Books', 'Capítulos': 'Chapters', 'Ciclo de Estudio': 'Study Cycle', '🔍 Buscar': '🔍 Search', 'Biblia leída': 'Bible read',
    'Entrar': 'Sign in', '✦ Premium': '✦ Premium', 'Elegir libro y capítulo': 'Choose book and chapter', 'Buscar libro y capítulo': 'Find book and chapter',
    'Historial de lectura': 'Reading history', 'Búsqueda inteligente': 'Smart search',
    // ── Lector ──
    'Marcar como leído': 'Mark as read', 'Capítulo leído': 'Chapter read', 'Notas': 'Notes', 'Interlineal': 'Interlinear', '✦ Kodesh': '✦ Kodesh',
    'Estudiar este capítulo': 'Study this chapter', 'Reducir texto': 'Smaller text', 'Aumentar texto': 'Larger text', 'Ver Ciclo →': 'See Cycle →',
    'Orígenes': 'Origins', 'Versículo ·': 'Verse ·', 'Guardar': 'Save', 'Quitar': 'Remove', '✦ Interpretar versículo': '✦ Interpret verse',
    'Copiar': 'Copy', 'Resaltar…': 'Highlight…', 'Colores de resaltado': 'Highlight colors', 'Cambia el nombre y el color de cada categoría': 'Change the name and color of each category',
    'Restaurar originales': 'Restore defaults', '＋ Seleccionar varios': '＋ Select several', 'Explicar': 'Explain', 'Estudio a fondo': 'Deep study',
    'Nota': 'Note', 'Compartir': 'Share', 'Resaltar versículo': 'Highlight verse', 'Personalizar colores': 'Customize colors', '✓ Guardar marcador': '✓ Save bookmark',
    'Versículos seleccionados': 'Selected verses', 'Cancelar selección': 'Cancel selection', 'Cerrar': 'Close', 'Añadir nota opcional...': 'Add an optional note...',
    'Añadir nota al marcador (opcional)...': 'Add a note to the bookmark (optional)...', 'Marcadores': 'Bookmarks', 'Todos': 'All', 'Estudio': 'Study',
    'Promesas': 'Promises', 'Profecía': 'Prophecy', 'Sacrificio': 'Sacrifice', 'Torah': 'Torah', 'Memorizar': 'Memorize',
    'Clic derecho en un versículo para marcarlo': 'Right-click a verse to bookmark it', '▸ Escuchar': '▸ Listen', '📖 Ir al versículo': '📖 Go to verse',
    'Amén — Cerrar': 'Amen — Close',
    // ── Notas ──
    'Notas de estudio': 'Study notes', 'Observación': 'Observation', 'Pregunta': 'Question', 'Aplicación': 'Application', 'Oración': 'Prayer', 'Listo': 'Done',
    'Cerrar notas': 'Close notes', 'Agregar sección': 'Add section',
    '¿Qué te habló este capítulo? Escribe observaciones, preguntas o una oración…': 'What did this chapter say to you? Write observations, questions or a prayer…',
    // ── Perfil y ajustes ──
    'Salir': 'Sign out', '📊 Estadísticas': '📊 Statistics', '🔖 Marcadores': '🔖 Bookmarks', '📝 Notas': '📝 Notes', 'Cambiar foto': 'Change photo',
    'Palabras de Yeshúa en rojo': 'Words of Yeshua in red', 'Resalta en rojo lo que dijo Yeshúa en los Evangelios, Hechos y Apocalipsis': 'Shows in red what Yeshua said in the Gospels, Acts and Revelation',
    'Leer como libro': 'Read like a book', 'Sin números de capítulo ni de versículo: el texto corre seguido y el siguiente capítulo aparece al terminar, como en un libro': 'No chapter or verse numbers: the text flows on and the next chapter appears when you finish, like a book',
    'Paralelos de los Evangelios': 'Gospel parallels', 'En Mateo, Marcos, Lucas y Juan: avisos con los otros Evangelios que cuentan lo mismo y marcas azules en lo que solo trae cada uno': 'In Matthew, Mark, Luke and John: notes about the other Gospels that tell the same story, and blue marks on what only one of them includes',
    'Lugares en el mapa': 'Places on the map', 'Subraya los nombres de lugar; al tocarlos, el lexicón muestra «Ver en el mapa». También los avisos de las rutas de viaje': 'Underlines place names; tap one and the lexicon shows “See on the map”. Also the journey route notes',
    'Personajes del capítulo': 'People in the chapter', 'Una fila arriba de cada capítulo con quién aparece; toca un nombre para ver dónde está y su ficha': 'A row above each chapter with who appears in it; tap a name to see where they are and their profile',
    'Línea de tiempo del capítulo': 'Chapter timeline', 'Una línea fina arriba de cada capítulo con su época; tócala para ver la historia completa': 'A thin line above each chapter with its era; tap it to see the whole story',
    'Fiestas y raíces hebreas': 'Feasts and Hebrew roots', 'Avisa en qué fiesta ocurre el capítulo y subraya en azul lo que se entiende desde el trasfondo hebreo': 'Tells you which feast the chapter happens in and underlines in blue what makes sense from the Hebrew background',
    'Mostrar el inicio al abrir': 'Show home when opening', 'Si lo apagas, la app abre directo donde te quedaste leyendo': 'If you turn it off, the app opens right where you left off reading',
    'Shabat y fiestas en el inicio': 'Shabbat and feasts on home', 'Agrega al inicio el Shabat con su hora y la próxima fiesta bíblica': 'Adds Shabbat with its time and the next biblical feast to your home screen',
    // ── Asistente ──
    'Asistente de Estudio': 'Study Assistant', 'Shalom — estoy aquí para estudiar contigo': 'Shalom — I am here to study with you',
    'Puedo ayudarte con el contexto histórico, el hebreo y griego original, las conexiones mesiánicas y la exégesis correcta del texto que estás leyendo.': 'I can help you with the historical context, the original Hebrew and Greek, the Messianic connections and the right exegesis of the text you are reading.',
    'Contexto histórico': 'Historical context', 'Conexión mesiánica': 'Messianic connection', 'Análisis del idioma original': 'Original language analysis', 'Aplicación práctica': 'Practical application',
    'Mis Estudios': 'My Studies', 'Conversaciones guardadas': 'Saved conversations', 'Cargando...': 'Loading...', 'Cargando…': 'Loading…',
    'Historial de estudios': 'Study history', 'Nueva conversación': 'New conversation', 'Pregunta sobre este capítulo...': 'Ask about this chapter...',
    // ── Búsqueda ──
    'Palabras': 'Words', '✦ Pregunta con IA': '✦ Ask with AI', 'Prueba:': 'Try:', 'esfuérzate y sé valiente': 'be strong and courageous',
    'Dios no me abandona': 'God does not abandon me', 'amor de Dios al mundo': "God's love for the world", 'Yeshúa sana leproso': 'Yeshua heals a leper',
    'Buscar →': 'Search →', 'Busca una palabra o frase en toda la Biblia': 'Search for a word or phrase in the whole Bible',
    'Instantáneo, sin límite y sin conexión. También puedes escribir una cita, como «Juan 3:16».': 'Instant, unlimited and offline. You can also type a reference, like “John 3:16”.',
    'Tipo de búsqueda': 'Search type', 'Palabra o frase exacta… ej: pacto, Abraham, «no temas»': 'Exact word or phrase… e.g. covenant, Abraham, “do not fear”',
    // ── Premium ──
    'Límite alcanzado': 'Limit reached', '✦ KODESH PREMIUM': '✦ KODESH PREMIUM', '/mes': '/month', '🔥 Precio de lanzamiento': '🔥 Launch price',
    '✓ 80 búsquedas IA / mes': '✓ 80 AI searches / month', '✓ 70 consultas al asistente / mes': '✓ 70 assistant questions / month',
    '✓ Lexicón hebreo/griego completo': '✓ Full Hebrew/Greek lexicon', '✓ Versiones adicionales de la Biblia': '✓ Additional Bible versions',
    '✓ Marcadores y notas ilimitados': '✓ Unlimited bookmarks and notes', '✓ Ciclo de Estudio completo': '✓ Full Study Cycle', '✓ Soporte prioritario': '✓ Priority support',
    'Actualizar a Premium →': 'Upgrade to Premium →', 'Continuar con plan gratuito': 'Continue with the free plan',
    'Nueva actualización disponible': 'New update available', 'Publicamos una versión nueva de KODESH Bible con mejoras importantes. Necesitas actualizar para seguir usando la app.': 'We released a new version of KODESH Bible with important improvements. You need to update to keep using the app.',
    'Actualizar ahora →': 'Update now →', '7 días gratis, hoy': '7 days free, today', 'KODESH Premium': 'KODESH Premium',
    'Todo lo que necesitas para estudiar las Escrituras desde sus raíces hebraicas. Prueba Premium sin costo por 7 días — cancela cuando quieras.': 'Everything you need to study the Scriptures from their Hebrew roots. Try Premium free for 7 days — cancel anytime.',
    '✦ Traducción Kodesh': '✦ Kodesh Translation', 'Traducción de equivalencia formal anclada al hebreo y griego original. Fiel al texto más antiguo, nombres restaurados (YHWH, Yeshúa, Mashíaj).': 'A formal-equivalence translation anchored in the original Hebrew and Greek. Faithful to the oldest text, with restored names (YHWH, Yeshua, Mashiach).',
    '📖 Interlineal Hebreo-Griego': '📖 Hebrew-Greek Interlinear', "Lee cada versículo palabra por palabra en el idioma original con su número Strong's, análisis morfológico y traducción al español.": "Read each verse word by word in the original language with its Strong's number, morphology and translation.",
    "🔤 Lexicón Strong's Completo": "🔤 Full Strong's Lexicon", 'Sin límites de consultas. Etimología, usos en toda la Escritura y conexiones entre el Antiguo y el Nuevo Pacto.': 'Unlimited lookups. Etymology, uses across all of Scripture and connections between the Old and New Covenants.',
    '🤖 Asistente IA de Estudio': '🤖 AI Study Assistant', '80 búsquedas y 70 consultas al mes. Pregunta sobre cualquier pasaje, obtén contexto histórico, conexiones y aplicación.': '80 searches and 70 questions a month. Ask about any passage and get historical context, connections and application.',
    '📅 54 Porciones Torah + más': '📅 54 Torah Portions + more', 'Ciclo de estudio completo con lecturas de Torah, Haftarah y Brit Hadashá. Acceso anticipado a nuevas funciones.': 'Full study cycle with Torah, Haftarah and Brit Hadashah readings. Early access to new features.',
    'Prueba gratis · 7 días': 'Free trial · 7 days', 'hoy': 'today', 'Después, $5.99/mes. Cancela cuando quieras antes de que termine tu prueba y no se te cobra nada.': 'Then $5.99/month. Cancel anytime before your trial ends and you will not be charged.',
    'Comenzar prueba gratis de 7 días →': 'Start 7-day free trial →',
    // ── Lexicón (cabeceras fijas) ──
    '⛪ Significado Bíblico': '⛪ Biblical Meaning', '📜 Origen de la Palabra': '📜 Word Origin', '¿Sabías que?': 'Did you know?', 'Aplícalo': 'Apply it',
    'Palabras Relacionadas': 'Related Words', 'Explorar en la Escritura': 'Explore in Scripture',
  });
  // ── Porciones de la Torá (parashot-data.json: significado y tema) ──
  I.add({
    'En el principio': 'In the beginning', 'La creación, la caída y el inicio del plan redentor de Dios': "Creation, the fall and the beginning of God's plan of redemption",
    'Noé / Descanso': 'Noah / Rest', 'El diluvio, el arco iris del pacto y la dispersión de las naciones en Babel': 'The flood, the rainbow of the covenant and the scattering of the nations at Babel',
    'Ve tú / Sal para ti': 'Go forth / Go for yourself', 'El llamado de Abraham, el pacto de la circuncisión y la promesa de la tierra': "Abraham's call, the covenant of circumcision and the promise of the land",
    'Y apareció / Se mostró': 'And he appeared', 'La visita de los ángeles, la destrucción de Sodoma y el sacrificio de Isaac': 'The visit of the angels, the destruction of Sodom and the binding of Isaac',
    'Vida de Sara': 'Life of Sarah', 'La muerte de Sara, la compra de la cueva de Macpela y el matrimonio de Isaac con Rebeca': "Sarah's death, the purchase of the cave of Machpelah and Isaac's marriage to Rebekah",
    'Generaciones / Historia': 'Generations', 'El nacimiento de Jacob y Esaú, la venta de la primogenitura y la bendición robada': 'The birth of Jacob and Esau, the sold birthright and the stolen blessing',
    'Y salió': 'And he went out', 'La escalera de Jacob, su matrimonio con Lea y Raquel, y el nacimiento de las 12 tribus': "Jacob's ladder, his marriage to Leah and Rachel, and the birth of the 12 tribes",
    'Y envió': 'And he sent', 'La lucha de Jacob con el ángel, su nombre cambiado a Israel y la reconciliación con Esaú': "Jacob wrestles with the angel, his name becomes Israel and he reconciles with Esau",
    'Y habitó / Se estableció': 'And he settled', 'José vendido por sus hermanos, la historia de Tamar y José en la casa de Potifar': "Joseph sold by his brothers, the story of Tamar and Joseph in Potiphar's house",
    'Al cabo / Al fin de': 'At the end of', 'Los sueños del Faraón, la exaltación de José y el primer encuentro con sus hermanos': "Pharaoh's dreams, Joseph's rise and the first meeting with his brothers",
    'Y se acercó': 'And he drew near', 'José se revela a sus hermanos, la reconciliación familiar y el traslado a Egipto': 'Joseph reveals himself to his brothers, the family is reconciled and moves to Egypt',
    'Y vivió': 'And he lived', 'Las bendiciones de Jacob sobre sus 12 hijos y la muerte de Jacob y José en Egipto': "Jacob's blessings over his 12 sons and the deaths of Jacob and Joseph in Egypt",
    'Nombres': 'Names', 'La opresión en Egipto, el nacimiento de Moisés, la zarza ardiente y el nombre YHWH': 'Oppression in Egypt, the birth of Moses, the burning bush and the name YHWH',
    'Y me aparecí / Me mostré': 'And I appeared', 'Las primeras siete plagas de Egipto y el endurecimiento del corazón de Faraón': "The first seven plagues of Egypt and the hardening of Pharaoh's heart",
    'Entra / Ven': 'Come / Go in', 'Las últimas tres plagas, la institución de Pésaj y el éxodo de Egipto': 'The last three plagues, the institution of Pesach and the exodus from Egypt',
    'Cuando dejó ir': 'When he let go', 'El cruce del Mar Rojo, el cántico de Moisés y el maná en el desierto': 'Crossing the Red Sea, the song of Moses and the manna in the wilderness',
    'Jetro / Excelencia': 'Jethro', 'La visita de Jetro, la organización de Israel y la entrega de los Diez Mandamientos': "Jethro's visit, the organization of Israel and the giving of the Ten Commandments",
    'Leyes / Juicios': 'Judgments / Laws', 'Las leyes civiles y ceremoniales de Israel y la ratificación del pacto en el Sinaí': "Israel's civil and ceremonial laws and the ratifying of the covenant at Sinai",
    'Ofrenda / Contribución': 'Offering / Contribution', 'Las instrucciones para construir el Tabernáculo, el Arca y el mobiliario sagrado': 'Instructions for building the Tabernacle, the Ark and the holy furnishings',
    'Ordenarás / Mandarás': 'You shall command', 'Las vestiduras del sacerdocio, la consagración de Aarón y el altar del incienso': "The priestly garments, Aaron's consecration and the altar of incense",
    'Cuando tomes / Cuando cuentes': 'When you take a census', 'El becerro de oro, la intercesión de Moisés, las nuevas tablas y el rostro de Moisés': "The golden calf, Moses' intercession, the new tablets and Moses' shining face",
    'Y reunió / Congregó': 'And he assembled', 'Bezalel y la construcción del Tabernáculo con las ofrendas voluntarias del pueblo': "Bezalel and the building of the Tabernacle with the people's freewill offerings",
    'Cuentas / Registros': 'Accounts / Records', 'El inventario del Tabernáculo y la gloria de Dios llenando el Mishkán': 'The inventory of the Tabernacle and the glory of God filling the Mishkan',
    'Y llamó': 'And he called', 'Las cinco ofrendas principales del sistema levítico: holocausto, cereal, paz, pecado y culpa': 'The five main offerings of the Levitical system: burnt, grain, peace, sin and guilt',
    'Ordena / Manda': 'Command', 'Instrucciones detalladas para los sacerdotes sobre las ofrendas y la consagración de Aarón': "Detailed instructions for the priests about the offerings and Aaron's consecration",
    'Octavo': 'Eighth', 'El octavo día de la consagración, la muerte de Nadab y Abiú, y las leyes de pureza alimentaria': 'The eighth day of the consecration, the death of Nadab and Abihu, and the dietary laws',
    'Cuando conciba / Dé a luz': 'When she conceives', "La pureza después del parto y las leyes de la tsara'at (lepra y afecciones de piel)": "Purity after childbirth and the laws of tzara'at (leprosy and skin afflictions)",
    'El afligido / Leproso': 'The afflicted one', 'La purificación del leproso, la purificación de las casas y las leyes de impureza corporal': 'The cleansing of the leper, the cleansing of houses and the laws of bodily impurity',
    'Después de la muerte': 'After the death', 'El Yom Kippur — el gran día de la expiación — y las leyes de moralidad sexual': 'Yom Kippur — the great Day of Atonement — and the laws of sexual morality',
    'Santos / Consagrados': 'Holy ones', "El código de santidad — 'Sean santos porque Yo soy santo' — incluyendo el amor al prójimo": "The holiness code — 'Be holy, for I am holy' — including love for your neighbor",
    'Di / Habla': 'Speak', 'Las leyes para los sacerdotes, los requisitos de las ofrendas y el calendario de las fiestas': 'Laws for the priests, the requirements for offerings and the calendar of the feasts',
    'En el monte': 'On the mountain', 'El año sabático, el año de Jubileo y las leyes de redención de propiedades y personas': 'The sabbatical year, the year of Jubilee and the laws of redeeming land and people',
    'En mis estatutos': 'In my statutes', 'Las bendiciones de la obediencia, las maldiciones de la desobediencia y los votos': 'The blessings of obedience, the curses of disobedience and vows',
    'En el desierto': 'In the wilderness', 'El censo de las 12 tribus, la organización del campamento alrededor del Tabernáculo': 'The census of the 12 tribes and the camp arranged around the Tabernacle',
    'Toma el censo / Levanta': 'Take a census / Lift up', 'La bendición sacerdotal, el ritual de la sospecha, el voto nazareo y las ofrendas de los príncipes': "The priestly blessing, the ritual of suspicion, the Nazirite vow and the leaders' offerings",
    'Cuando hagas subir': 'When you set up', 'El encendido de la menorá, la segunda Pascua, la nube guiadora y la murmuración del pueblo': "Lighting the menorah, the second Passover, the guiding cloud and the people's complaining",
    'Envía para ti': 'Send for yourself', 'Los 12 espías, el informe negativo, la sentencia de 40 años y el tzitzit': 'The 12 spies, the bad report, the 40-year sentence and the tzitzit',
    'Calvo / Korah': 'Korah', 'La rebelión de Koraj contra el liderazgo de Moisés y Aarón y las leyes sacerdotales': "Korah's rebellion against the leadership of Moses and Aaron, and the priestly laws",
    'Estatuto / Ley': 'Statute', 'La vaca roja, la muerte de Miriam y Aarón, el agua de Meribá y la serpiente de bronce': 'The red heifer, the deaths of Miriam and Aaron, the water of Meribah and the bronze serpent',
    'Balak (devastador)': 'Balak (destroyer)', 'Balak contrata a Balaam para maldecir a Israel pero Dios convierte las maldiciones en bendiciones': 'Balak hires Balaam to curse Israel, but God turns the curses into blessings',
    'Finees': 'Phinehas', 'El celo de Pinjás, el segundo censo, las hijas de Zelofehad y el calendario de ofrendas': "Phinehas' zeal, the second census, the daughters of Zelophehad and the calendar of offerings",
    'Tribus / Varas': 'Tribes', 'Las leyes de los votos, la guerra contra Madián y las dos tribus y media al este del Jordán': 'The laws of vows, the war against Midian and the two and a half tribes east of the Jordan',
    'Jornadas / Etapas': 'Journeys', 'Las 42 etapas del viaje por el desierto, las fronteras de la tierra y las ciudades de refugio': 'The 42 stages of the wilderness journey, the borders of the land and the cities of refuge',
    'Palabras / Cosas': 'Words', 'El discurso de despedida de Moisés: revisión del viaje por el desierto y los fracasos pasados': "Moses' farewell speech: a review of the wilderness journey and past failures",
    'Y oré / Supliqué': 'And I pleaded', 'El Shemá Israel, los Diez Mandamientos repetidos y la advertencia sobre los ídolos': 'The Shema Israel, the Ten Commandments repeated and the warning about idols',
    'Como resultado / Recompensa': 'As a result', 'Las bendiciones de la obediencia, la advertencia del orgullo y el maná en el desierto': 'The blessings of obedience, the warning against pride and the manna in the wilderness',
    'Mira / Ve': 'See', 'La bendición y la maldición, el lugar central de adoración, el año sabático y las fiestas': 'The blessing and the curse, the central place of worship, the sabbatical year and the feasts',
    'Jueces': 'Judges', 'Las leyes del sistema judicial, el rey, el sacerdocio, los profetas y las ciudades de refugio': 'Laws of the courts, the king, the priesthood, the prophets and the cities of refuge',
    'Cuando salgas': 'When you go out', '74 mandamientos sobre vida familiar, social y comunitaria — el código ético más denso de la Torah': '74 commandments about family, social and community life — the densest ethical code in the Torah',
    'Cuando entres': 'When you come in', 'Las primicias, la declaración del diezmo, las bendiciones en Gerizim y las maldiciones en Ebal': 'The firstfruits, the tithe declaration, the blessings on Gerizim and the curses on Ebal',
    'Ustedes están de pie': 'You are standing', 'La renovación del pacto, la circuncisión del corazón y el llamado a elegir la vida': 'The renewal of the covenant, the circumcision of the heart and the call to choose life',
    'Y fue': 'And he went', 'Moisés entrega el liderazgo a Josué, ordena leer la Torah cada siete años y anuncia que el pueblo se apartará': 'Moses hands leadership to Joshua, commands that the Torah be read every seven years and foretells that the people will turn away',
    'Escuchen': 'Listen', 'El cántico de Moisés: la fidelidad de YHWH, la infidelidad de Israel y la promesa de redención final': "The song of Moses: YHWH's faithfulness, Israel's unfaithfulness and the promise of final redemption",
    'Esta es la bendición': 'This is the blessing', 'Las bendiciones finales de Moisés sobre las 12 tribus y la muerte de Moisés en el monte Nebo': "Moses' final blessings over the 12 tribes and his death on Mount Nebo",
    'Ve tú': 'Go forth',
  });
  // ── Lector, búsqueda, perfil, premium, cuenta (textos armados en código) ──
  I.add({
    'Error cargando capítulo': 'Error loading chapter', 'Función Premium': 'Premium feature',
    'La Traducción Kodesh es una versión de equivalencia formal anclada al hebreo y griego original, exclusiva para suscriptores Premium.': 'The Kodesh Translation is a formal-equivalence version anchored in the original Hebrew and Greek, exclusive to Premium subscribers.',
    'Cargando Traducción Kodesh...': 'Loading Kodesh Translation...', 'Inicia sesión para ver la Traducción Kodesh.': 'Sign in to see the Kodesh Translation.',
    'Traducción Kodesh': 'Kodesh Translation', '¿Algo no suena bien? Repórtalo': 'Something sound off? Report it', '✨ O usa tu maná': '✨ Or use your manna',
    "El interlineal te muestra el texto original de cada versículo, palabra por palabra, con su número Strong's, transliteración y traducción.": "The interlinear shows you the original text of each verse, word by word, with its Strong's number, transliteration and translation.",
    'Sin datos para mostrar.': 'No data to show.', 'Inicia sesión para ver tu historial de lectura': 'Sign in to see your reading history',
    'Aún no has marcado capítulos como leídos': "You haven't marked any chapters as read yet", 'Error cargando el historial': 'Error loading history',
    'Escribe el libro y capítulo, luego presiona Enter': 'Type the book and chapter, then press Enter', 'En los versículos': 'In the verses',
    '📜 Parashá de la semana': '📜 Parashah of the week', '✨ Canjea maná por consultas de IA': '✨ Trade manna for AI questions',
    'Se guardan y se usan solas cuando se acaba tu límite del mes.': 'They are saved and used automatically when your monthly limit runs out.',
    '✨ Maná y protectores': '✨ Manna and shields', 'Maná': 'Manna', 'maná': 'manna', '10 maná': '10 manna',
    '🕯️ Shabat shalom. Hoy tu racha descansa contigo: no se pierde aunque no leas.': '🕯️ Shabbat shalom. Today your streak rests with you: it is not lost even if you do not read.',
    'por capítulo (hasta 5 al día),': 'per chapter (up to 5 a day),', 'Sin detalle de capítulos guardado para este día': 'No chapter details saved for this day',
    'Lectura del día': "Day's reading", 'cap. leídos': 'ch. read', 'Próximo capítulo a leer': 'Next chapter to read', 'Leer →': 'Read →',
    '¡Biblia completa leída!': 'Whole Bible read!', '🔥 Racha de lectura': '🔥 Reading streak', 'Días seguidos': 'Days in a row', '📅 Últimas 5 semanas': '📅 Last 5 weeks',
    'Caps. leídos': 'Chapters read', 'Marcadores por categoría': 'Bookmarks by category', 'No tienes marcadores aún.': "You don't have any bookmarks yet.",
    'Clic derecho en cualquier versículo para marcar.': 'Right-click any verse to bookmark it.', 'No tienes notas ni marcadores aún.': "You don't have notes or bookmarks yet.",
    'Inicia sesión para ver tu historial de estudios': 'Sign in to see your study history',
    'Aún no tienes conversaciones guardadas. Habla con el Asistente de Estudio en cualquier capítulo.': "You don't have saved conversations yet. Talk to the Study Assistant on any chapter.",
    'No se pudo cargar la Biblia.': 'The Bible could not be loaded.', 'No se pudo cargar la Biblia': 'The Bible could not be loaded',
    'Búsqueda por tema con IA · 1 consulta': 'AI topic search · 1 question', 'Buscando en las Escrituras...': 'Searching the Scriptures...',
    'Inicia sesión para buscar en las Escrituras.': 'Sign in to search the Scriptures.', 'Tu sesión expiró — inicia sesión de nuevo.': 'Your session expired — please sign in again.',
    'Tu sesión expiró — inicia sesión de nuevo': 'Your session expired — please sign in again',
    'No se encontraron resultados. Intenta con otras palabras.': 'No results found. Try other words.', 'Ej: Génesis 3, Juan 3...': 'E.g. Genesis 3, John 3...',
    'Nombre de la categoría': 'Category name', '✦ Ya tienes KODESH Premium activo': '✦ You already have KODESH Premium',
    'La tienda no está disponible — intenta de nuevo': 'The store is not available — try again', 'No hay productos disponibles.': 'No products available.',
    'Producto no encontrado.': 'Product not found.', 'La compra pertenece a otra cuenta.': 'The purchase belongs to another account.',
    '🎉 ¡Bienvenido a KODESH Premium!': '🎉 Welcome to KODESH Premium!', 'La compra no pudo verificarse.': 'The purchase could not be verified.', 'Hubo un problema:': 'There was a problem:',
    'Aquí comienza la parashá': 'The parashah begins here', 'Comienza la parashá': 'The parashah begins',
    'No se pudo generar la traducción:': 'The translation could not be generated:', 'sin nombre': 'untitled',
    '¿En qué versículo notaste el problema? (número, o deja vacío si es general)': 'Which verse has the problem? (number, or leave empty if it is general)',
    '¿Qué te pareció incorrecto o extraño?': 'What seemed wrong or strange?', '¡Gracias! Tu reporte ayuda a mejorar la traducción.': 'Thank you! Your report helps improve the translation.',
    'No se pudo enviar el reporte. Intenta de nuevo.': 'The report could not be sent. Try again.', 'Capítulo desmarcado': 'Chapter unmarked',
    '✓ Capítulo marcado como leído': '✓ Chapter marked as read', '✓ Copiado al portapapeles': '✓ Copied to clipboard', '✓ Copiado para compartir': '✓ Copied to share',
    'Solo se permiten imágenes': 'Only images are allowed', 'La imagen debe ser menor a 5MB': 'The image must be smaller than 5MB', 'Error al subir la foto — intenta de nuevo': 'Error uploading the photo — try again',
    'Límite de búsquedas alcanzado': 'Search limit reached', 'Límite del lexicón alcanzado': 'Lexicon limit reached', 'Límite del asistente alcanzado': 'Assistant limit reached',
    '✨ Listo: vuelve a intentarlo, se usará tu consulta extra': '✨ Done: try again and your extra question will be used',
    'Inicia sesión para ver el interlineal.': 'Sign in to see the interlinear.', 'Error al cargar interlineal': 'Error loading the interlinear', 'No se pudo cargar el interlineal.': 'The interlinear could not be loaded.',
    "No se encontró información para este Strong's.": "No information found for this Strong's number.", 'Error al cargar la definición.': 'Error loading the definition.',
    '✦ Preparando tu prueba gratis...': '✦ Preparing your free trial...', 'Inicia sesión para continuar': 'Sign in to continue',
    'Error al crear sesión de pago': 'Error creating the payment session', 'Error al procesar — intenta de nuevo': 'Error processing — try again',
    '✦ VERSÍCULO DEL DÍA': '✦ VERSE OF THE DAY', 'No encontré ese libro/capítulo — intenta "Génesis 3"': 'I could not find that book/chapter — try "Genesis 3"',
    'Se guarda automáticamente': 'Saved automatically', 'Máximo de protectores': 'Maximum shields', 'de maná': 'of manna', 'capítulos': 'chapters',
    'Con Premium recibes 1 gratis cada mes 💎': 'With Premium you get 1 free every month 💎', '✓ Versículos copiados': '✓ Verses copied', '✓ Versículo copiado': '✓ Verse copied',
    'versículos guardados': 'verses saved', 'versículo': 'verse', 'versículos': 'verses', 'Inicia sesión para usar el asistente': 'Sign in to use the assistant',
    '¿Quisiste decir…?': 'Did you mean…?', 'Ir al versículo': 'Go to verse', 'Ir al capítulo': 'Go to chapter',
    'Escribe en tus propias palabras… ej: versículo sobre la fe que mueve montañas': 'Write in your own words… e.g. verse about faith that moves mountains',
    'Pregunta por un tema o por una idea': 'Ask about a topic or an idea', 'La IA busca en toda la Escritura los pasajes más relevantes. Usa 1 consulta de tu plan.': 'The AI searches all of Scripture for the most relevant passages. It uses 1 question from your plan.',
    'Toca para abrir este versículo →': 'Tap to open this verse →', 'Error al buscar. Verifica tu conexión e intenta de nuevo.': 'Search error. Check your connection and try again.',
    '✦ Verificando tu suscripción...': '✦ Verifying your subscription...', 'Pago cancelado — puedes intentarlo de nuevo cuando quieras': 'Payment canceled — you can try again anytime',
    'Continúas donde te quedaste': 'You continue where you left off', 'Escuchar el capítulo': 'Listen to the chapter', 'Ya tengo cuenta': 'I already have an account',
    'Lo que guardaste en este teléfono pasa a tu cuenta.': 'What you saved on this phone moves to your account.', 'Pregúntale a las Escrituras': 'Ask the Scriptures',
    'El asistente de estudio usa IA. Crea tu cuenta gratis para usarlo cada día.': 'The study assistant uses AI. Create your free account to use it every day.',
    'La búsqueda por significado usa IA. Crea tu cuenta gratis, o busca por palabras sin cuenta.': 'Meaning search uses AI. Create your free account, or search by words without an account.',
    'Crea tu cuenta gratis para ver cada palabra en su idioma original.': 'Create your free account to see each word in its original language.',
    'Crea tu cuenta gratis para leer la Traducción Kodesh.': 'Create your free account to read the Kodesh Translation.', 'Tu perfil': 'Your profile',
    'Crea tu cuenta gratis para guardar tu avance, tus notas y tus insignias en todos tus equipos.': 'Create your free account to keep your progress, notes and badges on all your devices.',
    'Primero crea tu cuenta, así tu suscripción queda guardada y puedes restaurarla en cualquier equipo.': 'Create your account first, so your subscription is saved and you can restore it on any device.',
    'Crea tu cuenta gratis para guardar tus estudios en la nube.': 'Create your free account to save your studies in the cloud.', 'Crea tu cuenta gratis': 'Create your free account',
    'Para usar esta función necesitas una cuenta. Es gratis.': 'You need an account to use this feature. It is free.', 'Parashá': 'Parashah',
    'Plataforma bíblica Hebreo-Mesiánica con estudio profundo, marcadores, notas y asistente IA': 'Hebrew-Messianic Bible platform with deep study, bookmarks, notes and an AI assistant',
  });
  I.rule(/^(\d+) de (\d+)$/, '$1 of $2');
  // Fechas históricas: «c. 5 a.C.–30 d.C.», «586 a.C.»
  I.rule(/^(c\. )?(\d+) a\.C\.(?:[–-](c\. )?(\d+) (a|d)\.C\.)?$/, (m, c1, a, c2, b, e) => `${c1 || ''}${a} BC${b ? '–' + (c2 || '') + b + (e === 'a' ? ' BC' : ' AD') : ''}`);
  I.rule(/^(c\. )?(\d+) d\.C\.$/, '$1$2 AD');
  // «c. 2000–1800 a.C.», «c. 1400/1200–1050 a.C.», «s. XV o XIII a.C.», «c. 30–95 d.C.»
  I.rule(/^([cs]\. )?[\dIVXLC\/–\- o]+ (a|d)\.C\.$/, m => m.replace(/^s\. /, 'c. ').replace(/ o /g, ' or ').replace(/ a\.C\.$/, ' BC').replace(/ d\.C\.$/, ' AD').replace(/\bXV\b/, '15th c.').replace(/\bXIII\b/, '13th c.'));
  I.rule(/^de (\d+)$/, 'of $1');
  I.rule(/^(\d+) versículos guardados$/, '$1 verses saved');
  I.rule(/^Ver más \((\d+)\)$/, 'See more ($1)');
  I.rule(/^¿Qué dice la Escritura sobre «(.+)»\?$/, 'What does Scripture say about “$1”?');
  I.rule(/^«(.+)» no aparece tal cual en la RVR60\. Revisa la ortografía o pregúntale a la IA por el tema\.$/, '“$1” does not appear word for word in the WMB. Check the spelling or ask the AI about the topic.');
  // ── Inicio de sesión y cuenta ──
  I.add({
    'Plataforma Bíblica Hebreo-Mesiánica': 'Hebrew-Messianic Bible Platform', 'Correo electrónico': 'Email', 'Contraseña': 'Password',
    '¿Olvidaste tu contraseña?': 'Forgot your password?', 'Entrar con Google': 'Sign in with Google', 'Entrar con Apple': 'Sign in with Apple',
    'Registrarse con Google': 'Sign up with Google', 'Registrarse con Apple': 'Sign up with Apple', 'Nueva contraseña': 'New password',
    'Elige una contraseña segura para tu cuenta': 'Choose a strong password for your account', 'Confirmar contraseña': 'Confirm password',
    'Código de verificación (2 pasos)': 'Verification code (2-step)', 'Guardar nueva contraseña': 'Save new password',
    'Al entrar aceptas estudiar las Escrituras con corazón íntegro 📖': 'By signing in you agree to study the Scriptures with a whole heart 📖',
    'Lee y escucha la Palabra': 'Read the Word', 'La Biblia completa para leer, libros con audio dramatizado (y cada vez más) y la promesa de cada día.': 'The whole Bible in the World Messianic Bible, with the words of Yeshua in red and a promise for every day.',
    'Estudia sus raíces': 'Study its roots', 'Entiende el texto en su mundo': 'Understand the text in its world',
    'Palabras en hebreo y griego, mapas reales, personajes y el trasfondo de cada pasaje.': 'Hebrew and Greek words, real maps, people and the background of every passage.',
    'Tu camino diario': 'Your daily path', 'Un poco cada día': 'A little every day', 'Tu lectura de hoy, la porción de la semana y tu avance, siempre donde lo dejaste.': "Today's reading, the weekly portion and your progress, always where you left off.",
    '¿Guardas el Shabat y las fiestas bíblicas?': 'Do you keep Shabbat and the biblical feasts?', 'Sí, muéstramelos': 'Yes, show them to me',
    'Continuar con Apple': 'Continue with Apple', 'Continuar con Google': 'Continue with Google', 'Explorar sin cuenta': 'Explore without an account',
    'Al continuar aceptas nuestros': 'By continuing you accept our', 'Términos de Servicio': 'Terms of Service', 'y la': 'and the', 'Política de Privacidad': 'Privacy Policy',
    'tu@correo.com': 'you@email.com', 'Tu nombre': 'Your name', 'Mínimo 8 caracteres': 'At least 8 characters', 'Repite tu contraseña': 'Repeat your password',
    '6 dígitos de tu app autenticadora': '6 digits from your authenticator app', 'Crear cuenta': 'Create account', 'Iniciar sesión': 'Sign in', 'Registrarse': 'Sign up', 'o': 'or',
    'El enlace para cambiar la contraseña venció o ya se usó. Escribe tu correo y toca "¿Olvidaste tu contraseña?" para recibir uno nuevo.': 'The password reset link expired or was already used. Type your email and tap "Forgot your password?" to get a new one.',
    'Completa todos los campos': 'Fill in all the fields', 'Correo o contraseña incorrectos': 'Wrong email or password', 'La contraseña debe tener al menos 8 caracteres': 'The password must have at least 8 characters',
    '✓ Cuenta creada. Revisa tu correo para confirmar y luego entra.': '✓ Account created. Check your email to confirm, then sign in.', 'No se pudo completar el inicio de sesion.': 'Sign-in could not be completed.',
    'Escribe tu correo primero': 'Type your email first', '✓ Revisa tu correo para restablecer tu contraseña': '✓ Check your email to reset your password', 'Las contraseñas no coinciden': "The passwords don't match",
    'Tu cuenta tiene verificación en dos pasos: escribe el código de 6 dígitos de tu app autenticadora.': 'Your account has 2-step verification: type the 6-digit code from your authenticator app.',
    'No se encontró tu método de verificación en dos pasos.': 'Your 2-step verification method was not found.', 'Código incorrecto o vencido. Escribe el código actual de tu app.': 'Wrong or expired code. Type the current code from your app.',
    'Tu cuenta tiene verificación en dos pasos: escribe el código de tu app autenticadora y vuelve a intentar.': 'Your account has 2-step verification: type the code from your authenticator app and try again.',
    '✓ Contraseña actualizada correctamente': '✓ Password updated', 'Y conoceréis la verdad, y la verdad os libertará.': 'You will know the truth, and the truth will make you free.',
    'Actualizamos nuestros Términos': 'We updated our Terms', 'Para continuar usando KODESH, por favor revisa y acepta nuestros': 'To keep using KODESH, please review and accept our',
    'Términos y Condiciones': 'Terms and Conditions', 'He leído y acepto los Términos y Condiciones y la Política de Privacidad de KODESH.': 'I have read and accept the KODESH Terms and Conditions and Privacy Policy.',
    'Hubo un problema al guardar tu aceptación. Intenta de nuevo.': 'There was a problem saving your acceptance. Try again.', 'Cerrar sesión': 'Sign out',
    '💎 Premium: recibiste tu protector de racha del mes': "💎 Premium: you received this month's streak shield",
    'No se pudo comprar el protector. Intenta de nuevo.': 'The shield could not be bought. Try again.', 'búsqueda IA': 'AI search', 'lexicón': 'lexicon',
    'Ya tienes 10 consultas guardadas de ese tipo': 'You already have 10 saved questions of that type', 'No se pudo canjear. Intenta de nuevo.': 'It could not be traded. Try again.',
    'Shabat: hoy tu racha descansa': 'Shabbat: your streak rests today', '‹ Volver': '‹ Back', 'Volver': 'Back', 'Entrar a KODESH': 'Sign in to KODESH', 'Entrar a Kodesh': 'Sign in to Kodesh',
    'Crear mi cuenta': 'Create my account', 'Saltar': 'Skip', 'Siguiente': 'Next', 'Empezar': 'Get started', 'Crear cuenta gratis': 'Create free account', 'KODESH · Cuenta gratis': 'KODESH · Free account',
    'Cuenta gratis': 'Free account', 'Yeshúa': 'Yeshua', 'Mashíaj': 'Messiah', 'Shabat shalom': 'Shabbat shalom', 'Entrar': 'Sign in', 'Atrás': 'Back', 'Cancelar': 'Cancel', 'Aceptar': 'OK', 'Enviar': 'Send', 'Borrar': 'Delete', 'Editar': 'Edit', 'Racha de lectura': 'Reading streak', 'Lee un capítulo hoy para mantener tu racha': 'Read a chapter today to keep your streak',
  });
  I.rule(/^🛡️ Tu protector salvó tu racha de (\d+) días? \((\d+) días? cubiertos?\)$/, '🛡️ Your shield saved your $1-day streak ($2 days covered)');
  I.rule(/^Tu racha de (\d+) días? terminó\. ¡Hoy empieza una nueva! 📖$/, 'Your $1-day streak ended. A new one starts today! 📖');
  I.rule(/^🔥 ¡(\d+) días seguidos! \+(\d+) maná$/, '🔥 $1 days in a row! +$2 manna');
  I.rule(/^Ya tienes el máximo de (\d+) de maná\. ¡Sigue leyendo! 📖$/, 'You already have the maximum of $1 manna. Keep reading! 📖');
  I.rule(/^🛡️ ¡Protector comprado! Tienes (\d+)\.?$/, '🛡️ Shield bought! You have $1.');
  I.rule(/^✨ \+1 consulta de (.+)$/, '✨ +1 $1 question');
  // Mensajes del servidor (límites del plan)
  I.rule(/^Alcanzaste tu límite de (\d+) consultas al asistente este mes\. Actualiza a Premium para continuar estudiando sin límites\.$/, 'You reached your limit of $1 assistant questions this month. Upgrade to Premium to keep studying without limits.');
  I.rule(/^Alcanzaste tu límite de (\d+) consultas al lexicón este mes\. Actualiza a Premium para continuar\.$/, 'You reached your limit of $1 lexicon lookups this month. Upgrade to Premium to continue.');
  I.rule(/^Alcanzaste tu límite de (\d+) búsquedas este mes\. Actualiza a Premium para continuar\.$/, 'You reached your limit of $1 searches this month. Upgrade to Premium to continue.');
  I.rule(/^Alcanzaste tu límite de (\d+) (consultas|búsquedas) este mes\.$/, (m, n, k) => `You reached your limit of ${n} ${k === 'búsquedas' ? 'searches' : 'questions'} this month.`);
  I.add({ 'Alcanzaste tu límite de consultas este mes.': 'You reached your question limit this month.', 'Alcanzaste tu límite. Intenta más tarde.': 'You reached your limit. Try again later.',
    'El Modo Interlineal aún no está disponible para este libro.': 'Interlinear mode is not available for this book yet.', 'Error desconocido': 'Unknown error' });
  I.rule(/^Hubo un problema: (.+)$/, 'There was a problem: $1');
  // ── Textos con números ──
  I.rule(/^Capítulo (\d+)$/, 'Chapter $1');
  I.rule(/^← Capítulo (\d+)$/, '← Chapter $1');
  I.rule(/^Capítulo (\d+) →$/, 'Chapter $1 →');
  I.rule(/^Cap\. (\d+)$/, 'Ch. $1');
  I.rule(/^(\S+) · (\d+) versículos$/, '$1 · $2 verses');
  I.rule(/^(\d+) versículos$/, '$1 verses');
  I.rule(/^1 versículo$/, '1 verse');
  I.rule(/^Ciclo de Estudio · Porción (\d+)$/, 'Study Cycle · Portion $1');
  I.rule(/^(.+) — Capítulos$/, '$1 — Chapters');
})();
