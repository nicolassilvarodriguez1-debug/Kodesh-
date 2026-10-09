#!/usr/bin/env python3
"""Glosas en inglés para el interlineal en modo inglés.

Fuente: STEPBible TAHOT (hebreo) y TAGNT (griego), «Translators Amalgamated», CC BY 4.0 — STEPBible.org.
Uso: python3 scripts/interlinear-en/build.py <carpeta «Translators Amalgamated OT+NT»>
Salida: data/interlinear-en/<LIBRO>.json = { "cap": { "vers": "forma|glosa\tforma|glosa…" } }
La forma es la palabra original sin vocales/acentos: el cliente empareja con las palabras del interlineal.
Versificación hebrea en el AT (la de la referencia entre paréntesis), como bible_source_words."""
import json, os, re, sys, unicodedata, glob

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'interlinear-en')
os.makedirs(OUT, exist_ok=True)

BOOKS = {'Gen':'GEN','Exo':'EXO','Lev':'LEV','Num':'NUM','Deu':'DEU','Jos':'JOS','Jdg':'JDG','Rut':'RUT','1Sa':'1SA','2Sa':'2SA',
 '1Ki':'1KI','2Ki':'2KI','1Ch':'1CH','2Ch':'2CH','Ezr':'EZR','Neh':'NEH','Est':'EST','Job':'JOB','Psa':'PSA','Pro':'PRO','Ecc':'ECC',
 'Sng':'SNG','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezk':'EZK','Dan':'DAN','Hos':'HOS','Jol':'JOL','Amo':'AMO','Oba':'OBA','Jon':'JON',
 'Mic':'MIC','Nam':'NAM','Hab':'HAB','Zep':'ZEP','Hag':'HAG','Zec':'ZEC','Mal':'MAL','Mat':'MAT','Mrk':'MRK','Luk':'LUK','Jhn':'JHN',
 'Act':'ACT','Rom':'ROM','1Co':'1CO','2Co':'2CO','Gal':'GAL','Eph':'EPH','Php':'PHP','Col':'COL','1Th':'1TH','2Th':'2TH','1Ti':'1TI',
 '2Ti':'2TI','Tit':'TIT','Phm':'PHM','Heb':'HEB','Jas':'JAS','1Pe':'1PE','2Pe':'2PE','1Jn':'1JN','2Jn':'2JN','3Jn':'3JN','Jud':'JUD','Rev':'REV'}
REF = re.compile(r'^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#\d+=')

def norm(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c)[0] == 'L')   # solo letras (sin vocales hebreas, acentos ni signos)
    s = s.lower().replace('ς', 'σ')
    return s.translate(str.maketrans('ךםןףץ', 'כמנפצ'))

NAMES = [(r'\bJesus\b', 'Yeshua'), (r'\bChrist\b', 'Messiah'), (r'\bYahweh\b', 'YHWH'), (r'\bLORD\b', 'YHWH'), (r'\bJehovah\b', 'YHWH')]
def clean(g):
    g = g.replace('<obj.>', '[obj.]').replace('<', '').replace('>', '')
    g = re.sub(r'\s*/\s*', ' ', g).replace('\\', ' ')
    for a, b in NAMES: g = re.sub(a, b, g)
    return re.sub(r'\s+', ' ', g).strip().replace('|', '/').replace('\t', ' ')

data = {}
for path in sorted(glob.glob(os.path.join(SRC, 'TAHOT*.txt')) + glob.glob(os.path.join(SRC, 'TAGNT*.txt'))):
    heb = os.path.basename(path).startswith('TAHOT')
    for line in open(path, encoding='utf-8'):
        m = REF.match(line)
        if not m: continue
        b = BOOKS.get(m.group(1))
        if not b: continue
        ch, v = (m.group(4), m.group(5)) if (heb and m.group(4)) else (m.group(2), m.group(3))
        col = line.rstrip('\n').split('\t')
        if heb: word, gloss = col[1], col[3]
        else: word, gloss = col[1].split(' (')[0], re.sub(r'[,.;:·]+$', '', col[2].strip())
        f, g = norm(word), clean(gloss)
        if not f or not g: continue
        data.setdefault(b, {}).setdefault(str(int(ch)), {}).setdefault(str(int(v)), []).append(f + '|' + g)

tot = 0
for b, chs in data.items():
    out = {c: {v: '\t'.join(ws) for v, ws in vs.items()} for c, vs in chs.items()}
    tot += sum(len(ws) for vs in chs.values() for ws in vs.values())
    with open(os.path.join(OUT, b + '.json'), 'w', encoding='utf-8') as fh: json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
print(len(data), 'libros ·', tot, 'palabras')
