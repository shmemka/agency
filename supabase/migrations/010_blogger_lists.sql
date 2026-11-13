-- =====================================================================
--  010: списки блогеров
--  Вкладки на странице «Блогеры»: «Все» и списки, которые создают учредители.
--  Добавлять и убирать блогеров в списках может любой участник команды (только тех блогеров, кого видит).
--  Запускать после 009. Можно запускать повторно.
-- =====================================================================

create table if not exists public.blogger_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  position    double precision not null default extract(epoch from now()),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.blogger_list_items (
  list_id     uuid not null references public.blogger_lists(id) on delete cascade,
  blogger_id  uuid not null references public.bloggers(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  added_at    timestamptz not null default now(),
  primary key (list_id, blogger_id)
);
create index if not exists blogger_list_items_blogger_idx on public.blogger_list_items (blogger_id);

alter table public.blogger_lists enable row level security;
alter table public.blogger_list_items enable row level security;
grant select, insert, update, delete on public.blogger_lists to authenticated;
grant select, insert, delete on public.blogger_list_items to authenticated;

drop policy if exists blogger_lists_select on public.blogger_lists;
drop policy if exists blogger_lists_write on public.blogger_lists;
create policy blogger_lists_select on public.blogger_lists for select using (public.is_member());
create policy blogger_lists_write on public.blogger_lists for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists blogger_list_items_select on public.blogger_list_items;
drop policy if exists blogger_list_items_insert on public.blogger_list_items;
drop policy if exists blogger_list_items_delete on public.blogger_list_items;
create policy blogger_list_items_select on public.blogger_list_items for select
  using (public.is_member() and public.sees_blogger(blogger_id));
create policy blogger_list_items_insert on public.blogger_list_items for insert
  with check (public.is_member() and public.sees_blogger(blogger_id));
create policy blogger_list_items_delete on public.blogger_list_items for delete
  using (public.is_member() and public.sees_blogger(blogger_id));

do $$
declare t text;
begin
  foreach t in array array['blogger_lists', 'blogger_list_items'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then null;
end $$;
