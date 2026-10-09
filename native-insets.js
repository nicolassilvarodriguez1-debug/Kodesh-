// KODESH — Margen superior en la app de iOS.
// En iOS la app usa contentInset "always": el sistema ya deja el espacio de la
// barra de estado / Dynamic Island fuera de la página. Desde Capacitor 8, el
// plugin SystemBars (insetsHandling: "css") también inyecta
// --safe-area-inset-top en iOS, así que el espacio se sumaba dos veces y
// quedaba una franja vacía sobre la barra superior. En iOS nativo lo dejamos
// en 0 (Android sí lo necesita: su webview va de borde a borde).
(function () {
  try {
    var cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
    if ((cap.getPlatform && cap.getPlatform()) !== 'ios') return;
    var st = document.createElement('style');
    st.id = 'kodesh-ios-insets';
    // Las capas fijas a pantalla completa (inicio, fiestas, luna…) sí empiezan debajo de la barra de estado:
    // usan max(env(), --ios-top-min) para que sus botones nunca queden bajo la hora / Dynamic Island.
    st.textContent = 'html{--safe-area-inset-top:0px !important;--ios-top-min:50px;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}
})();
