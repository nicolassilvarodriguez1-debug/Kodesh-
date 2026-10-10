# Correos de Supabase en dos idiomas

Se pegan en Supabase › Authentication › Emails (Templates). Cada plantilla muestra el texto en inglés si el usuario
se registró con la app en inglés (`user_metadata.lang = "en"`, lo guarda login.html/auth.js) y en español en
cualquier otro caso (incluidos los usuarios de antes).

| Plantilla en Supabase | Archivo | Asunto |
|---|---|---|
| Confirm signup | confirmar-cuenta.html | Confirma tu cuenta · Confirm your account |
| Reset password | restablecer-contrasena.html | Restablece tu contraseña · Reset your password |
| Magic link | enlace-magico.html | Tu enlace para entrar · Your sign-in link |
| Change email address | cambiar-correo.html | Confirma tu nuevo correo · Confirm your new email |

El asunto va en los dos idiomas porque es un solo campo.
