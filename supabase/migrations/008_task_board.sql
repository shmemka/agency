-- =====================================================================
--  008: доска задач
--  - колонки доски (task_sections): создаются, переименовываются, удаляются
--  - у задачи: колонка, порядок в колонке, описание; исполнителя можно не назначать
--  - комментарии и вложения к задаче, уведомления о новых комментариях
--  Запускать после 002–007. Можно запускать повторно.
-- =====================================================================

-- колонки
create table if not exists public.task_sections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  position    double precision not null default extract(epoch from now()),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.task_sections enable row level security;
grant select, insert, update, delete on public.task_sections to authenticated;

drop policy if exists task_sections_select on public.task_sections;
drop policy if exists task_sections_write on public.task_sections;
create policy task_sections_select on public.task_sections for select using (public.is_member());
create policy task_sections_write on public.task_sections for all using (public.is_member()) with check (public.is_member());

-- три колонки для начала
insert into public.task_sections (name, position, created_by)
select n, p, null from (values ('Новое', 1::double precision), ('В работе', 2), ('Готово', 3)) v(n, p)
where not exists (select 1 from public.task_sections);

-- задачи: колонка (пусто = первая колонка), порядок, описание
alter table public.tasks add column if not exists section_id uuid references public.task_sections(id) on delete set null;
alter table public.tasks add column if not exists position double precision;
alter table public.tasks add column if not exists description text;
update public.tasks set position = extract(epoch from created_at) where position is null;
alter table public.tasks alter column position set default extract(epoch from now());
alter table public.tasks alter column position set not null;
alter table public.tasks alter column assignee_id drop not null;

-- задачу без исполнителя может поставить любой участник
drop policy if exists v2_tasks_insert on public.tasks;
create policy v2_tasks_insert on public.tasks for insert
  with check (public.is_admin() or (public.is_member() and (assignee_id is null or assignee_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = assignee_id and p.role = 'admin' and p.is_active))));

-- комментарии
create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  body        text not null check (length(btrim(body)) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
alter table public.task_comments enable row level security;
grant select, insert, delete on public.task_comments to authenticated;

drop policy if exists task_comments_select on public.task_comments;
drop policy if exists task_comments_insert on public.task_comments;
drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_select on public.task_comments for select
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_comments_insert on public.task_comments for insert
  with check (author_id = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_comments_delete on public.task_comments for delete
  using (author_id = auth.uid() or public.is_admin());

-- вложения: файл лежит в приватном хранилище task-files, папка = id задачи
create table if not exists public.task_files (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  name          text not null,
  storage_path  text not null unique,
  size          bigint,
  mime          text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists task_files_task_idx on public.task_files (task_id, created_at);
alter table public.task_files enable row level security;
grant select, insert, delete on public.task_files to authenticated;

drop policy if exists task_files_select on public.task_files;
drop policy if exists task_files_insert on public.task_files;
drop policy if exists task_files_delete on public.task_files;
create policy task_files_select on public.task_files for select
  using (exists (select 1 from public.tasks t where t.id = task_id));
create policy task_files_insert on public.task_files for insert
  with check (created_by = auth.uid() and exists (select 1 from public.tasks t where t.id = task_id));
create policy task_files_delete on public.task_files for delete
  using (created_by = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists task_files_bucket_select on storage.objects;
drop policy if exists task_files_bucket_insert on storage.objects;
drop policy if exists task_files_bucket_delete on storage.objects;
create policy task_files_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and (owner_id = auth.uid()::text
         or exists (select 1 from public.task_files f where f.storage_path = objects.name)));
create policy task_files_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_member());
create policy task_files_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and (owner_id = auth.uid()::text or public.is_admin()));

-- новый комментарий: уведомляем исполнителя и автора задачи (кроме того, кто написал)
create or replace function public.task_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t tasks; who text; p uuid;
begin
  select * into t from tasks where id = new.task_id;
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Коллега') into who from profiles where id = new.author_id;
  foreach p in array array[t.assignee_id, t.created_by] loop
    if p is not null and p is distinct from new.author_id then
      perform public.notify(p, 'task', coalesce(who, 'Коллега') || ' прокомментировал задачу «' || left(t.title, 60) || '»',
                            '/tasks/' || t.id, 'task-comment-' || t.id);
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists task_comments_notify on public.task_comments;
create trigger task_comments_notify after insert on public.task_comments
  for each row execute function public.task_comment_notify();

-- живое обновление доски
do $$
declare t text;
begin
  foreach t in array array['task_sections', 'task_comments', 'task_files'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then null;
end $$;
