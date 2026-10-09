"""Busca frases armadas en código que mezclan texto en español con valores (${…}) en el MISMO nodo de texto:
el diccionario no puede traducirlas y hay que pasarlas por KodeshI18n.t('… {x} …', { x }).
Uso: python3 scripts/i18n-lint.py archivo.js [...]"""
import re, sys
ES = re.compile(r'(^|[^\wáéíóúñ])(de|del|la|las|los|el|que|para|con|una|por|sin|más|tu|tus|su|sus|en|y|a|al|hoy|hace|días|día|años|año|semana|semanas|mes|meses|capítulo|capítulos|versículo|versículos|leídos|leído|estudiadas|porciones|entradas|actividades|marcadores|notas|minutos|horas|consulta|consultas|tienes|quedan|faltan|Comienza|Termina|Faltan|Unos|Cap\.|Salmo)(?=$|[^\wáéíóúñ])|[áéíóúñ¿¡]', re.I)
for f in sys.argv[1:]:
    src = open(f).read()
    for m in re.finditer(r'`((?:[^`\\]|\\.)*)`', src):
        body = m.group(1)
        if '${' not in body: continue
        # partes literales entre ${…}, sin etiquetas HTML ni atributos
        lits = re.split(r'\$\{(?:[^{}]|\{[^{}]*\})*\}', body)
        for i, lit in enumerate(lits):
            txt = re.sub(r'<[^>]*>', '\n', lit)
            for seg in txt.split('\n'):
                seg2 = seg.strip()
                if not seg2 or not ES.search(seg2): continue
                # sólo si el segmento comparte nodo con un ${…} (está pegado a uno de los lados)
                touches = (i > 0 and not re.match(r'\s*<', lit)) or (i < len(lits) - 1 and not re.search(r'>\s*$', lit))
                if touches and seg is (txt.split('\n')[0] if i > 0 else seg) or (touches and seg is txt.split('\n')[-1]):
                    line = src.count('\n', 0, m.start()) + 1
                    print(f'{f}:{line}: «{seg2[:90]}»')
