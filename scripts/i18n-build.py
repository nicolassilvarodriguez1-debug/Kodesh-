"""Une las traducciones de data/i18n/*.en.json en i18n-en-data.js (lo carga i18n.js solo en inglés).
Avisa si un mismo texto tiene traducciones distintas en dos módulos."""
import json, os, glob
ROOT = os.path.join(os.path.dirname(__file__), '..')
out, src = {}, {}
for f in sorted(glob.glob(os.path.join(ROOT, 'data/i18n/*.en.json'))):
    mod = os.path.basename(f).split('.')[0]
    for k, v in json.load(open(f)).items():
        if v == '__skip__' or not isinstance(v, str): continue
        if k in out and out[k] != v: print(f'⚠ {mod}: «{k[:60]}» ya estaba en {src[k]} con otra traducción')
        else: out[k] = v; src[k] = mod
js = ('/* Generado por scripts/i18n-build.py — no editar a mano: corrige data/i18n/<módulo>.en.json */\n'
      '(function () { const I = window.KodeshI18n; if (!I || !I.isEn) return;\nI.add(' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ');\n})();\n')
open(os.path.join(ROOT, 'i18n-en-data.js'), 'w').write(js)
print(len(out), 'textos ·', len(js) // 1024, 'KB')
