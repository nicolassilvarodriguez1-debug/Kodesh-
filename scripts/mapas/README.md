# Datos de los mapas

- data/mapa-base.json: Natural Earth 10m (land, lakes, rivers), recortado a 8–52°E / 21–45°N y simplificado (dominio público).
- data/lugares.json: OpenBible.info Bible Geocoding Data (CC BY 4.0). places.py empareja cada lugar con su nombre en la RVR por similitud y voto entre versículos.
- data/viajes.json: rutas curadas a mano (viajes.py).

Para regenerar: clonar github.com/openbibleinfo/Bible-Geocoding-Data y ajustar las rutas de los scripts.

## Mapa real (desde el 8 oct 2026)
- vendor/maplibre/: MapLibre GL JS 5.24.0 (BSD-3), se carga solo al abrir un mapa.
- Satélite: Sentinel-2 cloudless 2016 de EOX (CC BY 4.0). Mapa: OpenFreeMap (datos © OpenStreetMap, ODbL). Relieve: Terrain Tiles en AWS (Mapzen).
- data/mapa-mundo.json: tierra del mundo (Natural Earth 10m simplificada a 0.12°) para que el globo se vea aunque no carguen las teselas.
- Si MapLibre o WebGL fallan, se usa el dibujo SVG anterior (data/mapa-base.json).
