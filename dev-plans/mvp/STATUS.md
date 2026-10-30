# STATUS — White Chat MVP

> Se actualiza al empezar y al cerrar cada fase, dentro del mismo commit de la fase.
> Estados: ⬜ pendiente · 🟡 en curso · ✅ hecha · ✂️ recortada

**Fase actual**: Fase 1 — Base de datos, RLS y Storage (bloqueada: falta crear/enlazar el proyecto Supabase)
**Última actualización**: 2026-10-30

## Fases

| Fase | Descripción | Prioridad | Estado | Commit |
|---|---|---|---|---|
| 0 | Setup del repo y docs SDD | P0 | ✅ | `chore(fase-0)` |
| 1 | Base de datos, RLS y Storage | P0 | ⬜ | — |
| 2 | Widget núcleo | P0 | ⬜ | — |
| 3 | Admin: login y conversaciones | P0 | ⬜ | — |
| 4 | Admin: marca blanca (P0) y staff (P1) | P0/P1 | ⬜ | — |
| 5 | Adjuntos | P1 | ⬜ | — |
| 6 | Deploy y prueba final | P0 | ⬜ | — |

## Cobertura del SPEC

| Requisito | Fase | Verificado |
|---|---|---|
| W1–W7, W9 | 2 | ⬜ |
| W8 | 5 | ⬜ |
| A1–A7, A11 | 3 | ⬜ |
| A8, A9 | 4 | ⬜ |
| A10 | 5 | ⬜ |
| S1–S5 | 1–3 | ⬜ |
| S6 | 5 | ⬜ |
| S7 | todas | ⬜ |

## Decisiones

- 2026-10-30 — Se reemplaza el plan v0 por SPEC/PLAN/STATUS (SDD). Se recortan: Edge Function, operadores restringidos, tabla `visitors`, edición de datos del visitante, barra de progreso y subida de logo. Ver `SPEC.md` §5.
- 2026-10-30 — El visitante se identifica con Supabase Anonymous Sign-In (en lugar de "conocer el UUID"), para que RLS y Realtime filtren de verdad.
- 2026-10-30 — Widget y admin se sirven desde Netlify (sin jsDelivr).
- 2026-10-30 — Sin logos: la marca es solo texto (`chat_name`) y colores. Se elimina `widget_settings.logo_url`.
- 2026-10-30 — UI en inglés con los textos centralizados (`TEXT` en el widget, `web/admin/js/text.js` en el admin). El rol `operador` pasa a `operator` en el enum.

## Bloqueos / pendientes

- **[usuario]** Crear el proyecto en Supabase y enlazarlo: `npx supabase login` → `npx supabase link --project-ref <ref>`. Pasar la URL y la anon key para completar `web/config.js`. Bloquea el cierre de la fase 1.

## Notas por fase

<!-- Al cerrar cada fase: qué se hizo, qué quedó fuera y qué hay que saber para la siguiente. -->

### Fase 0 — ✅
- Repo git (`main`), `.gitignore`, `README.md`, `netlify.toml` (publish `web/`), estructura `web/` y `supabase/`.
- `npx supabase init` (no hay Supabase CLI global; se usa vía `npx`). En `config.toml`, `enable_anonymous_sign_ins = true`.
- `web/config.js` con placeholders: rellenar con la URL y la anon key del proyecto.
- Pendiente movido a la fase 1: crear el proyecto Supabase y hacer `link` (requiere login del usuario).
