# PLAN — White Chat MVP

> Cómo se construye lo definido en `SPEC.md`. Cada fase termina con su verificación y **un commit**.
> Plan original (descartado): `PLAN-v0.md`.

## Reglas de trabajo

1. Se trabaja **una fase a la vez**, en orden. Antes de empezar, marcarla como 🟡 en `STATUS.md`.
2. Una fase se cierra solo si pasan sus verificaciones (CA del `SPEC.md`).
3. Al cerrar: actualizar `STATUS.md` (✅, notas y decisiones) y hacer **un commit** con el mensaje indicado, que incluya el cambio de STATUS.
4. Si algo del SPEC resulta inviable o se recorta, se anota en *Decisiones* de `STATUS.md` y se actualiza el `SPEC.md` en el mismo commit.
5. Si el tiempo aprieta, se recortan primero los P1 (fase 5 y A8 de la fase 6).

## Arquitectura

```
Navegador visitante ──(anon key + sesión anónima)──┐
                                                   ├──> Supabase (Postgres + RLS, Auth, Realtime, Storage)
Navegador staff ─────(anon key + sesión email)─────┘
```

- **Identidad del visitante**: `supabase.auth.signInAnonymously()` **solo al enviar el formulario** (no en cada visita). Su `auth.uid()` queda en `conversations.visitor_user_id` y RLS filtra con eso (S1, S2).
- **Staff** = usuario con fila en `profiles`. Las filas solo se crean con la RPC `add_staff` (solo admin) o con SQL a mano para el primer admin. Un signup cualquiera no da acceso.
- **Escrituras sensibles por RPC** `security definer`: `start_conversation` (crea la conversación y el primer mensaje de forma atómica, con límite de 3 por hora) y `add_staff`.
- **Triggers**: el `before insert` de messages fija `operator_id`/`operator_name` desde `auth.uid()` (S3) y aplica el rate limit; el `after insert` actualiza `conversations.updated_at`.
- **Idioma y textos**: UI en inglés. Widget: objeto `TEXT` al inicio de `chat-widget.js`. Admin: `web/admin/js/text.js` exporta `TEXT` y un helper que rellena los elementos con `data-text="clave"`. Sin logos: la marca es el texto `chat_name`.
- **Frontend**: JS vanilla sin build. supabase-js por ESM desde jsDelivr (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`).
- **Widget**: script clásico que hace `import()` dinámico de supabase-js, UI en **Shadow DOM** y `storageKey: 'wc-auth'` para no chocar con un supabase-js del sitio anfitrión.
- **Hosting**: Netlify publica `web/` (admin + widget + demo).
- **Supabase**: en desarrollo se usa local con Docker (`npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta`), que aplica las migraciones solo. El proyecto remoto se crea en la fase 6 (`npx supabase link` + `npx supabase db push`).

## Estructura del repo

```
/
├── dev-plans/mvp/{SPEC.md, PLAN.md, STATUS.md, PLAN-v0.md}
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 0001_schema.sql
│       ├── 0002_rls.sql
│       ├── 0003_storage.sql
│       └── 0004_profile_email.sql   # añadido en la fase 4
├── web/                     # publish dir de Netlify
│   ├── config.js            # SUPABASE_URL + ANON_KEY (públicas)
│   ├── demo.html            # página de prueba que embebe el widget
│   ├── widget/chat-widget.js
│   └── admin/
│       ├── index.html       # login
│       ├── conversations.html
│       ├── admin.html       # staff + marca blanca (solo admin)
│       ├── css/styles.css
│       └── js/{text.js, supabase.js, auth.js, conversations.js, admin.js}
├── tests/e2e/               # puppeteer-core: widget.mjs, admin.mjs
├── netlify.toml
├── .gitignore
└── README.md
```

---

## Fase 0 — Setup del repo
**Cubre**: base para todo · **Commit**: `chore(fase-0): estructura inicial del repo y docs SDD`

- [ ] `git init`, `.gitignore` (`.env`, `node_modules`, `.supabase`, `supabase/.temp`, `.netlify`)
- [ ] Crear la estructura de carpetas de arriba (archivos vacíos o con placeholder)
- [ ] `README.md` corto: qué es, cómo levantarlo localmente (`python3 -m http.server -d web 8080`) y enlace a `dev-plans/mvp/`
- [ ] `netlify.toml` con `publish = "web"` y sin build command
- [ ] `npx supabase init` (el proyecto remoto se crea en la fase 6)

**Verificación**: `git log` muestra el commit; `supabase projects list` muestra el proyecto enlazado.

---

## Fase 1 — Base de datos, RLS y Storage
**Cubre**: S1–S6 y la base de W/A · **Commit**: `feat(fase-1): esquema, RLS, triggers, RPCs y storage`

### 1.1 `0001_schema.sql`
```sql
create type user_role as enum ('admin', 'operator');
create type conversation_status as enum ('open', 'closed');
create type sender_type as enum ('visitor', 'operator');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'operator',
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_user_id uuid not null references auth.users(id) on delete cascade,
  visitor_name text not null,
  visitor_phone text not null,
  visitor_dni text not null,
  assigned_operator_id uuid references profiles(id) on delete set null,
  status conversation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on conversations (visitor_user_id);
create index on conversations (status, updated_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type sender_type not null,
  operator_id uuid references profiles(id) on delete set null,
  operator_name text,
  body text,
  attachment_url text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime text,
  created_at timestamptz not null default now(),
  constraint has_content check (body is not null or attachment_url is not null)
);
create index on messages (conversation_id, created_at);

create table widget_settings (
  id int primary key default 1 constraint single_row check (id = 1),
  chat_name text not null default 'Chat',
  primary_color text not null default '#3a63ff',
  secondary_color text not null default '#ffffff',
  updated_at timestamptz not null default now()
);
insert into widget_settings (id) values (1);

-- Helpers (security definer + search_path fijo)
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create function owns_conversation(conv_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = conv_id and visitor_user_id = auth.uid());
$$;

create function visitor_can_post(conv_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations
                 where id = conv_id and visitor_user_id = auth.uid() and status = 'open');
$$;

-- Trigger: identidad del remitente + rate limit (S3, W5)
create function before_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if new.sender_type = 'operator' then
    new.operator_id := auth.uid();
    select full_name into new.operator_name from profiles where id = auth.uid();
  else
    new.operator_id := null;
    new.operator_name := null;
    select count(*) into recent from messages
     where conversation_id = new.conversation_id
       and sender_type = 'visitor'
       and created_at > now() - interval '20 seconds';
    if recent >= 5 then
      raise exception 'rate_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_before_message_insert before insert on messages
for each row execute function before_message_insert();

-- Trigger: updated_at (security definer para que funcione con el visitante)
create function after_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end; $$;
create trigger trg_after_message_insert after insert on messages
for each row execute function after_message_insert();

-- RPC: el visitante inicia una conversación (W2, W5)
create function start_conversation(p_name text, p_phone text, p_dni text, p_question text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare conv_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_dni), '') = '' or coalesce(trim(p_question), '') = '' then
    raise exception 'invalid_input';
  end if;
  if (select count(*) from conversations
       where visitor_user_id = auth.uid() and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into conversations (visitor_user_id, visitor_name, visitor_phone, visitor_dni)
  values (auth.uid(), trim(p_name), trim(p_phone), trim(p_dni))
  returning id into conv_id;

  insert into messages (conversation_id, sender_type, body)
  values (conv_id, 'visitor', trim(p_question));

  return conv_id;
end; $$;

-- RPC: el admin da acceso de staff a un usuario ya creado en el Dashboard (A8)
create function add_staff(p_email text, p_full_name text, p_role user_role default 'operator')
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select id into uid from auth.users
   where lower(email) = lower(trim(p_email)) and coalesce(is_anonymous, false) = false;
  if uid is null then raise exception 'user_not_found'; end if;
  insert into profiles (id, full_name, role) values (uid, p_full_name, p_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
  return uid;
end; $$;

revoke execute on function start_conversation(text, text, text, text) from public, anon;
revoke execute on function add_staff(text, text, user_role) from public, anon;
grant execute on function start_conversation(text, text, text, text) to authenticated;
grant execute on function add_staff(text, text, user_role) to authenticated;

-- Realtime
alter publication supabase_realtime add table messages, conversations;
```

### 1.2 `0002_rls.sql`
```sql
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table widget_settings enable row level security;

-- profiles: el insert solo se hace vía add_staff
create policy "staff read profiles" on profiles for select to authenticated using (is_staff());
create policy "admin update profiles" on profiles for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "admin delete profiles" on profiles for delete to authenticated
  using (is_admin() and id <> auth.uid());

-- conversations: el insert solo se hace vía start_conversation
create policy "read own or staff" on conversations for select to authenticated
  using (visitor_user_id = auth.uid() or is_staff());
create policy "staff update conversations" on conversations for update to authenticated
  using (is_staff()) with check (is_staff());
create policy "admin delete conversations" on conversations for delete to authenticated
  using (is_admin());

-- messages
create policy "read own or staff" on messages for select to authenticated
  using (is_staff() or owns_conversation(conversation_id));
create policy "visitor insert" on messages for insert to authenticated
  with check (sender_type = 'visitor' and visitor_can_post(conversation_id));
create policy "staff insert" on messages for insert to authenticated
  with check (sender_type = 'operator' and is_staff());

-- widget_settings
create policy "public read settings" on widget_settings for select to anon, authenticated using (true);
create policy "admin update settings" on widget_settings for update to authenticated
  using (is_admin()) with check (is_admin());
```

### 1.3 `0003_storage.sql`
```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 31457280);

create policy "upload to own conversation" on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (public.is_staff()
       or public.owns_conversation(((storage.foldername(name))[1])::uuid))
);
```

### 1.4 Configuración en el Dashboard (se aplica en la fase 6, en el proyecto remoto)
- [ ] Auth → Providers: **Anonymous sign-ins = ON**; Email = ON.
- [ ] Crear el primer admin: Auth → Users → Add user (email + password, auto-confirm). Luego, en el SQL Editor:
  `insert into profiles (id, full_name, role, email) select id, 'Admin', 'admin', email from auth.users where email = '<email>';`
- [ ] (Recomendado) Desactivar "Allow new users to sign up" **solo si** no bloquea los sign-ins anónimos. Si los bloquea, dejarlo activo: un signup sin `profiles` no tiene acceso a nada.

### Verificación
- [ ] `npx supabase start` (o `npx supabase db reset`) aplica las 3 migraciones sin error.
- [ ] `node supabase/tests/rls_smoke.mjs` (con `SUPABASE_URL`, `ANON_KEY` y `SERVICE_ROLE_KEY` locales) → `ALL PASSED`. Cubre S1–S6, W2, W5, A1 y A6–A9 a nivel de API.
- [ ] S2: `curl "$URL/rest/v1/messages?select=*" -H "apikey: $ANON"` devuelve `[]`.
- [ ] S3/S4/S5: en el SQL Editor, usar la impersonación de rol (dropdown "Role") con un usuario operador y comprobar que `delete from conversations` y `update widget_settings` no afectan filas. El resto de S1/S3/S4 se verifica de punta a punta en la fase 2.

---

## Fase 2 — Widget núcleo
**Cubre**: W1–W7, S1, S3, S4 · **Commit**: `feat(fase-2): widget con formulario, chat realtime, rate limit y marca blanca`

- [ ] `web/widget/chat-widget.js`: lee `data-supabase-url`/`data-supabase-key` de `document.currentScript` (capturarlo **antes** de cualquier `await`).
- [ ] `import()` de supabase-js; `createClient(url, key, { auth: { storageKey: 'wc-auth', persistSession: true } })`.
- [ ] Objeto `TEXT` al inicio del archivo con todos los textos en inglés (W9): título por defecto, labels y placeholders del formulario (Name, Phone, ID number, How can we help you?), Send, Start new chat, aviso de rate limit, aviso de chat cerrado, Uploading…, errores genéricos.
- [ ] Shadow DOM: burbuja flotante + panel (header con `chat_name` como texto, lista de mensajes, input). Colores con variables CSS de `widget_settings` (W7).
- [ ] Estado en `localStorage`: `wc-conversation-id`.
  - Sin ID: formulario → si no hay sesión, `signInAnonymously()` → `rpc('start_conversation', …)` → guardar el ID.
  - Con ID: cargar la conversación y los mensajes (si falla o no existe, limpiar y mostrar el formulario).
- [ ] Realtime: un canal con `postgres_changes` INSERT en `messages` (filtro `conversation_id=eq.<id>`) y UPDATE en `conversations` (filtro `id=eq.<id>`). Deduplicar los mensajes por `id`.
- [ ] Enviar: `insert` en `messages` con `sender_type: 'visitor'`. Error con `rate_limit_exceeded` → aviso y input deshabilitado 5 s. Error de RLS → recargar la conversación; si está `closed`, mostrar el estado cerrado.
- [ ] Cerrada (W6): aviso + botón "Start new chat" (borra `wc-conversation-id`; la sesión anónima se reutiliza).
- [ ] `web/demo.html` con CSS agresivo propio (para probar el aislamiento) y el snippet de embed.

### Verificación
- [ ] W1–W5 y W7 probados en `demo.html`. Para los mensajes del operador, insertarlos desde el SQL Editor como un operador impersonado o esperar a la fase 3.
- [ ] S1: abrir `demo.html` en una ventana normal y en otra de incógnito (dos visitantes). Desde la consola de B, `select` de los mensajes de la conversación de A → `[]`.
- [ ] S3: desde la consola, insertar con `sender_type: 'operator'` → rechazado.

---

## Fase 3 — Admin: login y conversaciones
**Cubre**: A1–A7, W3, W6 de punta a punta · **Commit**: `feat(fase-3): panel admin con login y gestión de conversaciones`

- [ ] `js/text.js`: `export const TEXT = {…}` con todos los textos del admin en inglés + `applyText(root)` que rellena `[data-text]` y `[data-placeholder]` (A11).
- [ ] `js/supabase.js`: cliente compartido (lee `web/config.js`).
- [ ] `js/auth.js`: `requireStaff()` → sesión + `profiles`; si no hay perfil, `signOut` + "Not authorized" (A1). Expone `{ user, profile }`. Botón de logout.
- [ ] `index.html`: formulario de login → redirige a `conversations.html`.
- [ ] `conversations.html` (layout de 3 columnas: lista | chat | datos del visitante):
  - Lista con filtro Open/Closed, ordenada por `updated_at desc`, con el nombre del asignado (join a `profiles`) (A2, A5).
  - Realtime en `conversations` (INSERT/UPDATE) → refrescar la lista.
  - Detalle: historial + realtime de `messages` filtrado por la conversación seleccionada; enviar con `sender_type: 'operator'` (A3).
  - Panel del visitante, solo lectura (A4).
  - Botones: Take (A5), Close (A6), Delete solo si `role = 'admin'` con `confirm()` (A7).
- [ ] Link a `admin.html` visible solo para el admin.

### Verificación
- [ ] Flujo completo con dos ventanas: el visitante escribe → aparece en el admin → el operador responde → aparece en el widget con su nombre → cerrar → el widget muestra el aviso y "Start new chat".
- [ ] Un usuario con login pero sin `profiles` → "Not authorized".
- [ ] Un operador no ve el botón Delete y, por consola, el `delete` no borra nada (S5).

---

## Fase 4 — Admin: marca blanca y staff
**Cubre**: A9 (P0), A8 (P1), S5 · **Commit**: `feat(fase-4): marca blanca y gestión de staff`

- [ ] `admin.html` redirige a conversaciones si `role !== 'admin'`.
- [ ] Sección **Marca blanca** (A9): input de nombre del chat, `<input type="color">` ×2, preview simple del header → `update widget_settings … eq('id', 1)`.
- [ ] Sección **Staff** (A8, recortable): tabla de `profiles` (nombre, email, rol); cambiar el rol (`update`); quitar el acceso (`delete`, no a uno mismo); formulario "Grant access" (email, name, role) → `rpc('add_staff')`, con el aviso "The user must already exist in Supabase Auth → Users".

### Verificación
- [ ] Cambiar el color o el nombre → recargar `demo.html` → se aplica.
- [ ] Crear un usuario en el Dashboard → `add_staff` → puede loguearse como operador; `user_not_found` muestra un error legible.
- [ ] Un operador que abre `admin.html` es redirigido; por consola, `update widget_settings` no afecta filas.

---

## Fase 5 — Adjuntos (P1)
**Cubre**: W8, A10, S6 · **Commit**: `feat(fase-5): adjuntos en widget y admin`

- [ ] Helper compartido (copiado en el widget y en el admin): validar ≤ 30MB → `upload(`${convId}/${crypto.randomUUID()}-${safeName}`)` → `getPublicUrl` → insertar el mensaje con `attachment_*` y `body: null`. Mientras sube, mostrar "Uploading…".
- [ ] Render: `image/*` como `<img>` (con un `max-width`), el resto como enlace de descarga con nombre y tamaño.
- [ ] `safeName`: reemplazar todo lo que no sea `[a-zA-Z0-9._-]` por `_`.

### Verificación
- [ ] Imagen y PDF en ambos sentidos; un archivo de 31MB se rechaza en el cliente.
- [ ] S6: desde la consola del visitante B, subir a `<conv_de_A>/x.txt` → rechazado.

---

## Fase 6 — Deploy y prueba final
**Cubre**: todo · **Commit**: `chore(fase-6): deploy en Netlify y checklist E2E` + tag `v0.1.0`

- [ ] Crear el proyecto Supabase remoto → `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
- [ ] Aplicar la configuración del Dashboard de la sección 1.4 (anonymous sign-ins, primer admin).
- [ ] Poner la URL y la anon key remotas en `web/config.js` y en el snippet de `web/demo.html`.
- [ ] Subir el repo a GitHub y conectarlo a Netlify (o `netlify deploy --prod --dir web`).
- [ ] Supabase Auth → URL Configuration: Site URL = dominio de Netlify.
- [ ] README: snippet final de embed con la URL de Netlify (`https://<sitio>.netlify.app/widget/chat-widget.js`).
- [ ] Revisar que no quede texto en español en la UI (widget y admin).
- [ ] Repetir en producción la verificación E2E de la fase 3, más W5, W8 y S1.

---

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| El snapshot de una función `stable` no ve filas insertadas en el mismo statement | Por eso la creación de la conversación va por RPC y no con `insert().select()` |
| Realtime con RLS no entrega eventos si la sesión no está lista al suscribirse | Suscribirse después de tener la sesión; reintentar al recibir `SIGNED_IN` |
| El rate limit de sign-ins anónimos (por IP) en Supabase | El sign-in se hace solo al enviar el formulario; si molesta en pruebas, subirlo en Auth → Rate Limits |
| Free tier de Storage (1GB) | Aceptado para el MVP; se revisa antes de producción real |
