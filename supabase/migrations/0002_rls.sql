-- 0002_rls.sql — ver dev-plans/mvp/PLAN.md (Fase 1)

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
