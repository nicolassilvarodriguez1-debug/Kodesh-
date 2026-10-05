// KODESH — Enlace de "restablecer contraseña".
// Si el correo de recuperación cae en cualquier página que no sea login.html
// (p. ej. porque Supabase usó la Site URL), supabase-js consumía el token,
// iniciaba la sesión y la persona entraba a la app SIN poder cambiar la
// contraseña. Este script corre antes que supabase-js y manda el enlace a
// login.html, que muestra el formulario de nueva contraseña.
(function () {
  try {
    var h = location.hash || '', q = location.search || '';
    if (/[#&?]type=recovery\b/.test(h) || /[?&]type=recovery\b/.test(q)) {
      location.replace('/login.html' + q + h);
    }
  } catch (e) {}
})();
