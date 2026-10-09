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
json.dump({'src': 'Mateo 1:1-16 y Lucas 3:23-38', 'ids': ids}, open(os.path.join(ROOT, 'data/linaje-yeshua.json'), 'w'), ensure_ascii=False)
print(len(ids)); print(', '.join(f"{P[k][0]}" for k in ids))
