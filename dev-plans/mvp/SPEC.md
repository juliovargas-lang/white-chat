# SPEC — White Chat MVP

> Spec-Driven Development: este documento define **qué** debe hacer el sistema y **cómo se verifica**.
> `PLAN.md` define **cómo** se construye, por fases. `STATUS.md` registra el avance.
> Ninguna fase se cierra sin cumplir los criterios de aceptación (CA) de los requisitos que cubre.

## 1. Objetivo

Chat en vivo marca blanca, sin backend propio:

- **Widget** (`chat-widget.js`) embebible con un `<script>` en cualquier sitio.
- **Panel admin**: sitio estático para staff (`admin` / `operador`).
- **Supabase** como único backend: Postgres, Auth, Realtime, Storage y RLS. Sin Edge Functions.

Prioridad: **funcional y rápido**. P0 = imprescindible. P1 = se recorta si hay que acelerar.

**Idioma**: toda la UI (widget y admin) va en **inglés**. La documentación interna sigue en español.

## 2. Requisitos — Widget

| ID | Pri | Requisito | Criterios de aceptación |
|---|---|---|---|
| W1 | P0 | Se instala con un `<script>` con `data-supabase-url` y `data-supabase-key` | Pegar el snippet en `demo.html` muestra la burbuja; los estilos del sitio anfitrión no rompen el widget (Shadow DOM) |
| W2 | P0 | Formulario inicial: nombre, teléfono, DNI, consulta | Campos obligatorios; al enviar se crea la conversación y la consulta aparece como primer mensaje |
| W3 | P0 | Chat en tiempo real | Un mensaje del operador aparece en el widget sin recargar, con el nombre del operador |
| W4 | P0 | Persistencia | Al recargar la página se ve la misma conversación con su historial |
| W5 | P0 | Anti-spam: máx. 5 mensajes / 20 s por conversación y máx. 3 conversaciones / hora por visitante | El sexto mensaje rápido muestra "You're sending messages too fast. Please wait a few seconds." y deshabilita el input unos segundos |
| W6 | P0 | Conversación cerrada | Si el staff cierra, el widget muestra el aviso y un botón "Start new chat" que vuelve al formulario |
| W7 | P0 | Marca blanca (solo texto, sin logo) | El nombre del chat (texto del header) y los colores primario y secundario salen de `widget_settings` |
| W9 | P0 | Textos fáciles de modificar | Todos los textos visibles del widget están en un único objeto `TEXT` al inicio de `chat-widget.js` (en inglés); cambiar uno ahí lo cambia en toda la UI |
| W8 | P1 | Adjuntos ≤ 30MB | Se rechazan archivos > 30MB en el cliente; las imágenes se ven en línea y los demás archivos como enlace; mientras sube muestra "Uploading…" |

## 3. Requisitos — Panel admin

| ID | Pri | Requisito | Criterios de aceptación |
|---|---|---|---|
| A1 | P0 | Login email/password solo para staff | Un usuario sin fila en `profiles` es deslogueado con "Not authorized" |
| A2 | P0 | Lista de conversaciones en tiempo real | Las nuevas aparecen sin recargar; se ordenan por `updated_at`; filtro Open/Closed |
| A3 | P0 | Detalle y respuesta | Se ve el historial, y responder llega al widget en tiempo real |
| A4 | P0 | Datos del visitante (solo lectura) | Se muestran nombre, teléfono y DNI en el detalle |
| A5 | P0 | Tomar conversación | Asigna `assigned_operator_id` al usuario actual; la lista muestra a quién está asignada |
| A6 | P0 | Cerrar conversación | Cambia `status` a `closed` y el widget se entera (W6) |
| A7 | P0 | Eliminar conversación (solo admin) | El botón solo aparece para el admin; el operador no puede ni vía API |
| A8 | P1 | Gestión de staff (solo admin) | Dar acceso por email a un usuario ya creado en el Dashboard, cambiar el rol y quitar el acceso |
| A9 | P0 | Marca blanca (solo admin) | Editar el nombre del chat y los colores; el widget lo refleja al recargar |
| A11 | P0 | Textos fáciles de modificar | Todos los textos visibles del admin están en `web/admin/js/text.js` (en inglés); los HTML no tienen textos sueltos que no salgan de ahí, salvo el `<title>` |
| A10 | P1 | Adjuntos en el admin | Enviar archivos y ver los recibidos (preview de imágenes) |

## 4. Requisitos — Seguridad (no negociables)

| ID | Requisito | Verificación |
|---|---|---|
| S1 | Un visitante solo puede leer y escribir **su** conversación | El visitante B no ve los mensajes del visitante A ni vía API ni vía Realtime |
| S2 | Sin sesión, solo se puede leer `widget_settings` | Con la anon key y sin sesión, `select` sobre `messages` y `conversations` devuelve `[]` |
| S3 | El visitante no puede hacerse pasar por operador | El insert con `sender_type='operator'` es rechazado; `operator_name` lo fija un trigger |
| S4 | No se puede escribir en una conversación cerrada (visitante) | El insert es rechazado por RLS |
| S5 | Solo el admin gestiona staff, settings y borrado | Probado con un usuario operador |
| S6 | Uploads solo dentro de la carpeta de la propia conversación | Subir a `{otra_conv}/x` es rechazado |
| S7 | Ninguna secret en el repo | Solo la anon key (pública por diseño) |

## 5. Fuera de alcance (recortado del plan v0)

- Edge Function `create-user`: el usuario se crea en el Dashboard y se le da acceso con `add_staff`.
- Operadores restringidos / `operator_conversation_access`.
- Tabla `visitors` separada: los datos van en `conversations`.
- Editar datos del visitante.
- Logos (ni en el widget ni en el admin; la marca es solo texto).
- Multi-idioma: la UI es solo en inglés, pero los textos están centralizados por si luego se traducen.
- Barra de progreso de subida, notificaciones o sonido, contador de no leídos, "escribiendo…", paginación y captcha.
- CDN jsDelivr y Netlify: widget y admin se sirven desde GitHub Pages (rama `gh-pages`).

## 6. Limitaciones aceptadas

- Bucket público: quien tenga la URL exacta de un adjunto puede verlo (las rutas llevan dos UUID).
- Los usuarios anónimos se acumulan en `auth.users` (uno por navegador que inicia un chat; no por visita).
- Si el visitante borra el `localStorage` pierde acceso a su conversación.
