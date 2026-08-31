// KODESH — Recoge la sesion que vuelve del login social en la app nativa.
//
// El flujo: login.html manda a Supabase el redirectTo
// "com.iglesiafreedom.kodesh://index". Al terminar en Google, Supabase
// redirige a ese esquema y Android reabre la app con esa URL.
//
// Hay que cubrir DOS casos, y ahi estaba el error de la primera version:
//
//   1. App viva  -> Android entrega la URL por el evento appUrlOpen y la
//      webview conserva la pagina que estaba abierta (login.html).
//
//   2. App muerta -> Android recrea la actividad. La webview arranca de cero
//      en index.html, NO en login.html, y appUrlOpen puede no dispararse
//      nunca porque el listener se registra despues de que el evento paso.
//      Para ese caso hay que preguntar por la URL de lanzamiento con
//      getLaunchUrl(). Sin esto, la sesion viaja en el enlace pero nadie la
//      recoge: index.html no ve sesion y te devuelve al login.
//
// Por eso este archivo se carga en las dos paginas.
//
// El flujo configurado es "implicit", asi que los tokens llegan en el
// fragmento (#access_token=...&refresh_token=...), no como ?code=.
(function () {
  var SCHEME = 'com.iglesiafreedom.kodesh://';
  var yaProcesado = false;

  function parseTokens(url) {
    var i = url.indexOf('#');
    if (i === -1) return null;
    var p = new URLSearchParams(url.slice(i + 1));
    return {
      access_token: p.get('access_token'),
      refresh_token: p.get('refresh_token'),
      error: p.get('error_description') || p.get('error'),
    };
  }

  async function procesar(url, getClient, opts) {
    if (!url || url.indexOf(SCHEME) !== 0) return false;
    if (yaProcesado) return false; // appUrlOpen y getLaunchUrl pueden traer la misma URL
    yaProcesado = true;

    var datos = parseTokens(url);
    try {
      if (!datos) return false;
      if (datos.error) {
        console.warn('[OAuth] El proveedor devolvio un error:', datos.error);
        if (opts && opts.onError) opts.onError(datos.error);
        return false;
      }
      if (!datos.access_token || !datos.refresh_token) return false;

      var client = getClient();
      if (!client) {
        console.warn('[OAuth] No hay cliente de Supabase todavia.');
        return false;
      }

      var res = await client.auth.setSession({
        access_token: datos.access_token,
        refresh_token: datos.refresh_token,
      });
      if (res.error) throw res.error;

      console.log('[OAuth] Sesion establecida desde el deep link.');
      if (opts && opts.onSuccess) opts.onSuccess();
      return true;
    } catch (e) {
      console.error('[OAuth] No se pudo establecer la sesion:', e);
      yaProcesado = false; // permitir reintento
      if (opts && opts.onError) opts.onError(e.message || String(e));
      return false;
    } finally {
      // Cerrar el navegador in-app pase lo que pase, para no dejar al usuario
      // mirando una pantalla en blanco.
      try {
        var B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
        if (B && B.close) await B.close();
      } catch (_) {}
    }
  }

  window.initOAuthDeepLink = function (getClient, opts) {
    var C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

    var App = C.Plugins && C.Plugins.App;
    if (!App) {
      console.warn('[OAuth] Plugin App no disponible — el retorno del login social no se podra procesar.');
      return;
    }

    // Caso 1: la app seguia viva.
    if (App.addListener) {
      App.addListener('appUrlOpen', function (data) {
        procesar(data && data.url, getClient, opts);
      });
    }

    // Caso 2: la app arranco por el propio deep link.
    if (App.getLaunchUrl) {
      App.getLaunchUrl()
        .then(function (r) {
          if (r && r.url) return procesar(r.url, getClient, opts);
        })
        .catch(function (e) { console.warn('[OAuth] getLaunchUrl fallo:', e && e.message); });
    }
  };
})();
