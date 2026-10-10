/* KODESH — Bloqueo del desplazamiento de fondo sin «overflow: hidden» en <html>/<body>.
   En el iPhone (Capacitor con contentInset «always»), poner overflow:hidden en body/html mientras hay una hoja
   abierta desplazaba los toques una fila hacia abajo: se abría lo tocado pero se iluminaba el botón de abajo.
   Aquí se anula ese overflow (el código puede seguir poniéndolo) y, mientras hay algo abierto, se impide que un
   deslizamiento mueva la página de atrás, salvo dentro de un elemento que de verdad se desplace. */
(function () {
  'use strict';
  var css = document.createElement('style');
  css.textContent = 'body[style*="overflow: hidden"], body[style*="overflow:hidden"] { overflow: visible !important; }';
  (document.head || document.documentElement).appendChild(css);
  function locked() {
    var b = document.body, h = document.documentElement;
    if (!b) return false;
    return /overflow:\s*hidden/.test(b.getAttribute('style') || '') || b.classList.contains('home-on') || h.classList.contains('md-lock');
  }
  function scrollable(el, dx, dy) {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      var cs = getComputedStyle(el);
      if (Math.abs(dy) >= Math.abs(dx) && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
      if (Math.abs(dx) > Math.abs(dy) && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
    }
    return false;
  }
  var x0 = 0, y0 = 0;
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) { x0 = t.clientX; y0 = t.clientY; } }, { passive: true, capture: true });
  document.addEventListener('touchmove', function (e) {
    if (!locked() || e.touches.length > 1) return;
    var t = e.touches[0]; if (!t) return;
    if (!scrollable(e.target, t.clientX - x0, t.clientY - y0) && e.cancelable) e.preventDefault();
  }, { passive: false, capture: true });
})();

