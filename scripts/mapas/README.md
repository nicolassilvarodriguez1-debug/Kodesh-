# Datos de los mapas

- data/mapa-base.json: Natural Earth 10m (land, lakes, rivers), recortado a 8–52°E / 21–45°N y simplificado (dominio público).
- data/lugares.json: OpenBible.info Bible Geocoding Data (CC BY 4.0). places.py empareja cada lugar con su nombre en la RVR por similitud y voto entre versículos.
- data/viajes.json: rutas curadas a mano (viajes.py).

Para regenerar: clonar github.com/openbibleinfo/Bible-Geocoding-Data y ajustar las rutas de los scripts.
