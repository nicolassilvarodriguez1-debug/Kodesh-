"""Línea de tiempo bíblica → data/linea-tiempo.json
Épocas con fechas aproximadas («c.»), época de cada capítulo, profetas y los reyes
que nombran sus libros, salmos con su historia (títulos de los salmos) y edades que
da el texto. Todas las citas se validan contra biblia-rvr.json. Sin fechas de
Theographic ni datos inventados."""
import json, os, re
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
BIB = json.load(open(os.path.join(ROOT, 'biblia-rvr.json')))

def chk(ref):
    m = re.match(r'^([1-3]?[A-Z]{2,3}) (\d+)(?::(\d+)(?:-(\d+))?)?$', ref)
    assert m, ref
    b, c, v, v2 = m.group(1), m.group(2), m.group(3), m.group(4)
    assert b in BIB and c in BIB[b], f'no existe {ref}'
    for x in (v, v2):
        if x: assert x in BIB[b][c], f'no existe {ref}'
    return ref

ERAS = [
    ['origenes', 'Orígenes', '', 'De la creación a la torre de Babel.', 'Génesis 1–11', 'GEN 1'],
    ['patriarcas', 'Patriarcas', 'c. 2000–1800 a.C.', 'Abraham, Isaac, Jacob y José.', 'Génesis 12–50 · Job', 'GEN 12'],
    ['exodo', 'Egipto, Éxodo y desierto', 's. XV o XIII a.C.', 'La esclavitud, la salida de Egipto, el Sinaí y cuarenta años en el desierto.', 'Éxodo – Deuteronomio', 'EXO 1'],
    ['jueces', 'Conquista y jueces', 'c. 1400/1200–1050 a.C.', 'Josué entra en la tierra; después, los jueces.', 'Josué · Jueces · Rut · 1 Samuel 1–7', 'JOS 1'],
    ['reino', 'Reino unido', 'c. 1050–931 a.C.', 'Saúl, David y Salomón.', '1 Samuel 8 – 1 Reyes 11 · Salmos · Proverbios', '1SA 8'],
    ['dividido', 'Reino dividido y profetas', '931–586 a.C.', 'Israel al norte (cae en 722 a.C.) y Judá al sur.', '1 Reyes 12 – 2 Reyes 24 · Isaías · Jeremías · Oseas · Amós', '1KI 12'],
    ['exilio', 'Exilio en Babilonia', '586–538 a.C.', 'Jerusalén cae y el pueblo vive en Babilonia.', 'Lamentaciones · Ezequiel · Daniel', '2KI 25'],
    ['regreso', 'Regreso y reconstrucción', '538–c. 430 a.C.', 'Bajo Persia vuelven, reconstruyen el Templo y los muros.', 'Esdras · Nehemías · Ester · Hageo · Zacarías · Malaquías', 'EZR 1'],
    ['silencio', 'Entre los testamentos', 'c. 430–5 a.C.', 'Persia, Grecia, los macabeos y Roma. Ningún libro de esta Biblia se escribe en este tiempo.', '', ''],
    ['yeshua', 'Yeshúa', 'c. 5 a.C.–30 d.C.', 'Su nacimiento, su ministerio, su muerte y su resurrección.', 'Mateo · Marcos · Lucas · Juan', 'MAT 1'],
    ['iglesia', 'Los primeros creyentes', 'c. 30–95 d.C.', 'El Espíritu en Shavuot y la Buena Noticia hasta las naciones.', 'Hechos · Cartas · Apocalipsis', 'ACT 1'],
]
# época por libro; rangos [desde, hasta, época]; None = varias épocas / fecha discutida (con nota)
BOOKS = {
    'GEN': [[1, 11, 'origenes'], [12, 50, 'patriarcas']], 'JOB': 'patriarcas',
    'EXO': 'exodo', 'LEV': 'exodo', 'NUM': 'exodo', 'DEU': 'exodo',
    'JOS': 'jueces', 'JDG': 'jueces', 'RUT': 'jueces',
    '1SA': [[1, 7, 'jueces'], [8, 31, 'reino']], '2SA': 'reino',
    '1KI': [[1, 11, 'reino'], [12, 22, 'dividido']], '2KI': [[1, 24, 'dividido'], [25, 25, 'exilio']],
    '1CH': [[1, 9, None], [10, 29, 'reino']], '2CH': [[1, 9, 'reino'], [10, 35, 'dividido'], [36, 36, 'exilio']],
    'EZR': 'regreso', 'NEH': 'regreso', 'EST': 'regreso',
    'PSA': None, 'PRO': [[1, 24, 'reino'], [25, 29, 'dividido'], [30, 31, None]], 'ECC': 'reino', 'SNG': 'reino',
    'ISA': 'dividido', 'JER': [[1, 38, 'dividido'], [39, 52, 'exilio']], 'LAM': 'exilio', 'EZK': 'exilio', 'DAN': 'exilio',
    'HOS': 'dividido', 'JOL': None, 'AMO': 'dividido', 'OBA': None, 'JON': 'dividido', 'MIC': 'dividido',
    'NAM': 'dividido', 'HAB': 'dividido', 'ZEP': 'dividido', 'HAG': 'regreso', 'ZEC': 'regreso', 'MAL': 'regreso',
    'MAT': 'yeshua', 'MRK': 'yeshua', 'LUK': 'yeshua', 'JHN': 'yeshua',
}
for b in ['ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV']:
    BOOKS[b] = 'iglesia'
NOTES = {
    'JOB': 'Época según la tradición; el libro no da la fecha.',
    'JOL': 'Fecha discutida: el libro no nombra rey.', 'OBA': 'Fecha discutida: el libro no nombra rey.',
    '1CH:1-9': 'Genealogías de Adán hasta el regreso del exilio.', 'PRO:30-31': 'Palabras de Agur y del rey Lemuel; sin fecha.',
    'PSA': 'Los salmos son de varias épocas.',
}
# Salmos con época clara por su título: «de David» (73), Salomón (72, 127), Moisés (90), el exilio (137)
DAVID = [3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38,39,40,41,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,68,69,70,86,101,103,108,109,110,122,124,131,133,138,139,140,141,142,143,144,145]
assert len(DAVID) == 73
PSALMS = {**{p: ['reino', 'Salmo de David'] for p in DAVID}, 72: ['reino', 'Salmo de Salomón'], 127: ['reino', 'Salmo de Salomón'],
          90: ['exodo', 'Oración de Moisés'], 137: ['exilio', 'Junto a los ríos de Babilonia']}
# D · Salmos con su historia (según su título)
PSHIST = [
    [3, 'Cuando huía de Absalón, su hijo', '2SA 15'],
    [18, 'El día que YHWH lo libró de sus enemigos y de Saúl', '2SA 22'],
    [34, 'Cuando mudó su semblante delante de Abimelec', '1SA 21:10-15'],
    [51, 'Cuando el profeta Natán vino a él, después de Betsabé', '2SA 12'],
    [52, 'Cuando Doeg el edomita avisó a Saúl', '1SA 22:9-10'],
    [54, 'Cuando los zifeos dijeron a Saúl dónde se escondía', '1SA 23:19'],
    [56, 'Cuando los filisteos lo prendieron en Gat', '1SA 21:10-15'],
    [57, 'Cuando huyó de Saúl a la cueva', '1SA 22:1'],
    [59, 'Cuando Saúl mandó vigilar su casa para matarlo', '1SA 19:11'],
    [60, 'Cuando Joab venció a Edom en el valle de la Sal', '2SA 8:13'],
    [63, 'Cuando estaba en el desierto de Judá', '1SA 23:14'],
    [142, 'Cuando estaba en la cueva', '1SA 22:1'],
]
# C · Profetas y los reyes que nombran sus libros
PROPHETS = [
    ['ISA', 'Isaías', 'ISA 1:1', ['Uzías', 'Jotam', 'Acaz', 'Ezequías'], []],
    ['HOS', 'Oseas', 'HOS 1:1', ['Uzías', 'Jotam', 'Acaz', 'Ezequías'], ['Jeroboam hijo de Joás']],
    ['AMO', 'Amós', 'AMO 1:1', ['Uzías'], ['Jeroboam hijo de Joás']],
    ['JON', 'Jonás', '2KI 14:25', [], ['Jeroboam hijo de Joás']],
    ['MIC', 'Miqueas', 'MIC 1:1', ['Jotam', 'Acaz', 'Ezequías'], []],
    ['ZEP', 'Sofonías', 'ZEP 1:1', ['Josías'], []],
    ['JER', 'Jeremías', 'JER 1:2-3', ['Josías', 'Joacim', 'Sedequías'], []],
    ['EZK', 'Ezequiel', 'EZK 1:2', ['Exilio'], []],
    ['DAN', 'Daniel', 'DAN 1:1', ['Joacim', 'Exilio', 'Persia'], []],
    ['HAG', 'Hageo', 'HAG 1:1', ['Persia'], []],
    ['ZEC', 'Zacarías', 'ZEC 1:1', ['Persia'], []],
]
PROPHET_NOTE = {'JON': 'Según 2 Reyes 14:25, profetizó en días de Jeroboam II.', 'EZK': '«En el quinto año de la deportación del rey Joaquín».', 'DAN': 'Desde el tercer año de Joacim (Dn 1:1) hasta Ciro de Persia (Dn 10:1).', 'HAG': 'En el segundo año del rey Darío de Persia.', 'ZEC': 'En el segundo año del rey Darío de Persia.'}
NOKING = ['Joel', 'Abdías', 'Nahúm', 'Habacuc', 'Malaquías']
REIGNS = ['Uzías', 'Jotam', 'Acaz', 'Ezequías', 'Manasés', 'Amón', 'Josías', 'Joacim', 'Joaquín', 'Sedequías', 'Exilio', 'Persia']
# E · Edades que da el texto
LIVES = [
    ['Antes del diluvio', [['Adán', 930, 'GEN 5:5'], ['Set', 912, 'GEN 5:8'], ['Enós', 905, 'GEN 5:11'], ['Cainán', 910, 'GEN 5:14'], ['Mahalaleel', 895, 'GEN 5:17'], ['Jared', 962, 'GEN 5:20'], ['Enoc', 365, 'GEN 5:23'], ['Matusalén', 969, 'GEN 5:27'], ['Lamec', 777, 'GEN 5:31'], ['Noé', 950, 'GEN 9:29']]],
    ['Después del diluvio', [['Sem', 600, 'GEN 11:10-11'], ['Taré', 205, 'GEN 11:32'], ['Abraham', 175, 'GEN 25:7'], ['Sara', 127, 'GEN 23:1'], ['Isaac', 180, 'GEN 35:28'], ['Ismael', 137, 'GEN 25:17'], ['Jacob', 147, 'GEN 47:28'], ['José', 110, 'GEN 50:26']]],
    ['Del Éxodo en adelante', [['Leví', 137, 'EXO 6:16'], ['Amram', 137, 'EXO 6:20'], ['Aarón', 123, 'NUM 33:39'], ['Moisés', 120, 'DEU 34:7'], ['Josué', 110, 'JOS 24:29'], ['Elí', 98, '1SA 4:15'], ['Joiada', 130, '2CH 24:15']]],
]
FACTS = [['Abraham tenía 100 años cuando nació Isaac, e Isaac 60 cuando nacieron Esaú y Jacob.', 'GEN 21:5', 'GEN 25:26'],
         ['Enoc no murió a los 365 años: «desapareció, porque le llevó Dios».', 'GEN 5:24', ''],
         ['Moisés tenía 80 años y Aarón 83 cuando hablaron con Faraón.', 'EXO 7:7', '']]

# ── ¿Quién vivía? · años desde la creación, sumados del texto (Gn 5 y 11) ──
# [nombre, edad del padre al engendrarlo (o None), años que vivió, cita de la edad del padre, cita de su vida, padre]
CHAIN = [
    ['Adán', None, 930, '', 'GEN 5:5', None],
    ['Set', 130, 912, 'GEN 5:3', 'GEN 5:8', 'Adán'], ['Enós', 105, 905, 'GEN 5:6', 'GEN 5:11', 'Set'],
    ['Cainán', 90, 910, 'GEN 5:9', 'GEN 5:14', 'Enós'], ['Mahalaleel', 70, 895, 'GEN 5:12', 'GEN 5:17', 'Cainán'],
    ['Jared', 65, 962, 'GEN 5:15', 'GEN 5:20', 'Mahalaleel'], ['Enoc', 162, 365, 'GEN 5:18', 'GEN 5:23', 'Jared'],
    ['Matusalén', 65, 969, 'GEN 5:21', 'GEN 5:27', 'Enoc'], ['Lamec', 187, 777, 'GEN 5:25', 'GEN 5:31', 'Matusalén'],
    ['Noé', 182, 950, 'GEN 5:28', 'GEN 9:29', 'Lamec'],
    # Sem tenía 100 «dos años después del diluvio» (Noé 600 en el diluvio) → Noé tenía 502
    ['Sem', 502, 600, 'GEN 11:10', 'GEN 11:11', 'Noé'],
    ['Arfaxad', 100, 438, 'GEN 11:10', 'GEN 11:13', 'Sem'], ['Sala', 35, 433, 'GEN 11:12', 'GEN 11:15', 'Arfaxad'],
    ['Heber', 30, 464, 'GEN 11:14', 'GEN 11:17', 'Sala'], ['Peleg', 34, 239, 'GEN 11:16', 'GEN 11:19', 'Heber'],
    ['Reu', 30, 239, 'GEN 11:18', 'GEN 11:21', 'Peleg'], ['Serug', 32, 230, 'GEN 11:20', 'GEN 11:23', 'Reu'],
    ['Nacor', 30, 148, 'GEN 11:22', 'GEN 11:25', 'Serug'], ['Taré', 29, 205, 'GEN 11:24', 'GEN 11:32', 'Nacor'],
    ['Abraham', 70, 175, 'GEN 11:26', 'GEN 25:7', 'Taré'],
    ['Sara', 10, 127, 'GEN 17:17', 'GEN 23:1', 'Abraham'],        # diez años menor que Abraham
    ['Ismael', 86, 137, 'GEN 16:16', 'GEN 25:17', 'Abraham'],
    ['Isaac', 100, 180, 'GEN 21:5', 'GEN 35:28', 'Abraham'], ['Jacob', 60, 147, 'GEN 25:26', 'GEN 47:28', 'Isaac'],
    # Jacob 130 al llegar a Egipto (Gn 47:9); José 39 entonces (30 en Gn 41:46 + 7 de abundancia + 2 de hambre, Gn 45:6)
    ['José', 91, 110, 'GEN 47:9', 'GEN 50:26', 'Jacob'],
]
born = {}
GEN = []   # [nombre, nace, muere, cita, grupo, clase]  grupo 0 fijo · 1 desde Abraham (Taré) · 2 además después de Egipto
ABR = {'Abraham', 'Sara', 'Ismael', 'Isaac', 'Jacob', 'José'}
for n, a, life, r1, r2, par in CHAIN:
    b = 0 if par is None else born[par] + a
    born[n] = b
    r1 and chk(r1); chk(r2)
    GEN.append([n, b, b + life, r2, 1 if n in ABR else 0, 'o' if n in ('Sara', 'Ismael') else ''])
assert born['Noé'] + 600 == 1656 and born['Abraham'] == 1948 and born['José'] == 2199, born

# Egipto · lectura principal: 430 años desde la promesa a Abram (75 años, Gn 12:4) hasta la Ley (Gá 3:17;
# Éx 12:40 en la Septuaginta: «en Egipto y en Canaán») → 215 años en Egipto. La otra lectura (Éx 12:40 hebreo:
# 430 en Egipto) suma 215 años a todo lo que viene después; la app la ofrece como opción.
JACOB_EG = born['Jacob'] + 130
JOSE_D = born['José'] + 110
EXODO = born['Abraham'] + 75 + 430
assert EXODO - JACOB_EG == 215 and EXODO - JOSE_D == 144, (EXODO, JACOB_EG, JOSE_D)
EG_ALT = 430 - 215
def life(n, b, d, r, kind=''):
    GEN.append([n, b, d, r, 2, kind])
life('Aarón', EXODO - 83, EXODO - 83 + 123, 'NUM 33:39')                 # Éx 7:7 · Nm 33:39
life('Moisés', EXODO - 80, EXODO - 80 + 120, 'DEU 34:7')                 # Éx 7:7 · Dt 34:7
TEMPLO = EXODO + 480                                                     # 1 R 6:1
SALOMON = TEMPLO - 3                                                     # su cuarto año
DAVID = SALOMON - 40                                                     # 1 R 2:11
life('David', DAVID - 30, SALOMON, '2SA 5:4', 'r')                        # 30 al reinar, reinó 40
life('Salomón', SALOMON, SALOMON + 40, '1KI 11:42', 'k')                  # solo su reinado (no da su edad)
# Reyes de Judá: [nombre, edad al reinar (None = no la da), años de reinado, cita]
KINGS = [['Roboam', 41, 17, '1KI 14:21'], ['Abiam', None, 3, '1KI 15:2'], ['Asa', None, 41, '1KI 15:10'],
         ['Josafat', 35, 25, '1KI 22:42'], ['Joram', 32, 8, '2KI 8:17'], ['Ocozías', 22, 1, '2KI 8:26'],
         ['Atalía', None, 6, '2KI 11:3'], ['Joás', 7, 40, '2KI 12:1'], ['Amasías', 25, 29, '2KI 14:2'],
         ['Uzías', 16, 52, '2KI 15:2'], ['Jotam', 25, 16, '2KI 15:33'], ['Acaz', 20, 16, '2KI 16:2'],
         ['Ezequías', 25, 29, '2KI 18:2'], ['Manasés', 12, 55, '2KI 21:1'], ['Amón', 22, 2, '2KI 21:19'],
         ['Josías', 8, 31, '2KI 22:1'], ['Joacaz', 23, 0, '2KI 23:31'], ['Joacim', 25, 11, '2KI 23:36'],
         ['Joaquín', 18, 0, '2KI 24:8'], ['Sedequías', 21, 11, '2KI 24:18']]
y = SALOMON + 40
for n, age, yrs, r in KINGS:
    chk(r)
    # Joacaz, Joaquín y Sedequías no murieron al terminar su reinado (Egipto, Babilonia): solo su reinado
    if age is None or n in ('Joacaz', 'Joaquín', 'Sedequías'):
        if yrs: life(n, y, y + yrs, r, 'k')
    else:
        life(n, y - age, y + yrs, r, 'r')
    y += yrs
CAIDA = y
assert TEMPLO == 2933 and SALOMON + 40 == 2970 and CAIDA == 3363, (TEMPLO, CAIDA)
for x in ('EXO 7:7', '1KI 2:11', '2KI 11:21', '2KI 25:2', 'EXO 12:40', 'GAL 3:17', 'EXO 1:8'): chk(x)
for g in LIVES:
    for n, a, r in g[1]:
        x = next((q for q in GEN if q[0] == n), None)
        if x: assert x[2] - x[1] == a, n
# [año, suceso, cita, grupo]
GEN_EVENTS = [[0, 'La creación', 'GEN 1:1', 0], [1656, 'El diluvio', 'GEN 7:6', 0],
              [born['Abraham'] + 75, 'Abram sale de Harán · la promesa', 'GEN 12:4', 1],
              [JACOB_EG, 'Jacob baja a Egipto', 'GEN 47:9', 1],
              [JOSE_D, 'Muere José · después viene la esclavitud', 'EXO 1:8', 1],
              [EXODO, 'El Éxodo', 'EXO 12:41', 2], [EXODO + 40, 'Cruzan el Jordán', 'JOS 4:19', 2],
              [TEMPLO, 'Salomón comienza el Templo', '1KI 6:1', 2], [SALOMON + 40, 'El reino se divide', '1KI 12:20', 2],
              [CAIDA, 'Cae Jerusalén · el exilio', '2KI 25:8', 2]]
for e in GEN_EVENTS: chk(e[2])
GEN_BANDS = [[JOSE_D, EXODO, 'esclavitud', 1, 2]]     # de la muerte de José al Éxodo: «hasta» N años
chk('GEN 11:26'); chk('ACT 7:4'); chk('GEN 12:4'); chk('GEN 5:24')

for e in ERAS:
    if e[5]: chk(e[5])
for _, _, r in PSHIST: chk(r)
for p in PSHIST: chk(f'PSA {p[0]}')
for p in PROPHETS: chk(p[2])
for g in LIVES:
    for _, _, r in g[1]: chk(r)
for f in FACTS:
    chk(f[1]); f[2] and chk(f[2])
ids = {e[0] for e in ERAS}
for b, v in BOOKS.items():
    assert b in BIB, b
    for x in (v if isinstance(v, list) else [[1, 999, v]]):
        assert x[2] is None or x[2] in ids, (b, x)
assert len(BOOKS) == 66, len(BOOKS)
out = {'src': 'Épocas y fechas aproximadas (c.); edades y reyes según el texto bíblico; títulos de los salmos.',
       'eras': ERAS, 'books': BOOKS, 'notes': NOTES, 'psalms': PSALMS, 'pshist': PSHIST,
       'prophets': PROPHETS, 'prophetNote': PROPHET_NOTE, 'noking': NOKING, 'reigns': REIGNS, 'lives': LIVES, 'facts': FACTS,
       'gen': {'people': GEN, 'events': GEN_EVENTS, 'bands': GEN_BANDS, 'egAlt': EG_ALT}}
json.dump(out, open(os.path.join(ROOT, 'data/linea-tiempo.json'), 'w'), ensure_ascii=False)
print('ok', len(BOOKS), 'libros')
