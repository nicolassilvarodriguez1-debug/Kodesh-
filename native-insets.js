// KODESH — Margen superior en la app de iOS.
// Hasta la 2.2 la app de iOS usaba contentInset "always": el sistema dejaba el espacio de la barra de estado /
// Dynamic Island fuera de la página, y aquí se ponía --safe-area-inset-top a 0 (si no, se sumaba dos veces).
// Pero con "always", en iOS 26 los toques llegan corridos hacia abajo justo ese alto (~47 px): se iluminaba el
// botón de abajo del tocado y el lienzo dibujaba más abajo. Desde la 2.3 se usa contentInset "never" (página de
// borde a borde, como Android) y los márgenes los ponen --safe-area-inset-* / env(). Este archivo solo actúa si la
// página NO llega al borde superior (una compilación vieja con "always").
(function () {
  try {
    var cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
    if ((cap.getPlatform && cap.getPlatform()) !== 'ios') return;
    var tall = Math.max(screen.height, screen.width), wide = Math.min(screen.height, screen.width);
    var portrait = window.innerHeight >= window.innerWidth;
    var edge = Math.abs((portrait ? tall : wide) - window.innerHeight) < 20;   // borde a borde → "never"
    if (edge) return;
    var st = document.createElement('style');
    st.id = 'kodesh-ios-insets';
    // Las capas fijas a pantalla completa (inicio, fiestas, luna…) sí empiezan debajo de la barra de estado:
    // usan max(env(), --ios-top-min) para que sus botones nunca queden bajo la hora / Dynamic Island.
    st.textContent = 'html{--safe-area-inset-top:0px !important;--ios-top-min:50px;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}
})();
