# White Chat

White-label live chat: an embeddable widget (`web/widget/chat-widget.js`) and an admin panel (`web/admin/`), with Supabase as the only backend (Postgres + RLS, Auth, Realtime, Storage).

Specs, plan and progress: [`dev-plans/mvp/`](dev-plans/mvp/) (`SPEC.md`, `PLAN.md`, `STATUS.md`).

## Structure

```
supabase/migrations/   SQL migrations (schema, RLS, storage)
web/                   static site published to GitHub Pages (gh-pages branch)
  config.js            public Supabase URL + anon key
  demo.html            test page embedding the widget
  widget/              chat-widget.js
  admin/               admin panel
```

## Local development

1. Start local Supabase (Docker), which applies the migrations:
   `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`
   (`web/config.js` uses the local stack on localhost and production elsewhere; keys via `npx supabase status`).
2. Security smoke test: `SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... node supabase/tests/rls_smoke.mjs`
3. Serve the static site: `python3 -m http.server -d web 8787`
   - Admin: http://localhost:8787/admin/
   - Widget demo: http://localhost:8787/demo.html
4. E2E (headless Chrome): `cd tests/e2e && npm install && cd ../..` then
   `node tests/e2e/widget.mjs` (also `admin.mjs`, `settings.mjs`, `attachments.mjs`, `skins.mjs`, `iframe.mjs`; local stack keys by default)

## Production

- Site: https://juliovargas-lang.github.io/white-chat/ (admin: `/admin/`, demo: `/demo.html`)
- Supabase project ref: `bopowpecmfdgqwlxrccf` (us-east-1)
- Deploy the site: `scripts/deploy-pages.sh` (publishes `web/` to the `gh-pages` branch)
- Deploy DB changes: `npx supabase db push` (project already linked)
- Add staff: create the user in Supabase → Authentication → Users, then *Settings → Grant access* in the admin panel.

## Embed the widget

Direct embed (no CSP, or Supabase origins allowlisted in the host CSP):

```html
<script src="https://cdn.jsdelivr.net/gh/juliovargas-lang/white-chat@<commit>/web/widget/chat-widget.js"
        data-supabase-url="https://bopowpecmfdgqwlxrccf.supabase.co"
        data-supabase-key="<anon key from web/config.js>"
        data-skin="classic" defer></script>
```

iframe embed (for sites with a strict Content Security Policy). The chat runs inside an
iframe on GitHub Pages, so the host page only needs `frame-src` to allow
`https://juliovargas-lang.github.io` — no `connect-src`/`img-src` change:

```html
<script src="https://cdn.jsdelivr.net/gh/juliovargas-lang/white-chat@<commit>/web/widget/embed.js"
        data-skin="dark" defer></script>
```

### Skins

The widget's look (palette + shape) comes from the injector, per site, via `data-skin`.
Available skins: **`classic`** (light, blue), **`dark`** (dark, emerald), **`minimal`**
(flat, square, monochrome) and **`soft`** (warm, rounded, coral). An unknown or missing
`data-skin` falls back to `classic`. Both embeds accept it; `embed.js` forwards it into the
iframe. Optional extras: `data-primary-color` / `data-secondary-color` (override the skin's
accent) and `data-chat-name` (override the header title without touching the admin panel).
`widget_settings` no longer controls color — only `chat_name` is still read, for the title.
See all four side by side at `/demo-skins.html`.

All embeds are tested end to end in `tests/e2e/` (`widget.mjs`, `iframe.mjs`, `skins.mjs`).

## Embed

```html
<script src="https://juliovargas-lang.github.io/white-chat/widget/chat-widget.js"
        data-supabase-url="https://bopowpecmfdgqwlxrccf.supabase.co"
        data-supabase-key="<ANON_KEY from web/config.js>" defer></script>
```
