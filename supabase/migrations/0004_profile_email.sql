-- 0004_profile_email.sql — guardar el email en profiles para mostrarlo en la gestión de staff (A8).

alter table profiles add column email text;

update profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function add_staff(p_email text, p_full_name text, p_role user_role default 'operator')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  user_email text;
begin
  if not is_admin() then raise exception 'forbidden'; end if;
  select id, email into uid, user_email from auth.users
   where lower(email) = lower(trim(p_email)) and coalesce(is_anonymous, false) = false;
  if uid is null then raise exception 'user_not_found'; end if;
  insert into profiles (id, full_name, role, email) values (uid, p_full_name, p_role, user_email)
  on conflict (id) do update
    set full_name = excluded.full_name, role = excluded.role, email = excluded.email;
  return uid;
end; $$;
