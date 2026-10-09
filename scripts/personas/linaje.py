"""Linaje de Yeshua: personas nombradas en las genealogías de Mateo 1:1-16 y
Lucas 3:23-38 (data/personas/MAT.json y LUK.json, por versículo), menos los
que el texto menciona sin ser ascendientes (Zara, hermano de Fares; Urías).
Salida: data/linaje-yeshua.json  → {"ids": [...]}"""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = json.load(open(os.path.join(ROOT, 'data/personas.json')))['p']
mat = json.load(open(os.path.join(ROOT, 'data/personas/MAT.json')))
luk = json.load(open(os.path.join(ROOT, 'data/personas/LUK.json')))
ids = []
for v, pid, _ in mat.get('1', []):
    if 1 <= v <= 16 and pid not in ids: ids.append(pid)
for v, pid, _ in luk.get('3', []):
    if 23 <= v <= 38 and pid not in ids: ids.append(pid)
# El índice por versículo no los marcó en esas genealogías (nombres con otra grafía)
EXTRA = ['judah_1751', 'terah_2841', 'peleg_2308', 'reu_2428', 'salah_2455', 'cainan_535', 'cainan_534', 'mahalaleel_1885', 'joseph_1715', 'mary_1938']
for k in EXTRA:
    if k in P and k not in ids: ids.append(k)
EXCL = {'zerah_2984'} | {k for k in ids if P[k][3] == 'Uriah'}
ids = [k for k in ids if k not in EXCL and k in P]
# Personas del linaje que faltan en Theographic (se agregan con su referencia bíblica)
ADD = {
    'x_isai': ['Isaí', 'M', 0, 'Jesse', ['RUT:4', '1SA:16', '1SA:17', '1SA:20', '1SA:22', '2SA:20', '1KI:12', '1CH:2', '1CH:10', '1CH:29', '2CH:10', 'PSA:72', 'ISA:11', 'MAT:1', 'LUK:3', 'ACT:13', 'ROM:15']],
    'x_ocozias': ['Ocozías', 'M', 0, 'Ahaziah', ['2KI:8', '2KI:9', '2KI:10', '2KI:11', '2CH:22']],
    'x_nagai': ['Nagai', 'M', 0, 'Naggai', ['LUK:3']],
    'x_neri': ['Neri', 'M', 0, 'Neri', ['LUK:3']],
    'x_levi': ['Leví', 'M', 0, 'Levi', ['LUK:3']],
    'x_mainan': ['Mainán', 'M', 0, 'Menna', ['LUK:3']],
    'x_yeshua': ['Yeshua (Jesús)', 'M', 0, 'Jesus', ['MAT:1', 'MAT:2', 'MAT:13', 'LUK:1', 'LUK:2', 'LUK:3', 'JHN:1']],
}
# Eslabones que faltan (hijo, 'pa'|'ma', padre/madre): Mt 1 y Lc 3; Ocozías y Joás según 2 R 8–11
LINKS = [
    ['x_isai', 'pa', 'obed_2228'], ['david_994', 'pa', 'x_isai'],
    ['x_ocozias', 'pa', 'jehoram_803'], ['joash_1632', 'pa', 'x_ocozias'],
    ['zerubbabel_3054', 'pa', 'shealtiel_2456'],
    ['x_nagai', 'pa', 'maath_1871'], ['esli_1221', 'pa', 'x_nagai'],
    ['x_neri', 'pa', 'melchi_1988'], ['salathiel_2457', 'pa', 'x_neri'],
    ['x_levi', 'pa', 'simeon_2743'], ['matthat_1970', 'pa', 'x_levi'],
    ['x_mainan', 'pa', 'mattatha_1961'], ['melea_1992', 'pa', 'x_mainan'],
    ['x_yeshua', 'pa', 'joseph_1715'], ['x_yeshua', 'ma', 'mary_1938'],
]
HE = {'x_yeshua': ['james_719', 'joses_1721', 'simon_2747', 'jude_1756']}   # Mt 13:55
for k in list(ADD) + ['jehoiakim_1085', 'jehoiachin_791', 'amaziah_214', 'joash_1632']:
    if k not in ids: ids.append(k)
json.dump({'src': 'Mateo 1:1-16 y Lucas 3:23-38', 'ids': ids, 'add': ADD, 'links': LINKS, 'he': HE}, open(os.path.join(ROOT, 'data/linaje-yeshua.json'), 'w'), ensure_ascii=False)
print(len(ids))
