// KODESH — Versión mínima obligatoria de la app nativa (iOS/Android).
//
// La app llama a este endpoint al abrir. Si la versión instalada es menor a
// la mínima DE SU PLATAFORMA, se bloquea el uso con un modal no-descartable
// que manda directo a la tienda correcta de esa plataforma.
//
// Para forzar una actualización: sube el número de la plataforma que acabas
// de publicar (iOS en App Store Connect, Android en Play Console), haz commit
// y push — no requiere un nuevo build nativo, aplica apenas Vercel despliega.
//
// ⚠️ iOS y Android se versionan por separado. Nunca subas el mínimo de una
// plataforma apoyándote en un build que solo publicaste en la otra: dejarías
// a esos usuarios atrapados en un modal que los manda a una tienda donde no
// pueden actualizar.

const MIN_VERSIONS = {
  ios:     '1.0.4',
  android: '1.0.4',
};

// Última versión disponible (informativa — no bloquea).
const LATEST_VERSIONS = {
  ios:     '1.0.4',
  android: '1.0.4',
};

const STORE_URLS = {
  ios:     'https://apps.apple.com/app/kodesh-bible/id6781083106',
  android: 'https://play.google.com/store/apps/details?id=com.iglesiafreedom.kodesh',
};

// Las apps ya instaladas no mandan ?platform= y leen `minVersion` como string
// suelto. Para ellas deducimos la plataforma del User-Agent del WebView, que
// en Capacitor siempre trae "Android" o "iPhone"/"iPad". Así el mínimo que
// reciben ya es el suyo, sin necesidad de un build nuevo.
function detectPlatform(req) {
  const q = String(req.query?.platform || '').toLowerCase();
  if (q === 'ios' || q === 'android') return q;

  const ua = String(req.headers['user-agent'] || '');
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'ios';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const platform = detectPlatform(req);

  return res.status(200).json({
    // Resueltos para la plataforma que llama — lo que leen las apps antiguas.
    platform,
    minVersion:    MIN_VERSIONS[platform],
    latestVersion: LATEST_VERSIONS[platform],

    // Mapas completos — lo que leen las apps nuevas.
    minVersions:    MIN_VERSIONS,
    latestVersions: LATEST_VERSIONS,
    storeUrl:       STORE_URLS,
  });
}
