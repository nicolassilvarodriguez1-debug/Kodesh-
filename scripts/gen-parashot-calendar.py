#!/usr/bin/env python3
"""Genera parashot-calendar.json: { "YYYY-MM-DD": [num, ...] }.

- Una entrada por cada Shabat con lectura de parashá (dos números = porción
  combinada) y una por Simjat Torá con Vezot HaBerajá (54), que nunca cae
  en Shabat.
- Calendario de la DIÁSPORA (Florida). Para Israel: ISRAEL = True.
- Uso:  pip install pyluach && python3 scripts/gen-parashot-calendar.py
"""
import json, os
from datetime import date, timedelta
from pyluach import dates, parshios

ISRAEL = False
START, END = date(2025, 1, 1), date(2056, 12, 31)
OUT = os.path.join(os.path.dirname(__file__), '..', 'parashot-calendar.json')

cal = {}
d = START + timedelta(days=(5 - START.weekday()) % 7)  # primer sábado
while d <= END:
    p = parshios.getparsha(dates.GregorianDate(d.year, d.month, d.day), israel=ISRAEL)
    if p:
        cal[d.isoformat()] = [i + 1 for i in p]   # pyluach es 0-based; el JSON usa 1..54
    d += timedelta(days=7)

# Vezot HaBerajá: Simjat Torá = 23 Tishrei en la diáspora (22 en Israel).
for hy in range(START.year + 3760, END.year + 3762):
    g = dates.HebrewDate(hy, 7, 22 if ISRAEL else 23).to_pydate()
    if START <= g <= END:
        cal[g.isoformat()] = [54]

cal = dict(sorted(cal.items()))
with open(OUT, 'w') as f:
    json.dump(cal, f, separators=(',', ':'))
print(f'{len(cal)} entradas, {min(cal)} → {max(cal)}')
