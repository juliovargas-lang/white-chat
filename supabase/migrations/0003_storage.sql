-- 0003_storage.sql — ver dev-plans/mvp/PLAN.md (Fase 1)

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 31457280);

create policy "upload to own conversation" on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (public.is_staff()
       or public.owns_conversation(((storage.foldername(name))[1])::uuid))
);
