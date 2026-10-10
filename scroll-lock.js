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

/* Diagnóstico de toques (solo si se activa): tocar 7 veces seguidas el logo KODESH del menú lateral lo prende/apaga.
   Punto rojo = dónde llegó el toque (touchstart); punto azul = dónde llegó el clic. Arriba, qué elemento recibió cada uno. */
(function () {
  'use strict';
  var KEY = 'kodesh_touchdebug', n = 0, last = 0;
  var on = function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.app-menu-brand');
    if (!b) return;
    var now = Date.now(); n = now - last < 700 ? n + 1 : 1; last = now;
    if (n >= 7) { n = 0; try { localStorage.setItem(KEY, on() ? '0' : '1'); } catch (er) {} alert(on() ? 'Diagnóstico de toques: ACTIVADO' : 'Diagnóstico de toques: apagado'); }
  }, true);
  var box = null;
  function dot(x, y, c) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:14px;height:14px;border-radius:7px;margin:-7px 0 0 -7px;left:' + x + 'px;top:' + y + 'px;background:' + c + ';box-shadow:0 0 0 2px #fff';
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2500);
  }
  function label(el) { if (!el) return '—'; var t = (el.closest && el.closest('button,a,[onclick],[data-go]')) || el; return (t.tagName.toLowerCase() + ' «' + (t.textContent || '').trim().slice(0, 24) + '»'); }
  function show(txt) {
    if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;z-index:99999;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 6px);pointer-events:none;background:rgba(0,0,0,.85);color:#fff;font:12px/1.4 -apple-system,sans-serif;padding:6px 8px;border-radius:8px;white-space:pre-wrap'; document.body.appendChild(box); }
    box.textContent = txt + '\nscrollY ' + Math.round(scrollY) + ' · vv ' + (window.visualViewport ? Math.round(visualViewport.offsetTop) + '/' + Math.round(visualViewport.pageTop) : '-') + ' · ' + innerWidth + '×' + innerHeight + ' · body ' + getComputedStyle(document.body).overflow;
  }
  var ts = '';
  document.addEventListener('touchstart', function (e) { if (!on()) return; var t = e.touches[0]; dot(t.clientX, t.clientY, '#e53935'); ts = 'toque ' + Math.round(t.clientX) + ',' + Math.round(t.clientY) + ' → ' + label(e.target); show(ts); }, { passive: true, capture: true });
  document.addEventListener('click', function (e) { if (!on()) return; dot(e.clientX, e.clientY, '#1e88e5'); show(ts + '\nclic  ' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' → ' + label(e.target)); }, true);
})();
