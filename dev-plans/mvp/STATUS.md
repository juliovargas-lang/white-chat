# STATUS — White Chat MVP

> Se actualiza al empezar y al cerrar cada fase, dentro del mismo commit de la fase.
> Estados: ⬜ pendiente · 🟡 en curso · ✅ hecha · ✂️ recortada

**Fase actual**: Fase 4 — Admin: marca blanca y staff
**Última actualización**: 2026-10-30

## Fases

| Fase | Descripción | Prioridad | Estado | Commit |
|---|---|---|---|---|
| 0 | Setup del repo y docs SDD | P0 | ✅ | `chore(fase-0)` |
| 1 | Base de datos, RLS y Storage | P0 | ✅ | `feat(fase-1)` |
| 2 | Widget núcleo | P0 | ✅ | `feat(fase-2)` |
| 3 | Admin: login y conversaciones | P0 | ✅ | `feat(fase-3)` |
| 4 | Admin: marca blanca (P0) y staff (P1) | P0/P1 | ⬜ | — |
| 5 | Adjuntos | P1 | ⬜ | — |
| 6 | Deploy y prueba final | P0 | ⬜ | — |

## Cobertura del SPEC

| Requisito | Fase | Verificado |
|---|---|---|
| W1–W7, W9 | 2 | ✅ (E2E) |
| W8 | 5 | ⬜ |
| A1–A7, A11 | 3 | ✅ (E2E) |
| A8, A9 | 4 | ⬜ |
| A10 | 5 | ⬜ |
| S1–S5 | 1–3 | ✅ API (fase 1) + UI/Realtime (fases 2–3) |
| S6 | 5 | 🟡 API ✅ (fase 1), falta UI |
| S7 | todas | ⬜ |

## Decisiones

- 2026-10-30 — Se reemplaza el plan v0 por SPEC/PLAN/STATUS (SDD). Se recortan: Edge Function, operadores restringidos, tabla `visitors`, edición de datos del visitante, barra de progreso y subida de logo. Ver `SPEC.md` §5.
- 2026-10-30 — El visitante se identifica con Supabase Anonymous Sign-In (en lugar de "conocer el UUID"), para que RLS y Realtime filtren de verdad.
- 2026-10-30 — Widget y admin se sirven desde Netlify (sin jsDelivr).
- 2026-10-30 — Sin logos: la marca es solo texto (`chat_name`) y colores. Se elimina `widget_settings.logo_url`.
- 2026-10-30 — Desarrollo contra Supabase local (Docker); el proyecto remoto se crea en la fase 6. Así no hay bloqueos hasta el deploy.
- 2026-10-30 — UI en inglés con los textos centralizados (`TEXT` en el widget, `web/admin/js/text.js` en el admin). El rol `operador` pasa a `operator` en el enum.

## Bloqueos / pendientes

- **[usuario, fase 6]** Crear el proyecto Supabase remoto y hacer login en la CLI (`npx supabase login`). No bloquea las fases 2–5.

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
