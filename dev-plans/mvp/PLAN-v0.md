# Especificación — Sistema de Chat Widget + Panel Admin (Supabase + Netlify)

## 0. Objetivo

Sistema de chat en vivo marca blanca, sin backend propio (solo Supabase como BaaS), compuesto por:

1. **`chat-widget.js`** — widget embebible en cualquier sitio web, que pide datos del visitante al iniciar una conversación y permite chatear en tiempo real, con envío de archivos.
2. **Panel admin** (SPA estática desplegada en Netlify) — con roles `admin` y `operador`, gestión de usuarios, conversaciones y configuración del widget.
3. **Supabase** — Postgres + Auth + Realtime + Storage + Row Level Security (RLS) + 1 Edge Function. Es la única pieza de "backend".

No hay servidor propio administrado por ti. Widget y admin hablan directo con Supabase vía SDK. La única pieza de código server-side es una Edge Function de Supabase para crear usuarios (necesaria porque eso requiere la `service_role key`, que nunca puede estar en el frontend).

---

## 1. Stack

- **DB / Auth / Realtime / Storage**: Supabase (free tier alcanza para desarrollo y uso moderado; verificar límites de BD de 500MB y storage de 1GB en supabase.com/pricing antes de producción, ya que los adjuntos de 30MB los consumen rápido)
- **Widget**: JS vanilla, un solo archivo, servido vía CDN (jsDelivr desde GitHub)
- **Admin**: HTML/JS vanilla o framework ligero, desplegado como sitio estático en Netlify
- **1 Edge Function** (Deno, desplegada con `supabase functions deploy`): `create-user`

---

## 2. Modelo de datos (SQL)

```sql
create type user_role as enum ('admin', 'operador');

-- Usuarios internos (admin / operador)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'operador',
  restricted boolean not null default false, -- si true, solo ve conversaciones permitidas explícitamente
  created_at timestamptz not null default now()
);

-- Visitantes que inician un chat
create table visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_key text not null unique, -- generado en el navegador, guardado en localStorage
  name text not null,
  phone text not null,
  dni text not null,
  initial_question text not null,
  created_at timestamptz not null default now()
);

-- Conversaciones
create type conversation_status as enum ('open', 'closed');

create table conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references visitors(id) on delete cascade,
  assigned_operator_id uuid references profiles(id),
  status conversation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabla de permisos explícitos cuando un operador está "restricted"
-- (creada después de conversations por la FK)
create table operator_conversation_access (
  operator_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  primary key (operator_id, conversation_id)
);

-- Mensajes
create type sender_type as enum ('visitor', 'operator');

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type sender_type not null,
  operator_id uuid references profiles(id),
  operator_name text, -- denormalizado para mostrarlo en el widget sin joins
  body text,          -- puede ser null si el mensaje es solo un adjunto
  attachment_url text,
  attachment_name text,
  attachment_size bigint, -- bytes
  attachment_mime text,
  created_at timestamptz not null default now()
);

-- Configuración de marca blanca (single-row)
create table widget_settings (
  id int primary key default 1,
  chat_name text not null default 'Chat',
  primary_color text not null default '#3a63ff',
  secondary_color text not null default '#ffffff',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into widget_settings (id) values (1);

-- updated_at de conversations en cada mensaje nuevo
create or replace function touch_conversation() returns trigger as $$
begin
  update conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_touch_conversation
after insert on messages
for each row execute function touch_conversation();
```

### 2.1 Rate limiting anti-spam (5 mensajes / 20 segundos, por conversación, solo visitante)

```sql
create or replace function enforce_visitor_rate_limit() returns trigger as $$
declare
  recent_count int;
begin
  if new.sender_type = 'visitor' then
    select count(*) into recent_count
    from messages
    where conversation_id = new.conversation_id
      and sender_type = 'visitor'
      and created_at > now() - interval '20 seconds';

    if recent_count >= 5 then
      raise exception 'rate_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_visitor_rate_limit
before insert on messages
for each row execute function enforce_visitor_rate_limit();
```

El widget debe capturar el error `rate_limit_exceeded` y mostrar un mensaje tipo "Estás enviando mensajes muy rápido, espera unos segundos".

---

## 3. Supabase Storage (adjuntos, máx. 30MB)

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 31457280); -- 30MB en bytes
```

Políticas de Storage:
- **INSERT** (subir archivo): público (`anon`), sin restricción de carpeta — el cliente sube a `{conversation_id}/{uuid-filename}`.
- **SELECT** (descargar/ver): público, ya que el bucket es `public=true` y las URLs no son listables sin conocer la ruta exacta.
- Validación de tamaño: el límite de 30MB se aplica a nivel de bucket (`file_size_limit`), Supabase rechaza automáticamente archivos mayores.
- El widget, al subir, obtiene la URL pública y crea el `message` con `attachment_url`, `attachment_name`, `attachment_size`, `attachment_mime`, `body=null`.
- En el admin, mostrar preview de imágenes y enlace de descarga para otros tipos (PDF, docs, etc).

---

## 4. Row Level Security (RLS)

```sql
alter table visitors enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table profiles enable row level security;
alter table widget_settings enable row level security;
alter table operator_conversation_access enable row level security;

create or replace function current_role_is(target_role user_role) returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = target_role);
$$ language sql security definer stable;

create or replace function is_staff() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid());
$$ language sql security definer stable;

create or replace function can_see_conversation(conv_id uuid) returns boolean as $$
  select
    current_role_is('admin')
    or not exists (select 1 from profiles where id = auth.uid() and restricted = true)
    or exists (
      select 1 from operator_conversation_access
      where operator_id = auth.uid() and conversation_id = conv_id
    );
$$ language sql security definer stable;

-- visitors
create policy "anon insert visitor" on visitors for insert to anon with check (true);
create policy "staff read visitors" on visitors for select using (is_staff());
create policy "staff update visitors" on visitors for update using (is_staff());
create policy "admin delete visitors" on visitors for delete using (current_role_is('admin'));

-- conversations
create policy "anon create conversation" on conversations for insert to anon with check (true);
create policy "anon read own conversation" on conversations for select to anon using (true); -- filtrado por id en el cliente
create policy "staff read allowed conversations" on conversations for select
  using (is_staff() and can_see_conversation(id));
create policy "staff update conversations" on conversations for update
  using (is_staff() and can_see_conversation(id));
create policy "admin delete conversations" on conversations for delete using (current_role_is('admin'));

-- messages
create policy "anon insert visitor message" on messages for insert to anon
  with check (sender_type = 'visitor');
create policy "anon read messages of conversation" on messages for select to anon using (true); -- filtrado por conversation_id en el cliente
create policy "staff read allowed messages" on messages for select
  using (is_staff() and can_see_conversation(conversation_id));
create policy "staff insert operator message" on messages for insert
  with check (is_staff() and sender_type = 'operator' and operator_id = auth.uid() and can_see_conversation(conversation_id));
create policy "admin delete messages" on messages for delete using (current_role_is('admin'));

-- profiles
create policy "staff read own or admin all" on profiles for select using (id = auth.uid() or current_role_is('admin'));
create policy "admin manage profiles" on profiles for all using (current_role_is('admin'));

-- operator_conversation_access
create policy "admin manage access" on operator_conversation_access for all using (current_role_is('admin'));
create policy "operator read own access" on operator_conversation_access for select using (operator_id = auth.uid());

-- widget_settings
create policy "public read settings" on widget_settings for select to anon, authenticated using (true);
create policy "admin update settings" on widget_settings for update using (current_role_is('admin'));
```

> El visitante anónimo se identifica únicamente por conocer el `conversation_id` (UUID), guardado en su `localStorage`. Es el patrón estándar para widgets sin cuenta de usuario; documentado como decisión de diseño consciente.

---

## 5. Edge Function: `create-user`

Única pieza de código "server-side" del proyecto — vive en Supabase, no en infraestructura propia.

**Ruta**: `supabase/functions/create-user/index.ts`

**Qué hace**:
1. Verifica que quien llama está autenticado y tiene `role = 'admin'` en `profiles` (usando el JWT recibido).
2. Usa el **service_role key** (variable de entorno de la función, nunca expuesta al cliente) para:
   - `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
   - Insertar en `profiles` (`id`, `full_name`, `role`).
3. Devuelve éxito/error al admin panel.

```ts
// supabase/functions/create-user/index.ts (esqueleto)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')!;
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabaseUser.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 });

  const { email, password, full_name, role } = await req.json();

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { data: newUser, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  await admin.from('profiles').insert({ id: newUser.user.id, full_name, role });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

Desde el admin panel se invoca con:
```js
await supabase.functions.invoke('create-user', {
  body: { email, password, full_name, role }
});
```

Deploy: `supabase functions deploy create-user` (requiere Supabase CLI y estar logueado). El `SUPABASE_SERVICE_ROLE_KEY` se configura como secreto de la función (`supabase secrets set`), nunca en el repo.

---

## 6. `chat-widget.js` — comportamiento

### 6.1 Marca blanca
Al cargar, antes de pintar nada: `supabase.from('widget_settings').select('*').eq('id', 1).single()` → aplicar `chat_name`, `primary_color`, `secondary_color`, `logo_url` como variables CSS y texto del header.

### 6.2 Primer contacto (formulario previo)
Si no hay `visitor_key` + `conversation_id` en `localStorage`:
1. Formulario: **Nombre**, **Teléfono**, **DNI**, **¿En qué podemos ayudarte?**
2. Insertar `visitor` → insertar `conversation` → guardar ambos IDs en `localStorage`.
3. Insertar automáticamente el primer mensaje visible con la `initial_question`.

### 6.3 Chat en curso
- Historial: `messages.select('*').eq('conversation_id', id).order('created_at')`.
- Realtime: suscripción filtrada por `conversation_id`.
- Mensajes de operador muestran su **nombre** (`operator_name`).
- Si llega error `rate_limit_exceeded` al enviar, mostrar aviso y deshabilitar el input unos segundos.
- Si `status = 'closed'`, mostrar aviso y opción de iniciar chat nuevo (limpia `localStorage`).

### 6.4 Envío de archivos (máx. 30MB)
1. Validar tamaño en cliente antes de subir (UX: evitar esperar el rechazo del servidor).
2. `supabase.storage.from('chat-attachments').upload(\`${conversation_id}/${crypto.randomUUID()}-${file.name}\`, file)`.
3. Obtener URL pública con `getPublicUrl`.
4. Insertar `message` con `attachment_url/name/size/mime` y `body=null`.
5. Mostrar barra de progreso simple durante la subida (archivos grandes pueden tardar).

### 6.5 Instalación / embed
```html
<script src="https://cdn.jsdelivr.net/gh/usuario/repo@hash/chat-widget.js"
        data-supabase-url="https://xxx.supabase.co"
        data-supabase-key="ANON_KEY"></script>
```

---

## 7. Panel Admin — comportamiento

### 7.1 Autenticación
Login con Supabase Auth (email + password). Tras login, leer `profiles` para obtener `role`.

### 7.2 Vistas y permisos

| Vista / acción | Operador | Admin |
|---|---|---|
| Lista de conversaciones (todas por defecto, o solo las permitidas si `restricted=true`) | ✅ | ✅ (todas siempre) |
| Responder, adjuntar archivos | ✅ | ✅ |
| Tomar conversación sin asignar | ✅ | ✅ |
| Cerrar conversación | ✅ | ✅ |
| Eliminar conversación | ❌ | ✅ |
| Ver datos del visitante | ✅ solo lectura | ✅ editar |
| Gestión de usuarios: crear (vía Edge Function), cambiar rol, eliminar perfil | ❌ | ✅ |
| Restringir a un operador (`restricted=true`) y elegir qué conversaciones puede ver | ❌ | ✅ |
| Configuración de marca blanca (nombre, colores, logo) | ❌ | ✅ |

### 7.3 Estructura sugerida
```
/admin
  index.html          -> login
  conversations.html  -> lista + detalle (chat lateral, con adjuntos)
  users.html           -> solo admin: crear/editar/eliminar usuarios y restricciones
  settings.html         -> solo admin: marca blanca
  /js
    supabaseClient.js
    auth.js
    conversations.js
    users.js
    settings.js
  /css
    styles.css
```
Ocultar en UI según `role`, pero la barrera real es siempre RLS.

### 7.4 Crear usuario (solo admin)
Formulario (email, password temporal, nombre completo, rol) → `supabase.functions.invoke('create-user', {...})` → al terminar, aparece en la lista de `profiles`.

### 7.5 Restringir conversaciones a un operador (solo admin)
- Toggle `restricted` en `profiles` del operador.
- Si `restricted=true`, mostrar selector múltiple de conversaciones → insertar filas en `operator_conversation_access`.
- Si `restricted=false`, el operador vuelve a ver todas automáticamente (la policy `can_see_conversation` ya lo contempla).

---

## 8. Despliegue

1. **Supabase**: crear proyecto → correr SQL de secciones 2, 3 y 4 → crear bucket `chat-attachments` → crear primer usuario admin manualmente desde el Dashboard (solo este primero; los siguientes ya se crean desde el admin panel) + su fila en `profiles` con `role='admin'`.
2. **Edge Function**: `supabase functions deploy create-user` + configurar secreto `SUPABASE_SERVICE_ROLE_KEY`.
3. **Widget**: subir `chat-widget.js` al repo → servir vía jsDelivr.
4. **Admin**: subir `/admin` a Netlify. Configurar dominio de Netlify como redirect permitido en Supabase Auth.

---

## 9. Orden de implementación sugerido para Claude Code

1. SQL completo (tablas, tipos, triggers de `updated_at` y rate limit) + RLS + bucket de Storage.
2. Crear usuario admin inicial manualmente, verificar login.
3. Edge Function `create-user` + probarla desde curl/Postman antes de integrarla al UI.
4. `chat-widget.js`: formulario inicial → chat con realtime → envío de archivos → manejo de rate limit.
5. `admin/index.html` (login) + `conversations.html` (lista, responder, adjuntos, tomar/cerrar).
6. `admin/users.html`: crear usuarios (vía Edge Function), cambiar rol, restringir conversaciones.
7. `admin/settings.html`: marca blanca (nombre, colores, logo) conectado a `widget_settings`.
8. Aplicar marca blanca dinámica en el widget.
9. Pulir UI y probar flujo completo de punta a punta (incluyendo límites de spam y adjuntos).
10. Desplegar widget en CDN y admin en Netlify.
