"""Extrae los textos en español de un módulo (código y datos) para traducirlos.
Uso: python3 scripts/i18n-extract.py <módulo> → data/i18n/<módulo>.todo.json (lista de textos sin traducir aún)
Los módulos y sus archivos están en MODULES. Ya traducidos: data/i18n/<módulo>.en.json ({español: inglés})."""
import json, os, re, sys, html
ROOT = os.path.join(os.path.dirname(__file__), '..')
MODULES = {
  'tiempo': (['tiempo.js'], ['data/linea-tiempo.json']),
  'moedim': (['moedim.js', 'feasts.js', 'calendario.js', 'luna.js'], ['data/fiestas.json', 'data/calendario-biblico.json']),
  'parashot': (['parashot.html', 'parasha-banner.js', 'parasha-badges.js'], ['parashot-data.json']),
  'people': (['people.js'], ['data/personas.json', 'data/linaje-yeshua.json']),
  'maps': (['maps.js'], ['data/lugares.json', 'data/viajes.json']),
  'harmony': (['parallels.js', 'bible-links.js'], ['data/paralelos.json']),
  'profile': (['profile.html'], []),
  'ayuda': (['ayuda.html', 'onboarding.html'], []),
  'estudio': (['estudio.html', 'estudio.js', 'group-questions.js'], []),
  'lexicon': (['lexicon.html'], []),
  'actividades': (['actividades.html'], []),
  'verseday': (['verse-day.js', 'verse-image.js'], []),
}
ES = re.compile(r'[áéíóúñ¿¡]|\b(de|la|el|los|las|que|para|con|una|por|tu|tus|sin|más|del|al|es|en|un|se|no|ya|lo|su|sus|este|esta|aquí|toca|ver|leer|cerrar|guardar|buscar|abrir|y|o|a|años|año|día|días|hoy|cuando|desde|hasta)\b', re.I)
def ok(t):
    t = t.strip()
    if len(t) < 2 or not re.search(r'[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}', t): return False
    if re.search(r'^[\w./-]+\.(js|json|html|png|svg|css|webp|mp3)$', t) or re.search(r'[{}<>=]|=>|\(\)|\$\{', t): return False
    if re.fullmatch(r'[A-Z0-9_ :.-]+', t) and not ES.search(t): return False
    return bool(ES.search(t))
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
    todo = [t for t in out if t not in done]
    os.makedirs(os.path.join(ROOT, 'data/i18n'), exist_ok=True)
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, f'data/i18n/{mod}.todo.json')
    json.dump(todo, open(dst, 'w'), ensure_ascii=False, indent=0)
    print(mod, len(out), 'textos ·', len(todo), 'por traducir ·', sum(len(t) for t in todo), 'caracteres')
