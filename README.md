# White Chat

White-label live chat: an embeddable widget (`web/widget/chat-widget.js`) and an admin panel (`web/admin/`), with Supabase as the only backend (Postgres + RLS, Auth, Realtime, Storage).

Specs, plan and progress: [`dev-plans/mvp/`](dev-plans/mvp/) (`SPEC.md`, `PLAN.md`, `STATUS.md`).

## Structure

```
supabase/migrations/   SQL migrations (schema, RLS, storage)
web/                   static site published by Netlify
  config.js            public Supabase URL + anon key
  demo.html            test page embedding the widget
  widget/              chat-widget.js
  admin/               admin panel
```

## Local development

1. Start local Supabase (Docker), which applies the migrations:
   `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`
   (`web/config.js` already points to the local stack; keys via `npx supabase status`).
2. Security smoke test: `SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... node supabase/tests/rls_smoke.mjs`
3. Serve the static site: `python3 -m http.server -d web 8787`
   - Admin: http://localhost:8787/admin/
   - Widget demo: http://localhost:8787/demo.html
4. E2E (headless Chrome): `cd tests/e2e && npm install && cd ../..` then
   `ANON_KEY=... SERVICE_ROLE_KEY=... node tests/e2e/widget.mjs` (also `admin.mjs`)

## Embed

```html
<script src="https://<your-site>.netlify.app/widget/chat-widget.js"
        data-supabase-url="https://xxx.supabase.co"
        data-supabase-key="ANON_KEY" defer></script>
```
