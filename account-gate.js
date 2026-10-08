/* KODESH — Modo invitado: cuando alguien sin cuenta toca algo que la necesita
   (asistente IA, búsqueda inteligente, interlineal, Traducción Kodesh, perfil,
   Premium), aparece una hoja pequeña que lo invita a crear su cuenta gratis.
   Nada interrumpe la lectura. Expone window.askAccount(motivo). */
(function () {
  'use strict';
  const WHY = {
    asistente: ['Pregúntale a las Escrituras', 'El asistente de estudio usa IA. Crea tu cuenta gratis para usarlo cada día.'],
    busqueda: ['Búsqueda inteligente', 'La búsqueda por significado usa IA. Crea tu cuenta gratis, o busca por palabras sin cuenta.'],
    interlineal: ['Interlineal hebreo y griego', 'Crea tu cuenta gratis para ver cada palabra en su idioma original.'],
    kodesh: ['Traducción Kodesh', 'Crea tu cuenta gratis para leer la Traducción Kodesh.'],
    perfil: ['Tu perfil', 'Crea tu cuenta gratis para guardar tu avance, tus notas y tus insignias en todos tus equipos.'],
    premium: ['Kodesh Premium', 'Primero crea tu cuenta, así tu suscripción queda guardada y puedes restaurarla en cualquier equipo.'],
    estudio: ['Mi estudio', 'Crea tu cuenta gratis para guardar tus estudios en la nube.'],
  };
  const css = document.createElement('style');
  css.textContent = `
.ag-ov { position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; opacity: 0; transition: opacity .2s; }
.ag-ov.open { opacity: 1; }
.ag-sh { width: min(520px, 100%); background: var(--bg2, #12111a); color: var(--text, #e9e3d3); border: 1px solid var(--border2, #2a2836); border-bottom: none; border-radius: 22px 22px 0 0; padding: 22px 20px calc(env(safe-area-inset-bottom, 0px) + 18px); font-family: var(--font-body, 'EB Garamond', serif); transform: translateY(24px); transition: transform .25s; }
.ag-ov.open .ag-sh { transform: none; }
.ag-k { font-family: 'Cinzel', serif; font-size: .62rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--gold, #c9a84c); }
.ag-h { font-family: var(--font-display, 'Cormorant Garamond', serif); font-size: 1.7rem; font-weight: 600; margin-top: 4px; }
.ag-p { color: var(--text-mid, #b8af9c); font-size: 1.05rem; line-height: 1.45; margin: 6px 0 16px; }
.ag-b { display: block; width: 100%; height: 50px; border-radius: 14px; border: none; font: inherit; font-size: 1.08rem; cursor: pointer; margin-top: 8px; }
.ag-b.ag-main { background: var(--gold, #c9a84c); color: #15120a; }
.ag-b.sec { background: none; border: 1px solid var(--border2, #2a2836); color: var(--text, #e9e3d3); }
.ag-b.txt { background: none; color: var(--text-mid, #b8af9c); height: 40px; }
.ag-note { font-size: .88rem; color: var(--text-dim, #8e8676); text-align: center; margin-top: 6px; }`;
  document.head.appendChild(css);
  window.askAccount = function (why) {
    const [t, p] = WHY[why] || ['Crea tu cuenta gratis', 'Para usar esta función necesitas una cuenta. Es gratis.'];
    const ov = document.createElement('div'); ov.className = 'ag-ov'; ov.setAttribute('role', 'dialog');
    ov.innerHTML = `<div class="ag-sh"><div class="ag-k">Kodesh · cuenta gratis</div><div class="ag-h">${t}</div><p class="ag-p">${p}</p>
      <button class="ag-b ag-main" data-a="signup">Crear cuenta gratis</button><button class="ag-b sec" data-a="login">Ya tengo cuenta</button><button class="ag-b txt" data-a="x">Ahora no</button>
      <div class="ag-note">Lo que guardaste en este teléfono pasa a tu cuenta.</div></div>`;
    const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 200); };
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-a="signup"]').onclick = () => { location.href = 'login.html?mode=signup'; };
    ov.querySelector('[data-a="login"]').onclick = () => { location.href = 'login.html?mode=login'; };
    ov.querySelector('[data-a="x"]').onclick = close;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    return false;
  };
  window.isGuestMode = () => { try { return typeof currentUser !== 'undefined' && !currentUser && localStorage.getItem('kodesh_guest') === '1'; } catch (e) { return false; } };
})();
