# Genera palabras-yeshua.json a partir de la KJV en OSIS (dominio público), que marca
# las palabras de Jesús con <q who="Jesus">. Uso:
#   curl -sSLO https://raw.githubusercontent.com/seven1m/open-bibles/master/eng-kjv.osis.xml
#   python3 scripts/build-palabras-yeshua.py eng-kjv.osis.xml palabras-yeshua.json
# Formato: {LIBRO:{cap:{vers: 1 (todo el versículo) | [[inicio,fin],...] (fracciones del texto)}}}
# index.html convierte las fracciones en posiciones del texto en español, ajustándolas
# a los signos de puntuación (sobre todo los dos puntos que abren lo que dice).
import re, json, sys
src = open(sys.argv[1], encoding='utf8').read()
NT = {'Matt':'MAT','Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','1Cor':'1CO','2Cor':'2CO','Rev':'REV'}
tok = re.compile(r'<[^>]+>|[^<]+')
cur = None; jesus = set(); skip = 0
verses = {}  # key -> list of (text, isJ)
for m in tok.finditer(src):
    t = m.group(0)
    if t.startswith('<'):
        if t.startswith('<note') and not t.endswith('/>'): skip += 1; continue
        if t.startswith('</note'): skip -= 1; continue
        if t.startswith('<title') and not t.endswith('/>'): skip += 1; continue
        if t.startswith('</title'): skip -= 1; continue
        mv = re.match(r'<verse[^>]*osisID="([^"]+)"[^>]*sID=', t)
        if mv:
            b, c, v = mv.group(1).split(' ')[0].split('.')
            cur = (NT.get(b), c, v) if b in NT else None
            continue
        if t.startswith('<verse') and 'eID=' in t: cur = None; continue
        mq = re.match(r'<q[^>]*who="Jesus"[^>]*sID="([^"]+)"', t)
        if mq: jesus.add(mq.group(1)); continue
        me = re.match(r'<q[^>]*eID="([^"]+)"', t)
        if me: jesus.discard(me.group(1)); continue
        continue
    if skip or not cur: continue
    verses.setdefault(cur, []).append((t, bool(jesus)))
out = {}
for (b, c, v), parts in verses.items():
    txt = ''.join(p for p, _ in parts)
    # normalizar espacios manteniendo marcas
    chars = []
    for p, j in parts:
        for ch in p: chars.append((ch, j))
    s = ''.join(ch for ch, _ in chars)
    lead = len(s) - len(s.lstrip()); s2 = s.strip()
    flags = [j for _, j in chars][lead:lead + len(s2)]
    if not any(flags): continue
    letters = [i for i, ch in enumerate(s2) if ch.isalnum()]
    jl = [i for i in letters if flags[i]]
    if len(jl) >= len(letters) - 0: out.setdefault(b, {}).setdefault(c, {})[v] = 1; continue
    # segmentos como fracción del texto
    segs = []; st = None
    for i, f in enumerate(flags + [False]):
        if f and st is None: st = i
        if not f and st is not None:
            seg = s2[st:i]
            if sum(ch.isalnum() for ch in seg) >= 2: segs.append([round(st / len(s2), 3), round(i / len(s2), 3)])
            st = None
    if segs: out.setdefault(b, {}).setdefault(c, {})[v] = segs
n = sum(len(vv) for cc in out.values() for vv in cc.values())
full = sum(1 for cc in out.values() for vv in cc.values() for x in vv.values() if x == 1)
print('verses', n, 'full', full, file=sys.stderr)
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'), ensure_ascii=False)
