"""Extrae los textos en español de un módulo (código y datos) para traducirlos.
Uso: python3 scripts/i18n-extract.py <módulo> → data/i18n/<módulo>.todo.json (lista de textos sin traducir aún)
Los módulos y sus archivos están en MODULES. Ya traducidos: data/i18n/<módulo>.en.json ({español: inglés})."""
import json, os, re, sys, html
ROOT = os.path.join(os.path.dirname(__file__), '..')
MODULES = {
  'core': (['index.html', 'home.js', 'account-gate.js', 'auth.js', 'login.html', 'last-position.js', 'book-mode.js', 'swipe-chapters.js', 'native-insets.js', 'oauth-deeplink.js'], []),
  'tiempo': (['tiempo.js'], ['data/linea-tiempo.json']),
  'moedim': (['moedim.js', 'feasts.js', 'calendario.js', 'luna.js'], ['data/fiestas.json', 'data/calendario-biblico.json']),
  'parashot': (['parashot.html', 'parasha-banner.js', 'parasha-badges.js'], ['parashot-data.json']),
  'people': (['people.js'], ['data/linaje-yeshua.json']),          # nombres: inglés de personas.json (p[3])
  'maps': (['maps.js'], ['data/viajes.json']),                    # nombres de lugar: data/i18n/places.en.json (OpenBible)
  'harmony': (['parallels.js', 'bible-links.js'], ['data/paralelos.json']),
  'profile': (['profile.html'], []),
  'ayuda': (['ayuda.html', 'onboarding.html'], []),
  'estudio': (['estudio.html', 'estudio.js', 'group-questions.js'], []),
  'lexicon': (['lexicon.html'], []),
  'actividades': (['actividades.html'], []),
  'verseday': (['verse-day.js', 'verse-image.js'], []),
}
ES = re.compile(r'[áéíóúñ¿¡]|\b(de|la|el|los|las|que|para|con|una|por|tu|tus|sin|más|del|al|es|en|un|se|no|ya|lo|su|sus|este|esta|aquí|toca|ver|leer|cerrar|guardar|buscar|abrir|y|o|a|años|año|día|días|hoy|cuando|desde|hasta)\b', re.I)
TECH = re.compile(r'^(https?:|data:|mailto:|#[0-9a-f]{3,8}$|[.#\[]|--|@|\d+(px|em|rem|vh|vw|ms|s|%)\b)|^[a-z]+(-[a-z0-9]+)+$|^[a-z]+[A-Z]\w*$|^\w+_\w+$|^[\w./-]+\.(js|json|html|png|svg|css|webp|mp3|jpg)$|^(GET|POST|PUT|DELETE|PATCH)$|^[A-Z][A-Z0-9_]{1,}_[A-Z0-9_]+$')
CODEY = re.compile(r'[{}<>=]|=>|\(\)|\$\{|;\s*\w+\s*:|^\w+\(|\)\s*\.')
EN = re.compile(r'\b(the|and|of|to|is|was|with|through|from|that|he|his|she|her|it|you|your|this|for|by|as|be|not|are|were|which|who|than|their|they|will|would|could|other|line|son|blood|heir|throne|month|day|days|week|years|Terrain|Relieve)\b|^[A-Z][a-z]+( \d+([:.]\d+)?([–-]\d+)?)?$', re.I)
def ok(t, data=False):
    t = t.strip()
    if EN.search(t) and not ES.search(t) and not re.search(r'[áéíóúñ¿¡]', t): return False   # ya en inglés
    if len(t) < 2 or not re.search(r'[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}', t): return False
    if TECH.search(t) or CODEY.search(t): return False
    if re.fullmatch(r'[1-3]?[A-Z]{2,3}[ :]\d+([:.,\-–]\d+)*', t): return False          # GEN 5:3
    if data and re.fullmatch(r'[a-z0-9_-]+', t): return False                          # ids en datos
    if re.fullmatch(r'[a-z]+', t) and not ES.search(t) and not re.search(r'[áéíóúñ]', t) and len(t) <= 3: return False
    return True
def norm(t): return html.unescape(re.sub(r'\s+', ' ', t)).strip()
def from_code(path, out):
    s = open(os.path.join(ROOT, path)).read()
    s = re.sub(r'/\*[\s\S]*?\*/', '', s); s = re.sub(r'(?m)^\s*//.*$', '', s); s = re.sub(r'<!--[\s\S]*?-->', '', s)
    s = re.sub(r'(?s)<style[^>]*>.*?</style>', '', s)
    for m in re.finditer(r'>([^<>]{2,})<', s): out.add(norm(m.group(1)))
    for m in re.finditer(r'(?:placeholder|title|aria-label|alt|content)="([^"]{2,})"', s): out.add(norm(m.group(1)))
    for m in re.finditer(r"'((?:[^'\\\n]|\\.){2,})'|\"((?:[^\"\\\n]|\\.){2,})\"|`([^`]{2,})`", s):
        t = m.group(1) or m.group(2) or m.group(3) or ''
        for part in re.split(r'\$\{[^}]*\}|<[^>]*>', t): out.add(norm(part.replace("\\'", "'")))
    # 2.ª pasada: comillas simples y dobles también dentro de ${…} (ternarios en plantillas)
    # (cada tipo de comilla por separado: si no, una cadena "…" se traga las '…' que lleva dentro)
    for rx in (r"'((?:[^'\\\n`]|\\.){2,})'", r'"((?:[^"\\\n`]|\\.){2,})"'):
        for m in re.finditer(rx, s):
            for part in re.split(r'<[^>]*>', m.group(1)): out.add(norm(part.replace("\\'", "'")))
def from_data(path, out):
    def walk(x):
        if isinstance(x, str): out.add(norm(x))
        elif isinstance(x, list): [walk(y) for y in x]
        elif isinstance(x, dict): [walk(y) for y in x.values()]
    walk(json.load(open(os.path.join(ROOT, path))))
if __name__ == '__main__':
    mod = sys.argv[1]; code, data = MODULES[mod]
    out = set()
    for f in code: from_code(f, out)
    for f in data: from_data(f, out)
    out = sorted(t for t in out if ok(t))
    done = {}
    p = os.path.join(ROOT, f'data/i18n/{mod}.en.json')
    if os.path.exists(p): done = json.load(open(p))
    # lo que ya traduce i18n-en.js (o cualquier otro módulo) cuenta como hecho
    import subprocess, glob
    for f in glob.glob(os.path.join(ROOT, 'data/i18n/*.en.json')): done.update({k: 1 for k in json.load(open(f))})
    js = "global.window={};global.document={documentElement:{lang:'',classList:{add(){}},appendChild(){}},head:{appendChild(){}},readyState:'complete',createElement:()=>({}),write(){},addEventListener(){},createTreeWalker(){}};global.localStorage={getItem:()=>'en',length:0,key(){}};global.navigator={language:'en'};global.MutationObserver=class{observe(){}};global.NodeFilter={};const fs=require('fs');eval(fs.readFileSync('i18n.js','utf8'));eval(fs.readFileSync('i18n-en.js','utf8'));const I=window.KodeshI18n;const t=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(t.filter(x=>I.tr(x)!=null)))"
    hit = json.loads(subprocess.run(['node', '-e', js], input=json.dumps(out), capture_output=True, text=True, cwd=ROOT).stdout or '[]')
    done.update({k: 1 for k in hit})
    todo = [t for t in out if t not in done]
    os.makedirs(os.path.join(ROOT, 'data/i18n'), exist_ok=True)
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, f'data/i18n/{mod}.todo.json')
    json.dump(todo, open(dst, 'w'), ensure_ascii=False, indent=0)
    print(mod, len(out), 'textos ·', len(todo), 'por traducir ·', sum(len(t) for t in todo), 'caracteres')
