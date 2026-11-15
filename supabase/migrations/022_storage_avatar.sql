-- =====================================================================
--  022: место в хранилище и аватарка кабинета
--
--  1. workspace_storage() - сколько места занимают файлы текущего кабинета:
--     документы, вложения задач, фото блогеров, логотип и аватарка.
--  2. Лимит бесплатного тарифа - 1 ГБ. Когда он занят, новые документы
--     и файлы задач не загружаются (правило хранилища).
--  3. У кабинета появляется аватарка (лежит в бакете logos рядом с логотипом),
--     my_workspaces отдаёт её вместе с остальным оформлением.
--
--  Запускать после 021. Можно запускать повторно.
-- =====================================================================

begin;

alter table public.workspaces add column if not exists avatar_url text;

drop function if exists public.my_workspaces();
create function public.my_workspaces()
returns table (id uuid, name text, role text, is_active boolean, deactivated_at timestamptz, logo_url text, brand_color text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, m.role, m.is_active, m.deactivated_at, w.logo_url, w.brand_color, w.avatar_url
  from workspace_members m join workspaces w on w.id = m.workspace_id
  where m.profile_id = auth.uid()
  order by m.created_at
$$;
revoke execute on function public.my_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated;

-- лимит тарифа в байтах. Платных тарифов пока нет - у всех 1 ГБ
create or replace function public.ws_storage_limit() returns bigint
language sql immutable as $$ select 1073741824::bigint $$;

-- файлы кабинета по видам, в байтах. Считаются только файлы, у которых есть запись в базе
create or replace function public.ws_storage_parts(ws uuid) returns table (kind text, bytes bigint)
language sql stable security definer set search_path = public as $$
  select 'documents', coalesce(sum((o.metadata->>'size')::bigint), 0)
  from documents d join storage.objects o on o.bucket_id = 'documents' and o.name = d.storage_path
  where d.workspace_id = ws
  union all
  select 'tasks', coalesce(sum((o.metadata->>'size')::bigint), 0)
  from task_files f join storage.objects o on o.bucket_id = 'task-files' and o.name = f.storage_path
  where f.workspace_id = ws
  union all
  select 'bloggers', coalesce(sum((o.metadata->>'size')::bigint), 0)
  from bloggers b join storage.objects o on o.bucket_id = 'avatars'
    and o.name = split_part(substring(b.avatar_url from '/avatars/(.*)$'), '?', 1)
  where b.workspace_id = ws and b.avatar_url is not null
  union all
  select 'brand', coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.bucket_id = 'logos' and (storage.foldername(o.name))[1] = ws::text
$$;
revoke execute on function public.ws_storage_parts(uuid) from public, anon, authenticated;

-- для настроек кабинета: виды файлов, всего и лимит
create or replace function public.workspace_storage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_member() then return null; end if;
  select jsonb_object_agg(kind, bytes) || jsonb_build_object('total', sum(bytes), 'limit', public.ws_storage_limit())
  into res from public.ws_storage_parts(public.current_ws());
  return res;
end $$;
revoke execute on function public.workspace_storage() from public, anon;
grant execute on function public.workspace_storage() to authenticated;

-- есть ли ещё место в текущем кабинете
create or replace function public.ws_storage_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(bytes) from public.ws_storage_parts(public.current_ws())), 0) < public.ws_storage_limit()
$$;
revoke execute on function public.ws_storage_ok() from public, anon;
grant execute on function public.ws_storage_ok() to authenticated;

-- лимит: когда место занято, документы и файлы задач больше не загружаются
drop policy if exists ws_storage_quota on storage.objects;
create policy ws_storage_quota on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('documents', 'task-files') or public.ws_storage_ok());

commit;
