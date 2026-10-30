-- 0001_schema.sql — ver dev-plans/mvp/PLAN.md (Fase 1)

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
