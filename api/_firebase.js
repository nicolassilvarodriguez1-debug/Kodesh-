// KODESH — Firebase Admin SDK singleton, para mandar push notifications
// (FCM) desde el backend.
//
// Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON en Vercel:
// el contenido COMPLETO del JSON de la cuenta de servicio (Firebase Console
// > Configuración del proyecto > Cuentas de servicio > Generar nueva clave
// privada), pegado tal cual como valor de la variable.
//
// Reutiliza la misma app entre invocaciones "calientes" de la función
// (getApps().length) para no reinicializar en cada request.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let cachedApp = null;

function getFirebaseApp() {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no configurada');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no es JSON válido: ' + e.message);
  }

  cachedApp = initializeApp({ credential: cert(serviceAccount) });
  return cachedApp;
}

export function getFcm() {
  return getMessaging(getFirebaseApp());
}
