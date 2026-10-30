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

1. Fill in `web/config.js` with your Supabase project URL and anon key.
2. Apply migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Serve the static site: `python3 -m http.server -d web 8080`
   - Admin: http://localhost:8080/admin/
   - Widget demo: http://localhost:8080/demo.html

## Embed

```html
<script src="https://<your-site>.netlify.app/widget/chat-widget.js"
        data-supabase-url="https://xxx.supabase.co"
        data-supabase-key="ANON_KEY" defer></script>
```
