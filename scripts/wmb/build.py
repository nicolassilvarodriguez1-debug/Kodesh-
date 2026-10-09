"""World Messianic Bible (dominio público) → biblia-wmb.json, mismo formato que biblia-rvr.json.
Fuente: corpus de eBible (BibleNLP/ebible, eng-engwmb.txt + vref.txt, texto limpio sin notas).
Ese corpus usa la numeración hebrea: los 136 versículos con numeración distinta (Mal 4, Éx 8:29-32…)
salen de wldeh/bible-api en-wmb (miss.json), quitando dos notas al pie que venían pegadas.
Como la RVR de la app, el Nombre se escribe YHWH (WMB: «the LORD», «Lord GOD»)."""
import json, os, re, collections
D = os.path.dirname(__file__); ROOT = os.path.join(D, '..', '..')
R = json.load(open(os.path.join(ROOT, 'biblia-rvr.json')))
import urllib.request
def fetch(u): return urllib.request.urlopen(u).read().decode('utf8')
BASE = 'https://raw.githubusercontent.com/BibleNLP/ebible/main/'
src = {}
for ref, t in zip(fetch(BASE + 'metadata/vref.txt').split('\n'), fetch(BASE + 'corpus/eng-engwmb.txt').split('\n')):
    if ref: src[ref] = t
miss = json.load(open(os.path.join(D, 'miss.json')))
miss['1KI 4:22'] = miss['1KI 4:22'].replace('cors4:22 1 cor is the same as a homer, or about 55.9 U. S. gallons (liquid) or 211 liters or 6 bushels of fine flour', 'cors of fine flour')
miss['NAM 1:15'] = miss['NAM 1:15'].replace('Behold,1:15 “Behold”, from “הִנֵּה”, means look at, take notice, observe, see, or gaze at. It is often used as an interjection. on', 'Behold, on')
def name(t):
    t = re.sub(r'\b[Tt]he LORD\b', 'YHWH', t)
    t = re.sub(r'\bLORD\b', 'YHWH', t)
    t = re.sub(r'\bGOD\b', 'YHWH', t)
    return t
out = collections.OrderedDict(); empty = []
for b in R:
    out[b] = collections.OrderedDict()
    for c in R[b]:
        out[b][c] = collections.OrderedDict()
        for v in R[b][c]:
            k = f'{b} {c}:{v}'
            t = miss[k] if k in miss else src.get(k, '')
            assert t is not None and not re.search(r'\d+:\d+ ', t or ''), k
            if not t.strip(): empty.append(k)
            out[b][c][v] = name(t.strip())
# Lc 17:36, Hch 8:37, 15:34 y 24:7 no están en el texto de la WMB: van entre corchetes con su propia nota
# («Some manuscripts add…»). Ro 16:25-27: la WMB lo pone en 14:24-26; aquí va donde lo tiene la RVR.
assert not empty, empty
json.dump(out, open(os.path.join(ROOT, 'biblia-wmb.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok', sum(len(c) for b in out.values() for c in b.values()), 'versículos')
