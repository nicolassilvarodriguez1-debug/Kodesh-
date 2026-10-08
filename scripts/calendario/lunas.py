# KODESH — Calendario bíblico observado (estilo caraíta).
# Calcula, para cada luna nueva, la primera tarde en que el creciente se ve a
# simple vista desde Jerusalén (criterio de Odeh 2006, V >= 5.65, a la «mejor
# hora» = puesta del sol + 4/9 del retraso lunar) y propone el mes de Aviv
# (Nisán) de cada año. Uso: python3 scripts/calendario/lunas.py
# Requiere: pip install ephem
import ephem, json, math, pathlib, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parents[2]
LAT, LON, ELEV = '31.778', '35.235', 754
Y0, Y1 = 2024, 2046

def obs(date):
    o = ephem.Observer(); o.lat, o.lon, o.elevation = LAT, LON, ELEV
    o.pressure = 0; o.horizon = '-0:34'; o.date = date
    return o

def odeh(day):
    """V de Odeh la tarde del día civil `day` (fecha de Jerusalén) o None si la luna se pone antes."""
    # mediodía local ~ 09:40 UTC
    o = obs(ephem.Date(dt.datetime(day.year, day.month, day.day, 9, 40)))
    sun, moon = ephem.Sun(), ephem.Moon()
    ss = o.next_setting(sun)
    o.date = ss
    try: ms = o.next_setting(moon)
    except Exception: return None
    lag = (ms - ss)
    if lag <= 0 or lag > 0.25: return None
    tb = ephem.Date(ss + lag * 4 / 9)
    o.date = tb; o.horizon = '0'
    sun.compute(o); moon.compute(o)
    arcv = math.degrees(moon.alt - sun.alt)
    arcl = math.degrees(ephem.separation(moon, sun))
    sd = math.degrees(moon.radius) * 60          # semidiámetro topocéntrico (minutos de arco)
    w = sd * (1 - math.cos(math.radians(arcl)))   # ancho del creciente
    v = arcv - (7.1651 - 6.3226 * w + 0.7319 * w ** 2 - 0.1018 * w ** 3)
    return round(v, 2), round(arcl, 1)

months = []
d = ephem.Date(f'{Y0}/1/1')
while True:
    nm = ephem.next_new_moon(d)
    if nm.datetime().year > Y1: break
    base = (nm.datetime() + dt.timedelta(hours=2)).date()     # fecha civil en Jerusalén
    prev = None
    for k in range(0, 4):
        day = base + dt.timedelta(days=k)
        r = odeh(day)
        if r and r[0] >= 5.65:
            # p = 1 si la tarde anterior ya era posible en condiciones perfectas (2 <= V < 5.65)
            months.append({'e': day.isoformat(), 'v': r[0], 'p': 1 if prev and prev[0] >= 2 else 0})
            break
        prev = r
    d = ephem.Date(nm + 1)

# Aviv (estimación): Nisán es el primer mes cuyo día 15 cae en o después del
# equinoccio de primavera. Se confirma cada año con la cebada en Israel.
def day_n(e, n): return dt.date.fromisoformat(e) + dt.timedelta(days=n)
nisan = {}
for y in range(Y0, Y1 + 1):
    eq = ephem.next_equinox(f'{y}/3/1').datetime().date()
    for m in months:
        if day_n(m['e'], 15) >= eq and m['e'][:4] == str(y):
            nisan[str(y)] = m['e']; break
out = {'src': 'Odeh (2006), Jerusalén, V>=5.65; Aviv estimado por el equinoccio', 'months': [[m['e'], m['p']] for m in months], 'nisan': nisan}
(ROOT / 'data' / 'calendario-biblico.json').write_text(json.dumps(out, separators=(',', ':')))
print(len(months), 'meses ·', nisan.get('2026'), nisan.get('2027'))
