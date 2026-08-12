// KODESH — Versión mínima obligatoria de la app nativa (iOS/Android).
//
// La app llama a este endpoint al abrir. Si la versión instalada es menor
// a MIN_VERSION, se bloquea el uso con un modal no-descartable que manda
// directo a la tienda a actualizar.
//
// Para forzar una actualización: sube MIN_VERSION al número de versión
// (capacitor.config.json / Info.plist) del build que acabas de publicar
// en App Store Connect, haz commit y push — no requiere un nuevo build
// nativo, el cambio aplica apenas Vercel despliega.
const MIN_VERSION = '1.0.2';

// Última versión disponible (informativa — no bloquea, solo se puede usar
// para mostrar "hay una versión nueva, opcional" en el futuro si se quiere).
const LATEST_VERSION = '1.0.2';

const APP_STORE_URL = 'https://apps.apple.com/app/kodesh-bible/id6781083106';
// Actualiza esto cuando publiquen en Google Play.
const PLAY_STORE_URL = 'https://apps.apple.com/app/kodesh-bible/id6781083106';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    minVersion: MIN_VERSION,
    latestVersion: LATEST_VERSION,
    storeUrl: {
      ios: APP_STORE_URL,
      android: PLAY_STORE_URL,
    },
  });
}
