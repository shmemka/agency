-- Аватарки блогеров. Запускать в SQL Editor после 003_avatars.sql. Повторный запуск безопасен.
alter table public.bloggers add column if not exists avatar_url text;

-- Фото блогеров лежат в avatars/bloggers/<случайная папка>/...
-- Загружать и удалять может любой сотрудник с открытым доступом.
drop policy if exists avatars_bloggers_insert on storage.objects;
create policy avatars_bloggers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'bloggers' and public.is_member());

drop policy if exists avatars_bloggers_delete on storage.objects;
create policy avatars_bloggers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'bloggers' and public.is_member());
