# STATUS — White Chat MVP

> Se actualiza al empezar y al cerrar cada fase, dentro del mismo commit de la fase.
> Estados: ⬜ pendiente · 🟡 en curso · ✅ hecha · ✂️ recortada

**Fase actual**: MVP completo (`v0.1.0`) — todas las fases cerradas
**Última actualización**: 2026-10-30

## Fases

| Fase | Descripción | Prioridad | Estado | Commit |
|---|---|---|---|---|
| 0 | Setup del repo y docs SDD | P0 | ✅ | `chore(fase-0)` |
| 1 | Base de datos, RLS y Storage | P0 | ✅ | `feat(fase-1)` |
| 2 | Widget núcleo | P0 | ✅ | `feat(fase-2)` |
| 3 | Admin: login y conversaciones | P0 | ✅ | `feat(fase-3)` |
| 4 | Admin: marca blanca (P0) y staff (P1) | P0/P1 | ✅ | `feat(fase-4)` |
| 5 | Adjuntos | P1 | ✅ | `feat(fase-5)` |
| 6 | Deploy y prueba final | P0 | ✅ | `chore(fase-6)` + tag `v0.1.0` |

## Cobertura del SPEC

| Requisito | Fase | Verificado |
|---|---|---|
| W1–W7, W9 | 2 | ✅ (E2E) |
| W8 | 5 | ✅ (E2E) |
| A1–A7, A11 | 3 | ✅ (E2E) |
| A8, A9 | 4 | ✅ (E2E) |
| A10 | 5 | ✅ (E2E) |
| S1–S5 | 1–3 | ✅ API (fase 1) + UI/Realtime (fases 2–3) |
| S6 | 5 | ✅ API (fase 1) + UI (fase 5) |
| S7 | todas | ✅ solo la anon key en el repo; secretos en `~/.white-chat-deploy.env` |

## Decisiones

- 2026-10-30 — Se reemplaza el plan v0 por SPEC/PLAN/STATUS (SDD). Se recortan: Edge Function, operadores restringidos, tabla `visitors`, edición de datos del visitante, barra de progreso y subida de logo. Ver `SPEC.md` §5.
- 2026-10-30 — El visitante se identifica con Supabase Anonymous Sign-In (en lugar de "conocer el UUID"), para que RLS y Realtime filtren de verdad.
- 2026-10-30 — Widget y admin se sirven desde Netlify (sin jsDelivr). **Reemplazado en la fase 6 por GitHub Pages** (pedido del usuario: solo GitHub).
- 2026-10-30 — Sin logos: la marca es solo texto (`chat_name`) y colores. Se elimina `widget_settings.logo_url`.
- 2026-10-30 — Desarrollo contra Supabase local (Docker); el proyecto remoto se crea en la fase 6. Así no hay bloqueos hasta el deploy.
- 2026-10-30 — Se agrega `profiles.email` (migración 0004, completada por `add_staff`) para distinguir al staff en la tabla. Fuera del plan original, pero el costo es mínimo.
- 2026-10-30 — No se puede desactivar "Allow new users to sign up": en Supabase eso también bloquea los sign-ins anónimos (probado). Queda activo; un signup sin `profiles` no tiene acceso (A1, smoke test).
- 2026-10-30 — UI en inglés con los textos centralizados (`TEXT` en el widget, `web/admin/js/text.js` en el admin). El rol `operador` pasa a `operator` en el enum.

## Bloqueos / pendientes

- (ninguno)

## Notas por fase

<!-- Al cerrar cada fase: qué se hizo, qué quedó fuera y qué hay que saber para la siguiente. -->

### Fase 0 — ✅
- Repo git (`main`), `.gitignore`, `README.md`, `netlify.toml` (publish `web/`), estructura `web/` y `supabase/`.
- `npx supabase init` (no hay Supabase CLI global; se usa vía `npx`). En `config.toml`, `enable_anonymous_sign_ins = true`.
- `web/config.js` con placeholders: rellenar con la URL y la anon key del proyecto.
- Pendiente: crear el proyecto Supabase remoto (movido a la fase 6).

### Fase 1 — ✅
- Migraciones `0001_schema.sql`, `0002_rls.sql` y `0003_storage.sql` (copiadas del PLAN sin cambios). Se aplican limpias en el Supabase local.
- `supabase/tests/rls_smoke.mjs`: 29 comprobaciones de API (S1–S6, W2, W5, A1, A6–A9) → ALL PASSED. Tarda ~25 s porque espera a que pase la ventana del rate limit. Usa la service key: **solo local**.
- `web/config.js` apunta al Supabase local (URL y anon key de demo, que son públicas). Se cambia en la fase 6.
- Para levantar: `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`; las keys salen con `npx supabase status`.
- Realtime no está probado todavía (se prueba con la UI en las fases 2–3).

### Fase 2 — ✅
- `web/widget/chat-widget.js` (vanilla, Shadow DOM, textos en `TEXT`) y `web/demo.html` (con CSS hostil a propósito).
- `tests/e2e/widget.mjs` (puppeteer-core + Chrome del sistema): 15 comprobaciones W1–W7 y W9 → ALL PASSED. Setup: `cd tests/e2e && npm install`; servir `web/` en el puerto 8787 (el 8080 está ocupado en esta máquina).
- Problemas encontrados y corregidos:
  - Realtime no entregaba eventos justo después de `signInAnonymously` (el canal se unía con la anon key). Solución: `supabase.realtime.setAuth(session.access_token)` antes de suscribirse. **Aplicar lo mismo en el admin tras el login.**
  - `display:flex` anulaba el atributo `hidden` → regla global `[hidden] { display:none !important }`.
  - El `letter-spacing` del sitio anfitrión se heredaba → `host.style.all = 'initial'` inline.

### Fase 3 — ✅
- `web/admin/`: `index.html` (login), `conversations.html` (lista | chat | visitante), `css/styles.css` (incluye estilos de `admin.html` para la fase 4) y `js/{text,supabase,auth,conversations}.js`.
- `auth.js` → `requireStaff({ adminOnly })`: redirige si no hay perfil o si no es admin; aplica `realtime.setAuth`; arma el header (nombre, logout, `[data-admin-only]`).
- Realtime del admin: un canal con `conversations` (*) y `messages` (INSERT). La lista se recarga con un debounce de 300 ms.
- La conversación seleccionada va en el hash de la URL (`#<id>`).
- `tests/e2e/admin.mjs`: 19 comprobaciones (A1–A7, A11, W3/W6 de punta a punta) → ALL PASSED. Helpers comunes en `tests/e2e/lib.mjs`.
- Limitación: los nombres del staff se cargan una vez al abrir la página (un staff nuevo aparece como "—" hasta recargar).

### Fase 4 — ✅
- `web/admin/admin.html` + `js/admin.js`: marca blanca (nombre, 2 colores, preview en vivo) y staff (tabla con nombre/email/rol, cambio de rol, quitar acceso, dar acceso por email vía `add_staff`). No se puede cambiar el rol propio ni quitarse el acceso a uno mismo.
- Migración `0004_profile_email.sql`.
- `tests/e2e/settings.mjs`: 14 comprobaciones (A8, A9, S5) → ALL PASSED. Restaura `widget_settings` al terminar.
- Los E2E usan por defecto las keys de demo del stack local (no hace falta exportar variables).

### Fase 5 — ✅
- Adjuntos en el widget (botón 📎) y en el admin (📎 en el composer): validación de ≤ 30MB en el cliente, ruta `{conv_id}/{uuid}-{nombre_saneado}`, `getPublicUrl` y mensaje con `attachment_*`. Mientras sube se muestra "Uploading…".
- Render: las imágenes en línea y el resto como enlace con nombre y tamaño.
- **Seguridad**: `attachment_url` la escribe el cliente → solo se muestran URLs que empiezan con `<SUPABASE_URL>/storage/v1/object/public/chat-attachments/` (evita `javascript:` y enlaces a dominios externos).
- `tests/e2e/attachments.mjs`: 7 comprobaciones (W8, A10, URL forjada) → ALL PASSED. Regresión completa (widget, admin, settings, rls_smoke) ✅.
- Bug corregido: el botón de enviar del admin se buscaba con `querySelector('button')`, que ahora devolvía el de adjuntar.

### Fase 6 — ✅
- Supabase `white-chat` (ref `bopowpecmfdgqwlxrccf`, us-east-1) creado por la Management API. Migraciones 0001–0004 aplicadas con `db push`. Auth: anonymous sign-ins ON, site URL = GitHub Pages.
- Primer admin: `juliovargas@investingtoday.org` (Julio Vargas, admin).
- Sitio en GitHub Pages: https://juliovargas-lang.github.io/white-chat/ (rama `gh-pages`, publicada con `scripts/deploy-pages.sh`). `web/config.js` elige el Supabase local o el de producción según el hostname.
- Verificación en producción: `rls_smoke.mjs` 29/29 y E2E widget 15/15, admin 19/19, settings 14/14, attachments 7/7. Después se borraron los datos de prueba (usuarios de test, anónimos, conversaciones y archivos).
- Secretos (tokens, contraseña de la BD, service key) solo en `~/.white-chat-deploy.env` (chmod 600), fuera del repo.
- Tests: `admin.mjs` esperaba el botón Delete en vez del chat visible y fallaba con la latencia real; corregido. `widget.mjs` falló 1 de 5 veces en local (timing de Realtime); no se reprodujo.

## Siguientes pasos sugeridos (fuera del MVP)
- Pantalla para que el staff cambie su contraseña (hoy solo desde el Dashboard de Supabase).
- Captcha en el formulario del widget si aparece spam (Supabase Auth soporta hCaptcha/Turnstile para sign-ins anónimos).
- Revisar los límites de Storage del free tier (1GB) antes de tener tráfico real.
