-- =====================================================================
--  014: кабинеты
--  Сайт «Сверка» становится общим для многих агентств. У каждого агентства
--  свой кабинет: свои блогеры, кампании, задачи, деньги и команда.
--  Один человек может состоять в нескольких кабинетах и переключаться между ними.
--
--  Что происходит с текущими данными: всё переезжает в кабинет «shft agency»,
--  роли и доступы сотрудников сохраняются.
--
--  Запускать ПОСЛЕ 009–013. Миграция идёт одной транзакцией: если что-то
--  упадёт, база останется как была. Перед запуском сделайте резервную копию
--  (Supabase → Database → Backups).
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.task_counts()') is null or to_regclass('public.blogger_lists') is null then
    raise exception 'Сначала запустите миграции 009, 010, 011, 012 и 013';
  end if;
  if to_regclass('public.workspaces') is not null then
    raise exception 'Миграция 014 уже запущена';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Кабинеты, участники, ссылки-приглашения
-- ---------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  -- пока только агентства; позже появятся пиар-агенты и бренды
  kind        text not null default 'agency' check (kind in ('agency')),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'manager' check (role in ('admin', 'manager')),
  is_active       boolean not null default true,
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);
create index workspace_members_profile_idx on public.workspace_members (profile_id);

-- ссылку видят и меняют только учредители кабинета
create table public.workspace_invites (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at    timestamptz not null default now()
);

alter table public.profiles add column current_workspace_id uuid references public.workspaces(id) on delete set null;

-- ---------------------------------------------------------------------
--  Текущий кабинет и права в нём
-- ---------------------------------------------------------------------
create or replace function public.current_ws() returns uuid
language sql stable security definer set search_path = public as $$
  select current_workspace_id from profiles where id = auth.uid()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m join profiles p on p.id = m.profile_id
    where m.profile_id = auth.uid() and m.workspace_id = p.current_workspace_id and m.is_active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m join profiles p on p.id = m.profile_id
    where m.profile_id = auth.uid() and m.workspace_id = p.current_workspace_id and m.is_active and m.role = 'admin')
$$;

-- человек — действующий учредитель текущего кабинета (для правил задач)
create or replace function public.is_ws_admin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members m
                 where m.profile_id = pid and m.workspace_id = public.current_ws() and m.is_active and m.role = 'admin')
$$;

-- состою ли я в кабинете (в любом статусе)
create or replace function public.in_ws(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and profile_id = auth.uid())
$$;

-- этот человек в моём текущем кабинете
create or replace function public.shares_ws(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = public.current_ws() and profile_id = pid)
$$;

-- ---------------------------------------------------------------------
--  Текущие данные → кабинет «shft agency»
-- ---------------------------------------------------------------------
do $$
declare
  ws uuid := gen_random_uuid();
  t text;
begin
  insert into workspaces (id, name, created_by)
  values (ws, 'shft agency', (select id from profiles where role = 'admin' order by created_at limit 1));
  insert into workspace_invites (workspace_id) values (ws);
  insert into workspace_members (workspace_id, profile_id, role, is_active, deactivated_at, created_at)
  select ws, id, role, is_active, deactivated_at, created_at from profiles;
  update profiles set current_workspace_id = ws;

  foreach t in array array[
    'activity', 'blogger_list_items', 'blogger_lists', 'bloggers', 'campaign_members', 'campaign_money',
    'campaigns', 'clients', 'documents', 'expenses', 'incomes', 'integrations', 'notifications', 'offers',
    'settings', 'share_links', 'task_comments', 'task_files', 'task_sections', 'tasks'] loop
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces(id) on delete cascade', t);
    execute format('update public.%I set workspace_id = %L', t, ws);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('alter table public.%I alter column workspace_id set default public.current_ws()', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_ws_idx', t);
    -- данные кабинета видны и меняются только из этого кабинета
    execute format('create policy %I on public.%I as restrictive for all using (workspace_id = (select public.current_ws())) with check (workspace_id = (select public.current_ws()))',
                   t || '_ws', t);
  end loop;
end $$;

-- настройки: одна строка на кабинет, название — в самом кабинете
alter table public.settings drop constraint settings_pkey;
alter table public.settings drop column id;
alter table public.settings drop column agency_name;
alter table public.settings add primary key (workspace_id);

-- один и тот же блогер может быть в базе у разных агентств
alter table public.bloggers drop constraint bloggers_platform_nick;
alter table public.bloggers add constraint bloggers_ws_platform_nick unique (workspace_id, platform, nick_key);

drop index public.notifications_dedupe_idx;
create unique index notifications_dedupe_idx on public.notifications (workspace_id, profile_id, dedupe_key)
  where read_at is null and dedupe_key is not null;

-- ---------------------------------------------------------------------
--  Вложенные записи берут кабинет у родителя: так нельзя привязать запись
--  к блогеру или кампании чужого кабинета, и работают ссылки для клиентов (без входа)
-- ---------------------------------------------------------------------
create or replace function public.ws_from_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  case tg_table_name
    when 'integrations', 'offers' then
      select workspace_id into w from bloggers where id = new.blogger_id;
    when 'activity' then
      if new.blogger_id is not null then select workspace_id into w from bloggers where id = new.blogger_id;
      elsif new.integration_id is not null then select workspace_id into w from integrations where id = new.integration_id;
      end if;
    when 'documents' then
      if new.blogger_id is not null then select workspace_id into w from bloggers where id = new.blogger_id;
      elsif new.campaign_id is not null then select workspace_id into w from campaigns where id = new.campaign_id;
      elsif new.integration_id is not null then select workspace_id into w from integrations where id = new.integration_id;
      end if;
    when 'blogger_list_items' then
      select workspace_id into w from blogger_lists where id = new.list_id;
    when 'campaign_members', 'campaign_money', 'share_links' then
      select workspace_id into w from campaigns where id = new.campaign_id;
    when 'incomes' then
      if new.campaign_id is not null then select workspace_id into w from campaigns where id = new.campaign_id; end if;
    when 'task_comments', 'task_files' then
      select workspace_id into w from tasks where id = new.task_id;
    else null;
  end case;
  if w is not null then new.workspace_id := w; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['integrations', 'offers', 'activity', 'documents', 'blogger_list_items',
                           'campaign_members', 'campaign_money', 'share_links', 'incomes', 'task_comments', 'task_files'] loop
    -- «aa_» — чтобы сработал раньше остальных триггеров
    execute format('create trigger aa_ws_from_parent before insert on public.%I for each row execute function public.ws_from_parent()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  Профили: роль и доступ теперь у участника кабинета, а не у человека
-- ---------------------------------------------------------------------
drop policy if exists v2_tasks_insert on public.tasks;
create policy v2_tasks_insert on public.tasks for insert
  with check (public.is_admin() or (public.is_member() and (
    assignee_id is null or assignee_id = auth.uid() or public.is_ws_admin(assignee_id))));

drop policy if exists v2_tasks_update on public.tasks;
create policy v2_tasks_update on public.tasks for update
  using (public.is_admin() or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.is_admin() or (public.is_member() and (
    assignee_id is null or assignee_id = auth.uid() or public.is_ws_admin(assignee_id))));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or (public.is_member() and public.shares_ws(id)));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- новый человек — просто профиль; кабинет он создаст или получит по ссылке
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

-- о новых людях учредители узнают при входе по ссылке-приглашению
drop trigger if exists on_auth_user_notify on auth.users;
drop function if exists public.notify_signup();

-- переключиться можно только в свой кабинет
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.current_workspace_id is distinct from old.current_workspace_id and new.current_workspace_id is not null
     and not exists (select 1 from workspace_members where workspace_id = new.current_workspace_id and profile_id = new.id) then
    raise exception 'Вы не состоите в этом кабинете';
  end if;
  return new;
end $$;

alter table public.profiles drop column role;
alter table public.profiles drop column is_active;
alter table public.profiles drop column deactivated_at;

-- команда текущего кабинета: профиль + роль и доступ в этом кабинете
create view public.team with (security_invoker = true) as
  select p.id, p.email, p.full_name, p.avatar_url, m.role, m.is_active, m.deactivated_at, m.created_at
  from public.profiles p join public.workspace_members m on m.profile_id = p.id
  where m.workspace_id = public.current_ws();

-- ---------------------------------------------------------------------
--  Защита участников: состав меняют учредители, учредитель остаётся всегда
-- ---------------------------------------------------------------------
create or replace function public.protect_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare w uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.profile_id <> old.profile_id) then
    raise exception 'Нельзя перенести участника в другой кабинет';
  end if;
  -- кабинет удалили целиком — проверять нечего
  if not exists (select 1 from workspaces where id = w) then return null; end if;
  if not exists (select 1 from workspace_members where workspace_id = w and role = 'admin' and is_active) then
    raise exception 'В кабинете должен остаться хотя бы один учредитель с доступом';
  end if;
  return null;
end $$;

create constraint trigger workspace_members_admin_left after update or delete on public.workspace_members
  deferrable initially deferred for each row execute function public.protect_member();

-- ---------------------------------------------------------------------
--  Доступ к кабинетам
-- ---------------------------------------------------------------------
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

create policy workspaces_select on public.workspaces for select using (public.in_ws(id));
create policy workspaces_update on public.workspaces for update
  using (id = public.current_ws() and public.is_admin()) with check (id = public.current_ws() and public.is_admin());

create policy members_select on public.workspace_members for select
  using (profile_id = auth.uid() or (workspace_id = (select public.current_ws()) and public.is_member()));
create policy members_update on public.workspace_members for update
  using (workspace_id = (select public.current_ws()) and public.is_admin())
  with check (workspace_id = (select public.current_ws()) and public.is_admin());

create policy invites_select on public.workspace_invites for select
  using (workspace_id = (select public.current_ws()) and public.is_admin());

revoke all on public.workspaces, public.workspace_members, public.workspace_invites, public.team from anon;
grant select, update on public.workspaces, public.workspace_members to authenticated;
grant select on public.workspace_invites, public.team to authenticated;

-- ---------------------------------------------------------------------
--  Действия с кабинетами
-- ---------------------------------------------------------------------
create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); w uuid;
begin
  if uid is null then raise exception 'Войдите, чтобы создать кабинет'; end if;
  if n = '' then raise exception 'Укажите название агентства'; end if;
  if length(n) > 80 then raise exception 'Название длиннее 80 символов'; end if;
  if (select count(*) from workspaces where created_by = uid) >= 5 then
    raise exception 'Один человек может создать не больше 5 кабинетов';
  end if;
  insert into workspaces (name, created_by) values (n, uid) returning id into w;
  insert into workspace_members (workspace_id, profile_id, role, is_active) values (w, uid, 'admin', true);
  insert into workspace_invites (workspace_id) values (w);
  insert into settings (workspace_id) values (w);
  insert into task_sections (workspace_id, name, position, created_by)
  values (w, 'Новое', 1, null), (w, 'В работе', 2, null), (w, 'Готово', 3, null);
  update profiles set current_workspace_id = w where id = uid;
  return w;
end $$;

-- название кабинета по ссылке-приглашению: показываем до входа
create or replace function public.invite_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', w.name)
  from workspace_invites i join workspaces w on w.id = i.workspace_id
  where i.token = p_token
$$;

create or replace function public.join_workspace(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w uuid; m workspace_members; who text;
begin
  if uid is null then raise exception 'Войдите, чтобы присоединиться'; end if;
  select workspace_id into w from workspace_invites where token = p_token;
  if not found then raise exception 'Ссылка-приглашение больше не действует. Попросите у учредителя новую'; end if;
  select * into m from workspace_members where workspace_id = w and profile_id = uid;
  if found then
    if not m.is_active and m.deactivated_at is not null then
      raise exception 'Доступ в этот кабинет закрыт. Попросите учредителя вернуть его в разделе «Команда»';
    end if;
    if not m.is_active then update workspace_members set is_active = true where workspace_id = w and profile_id = uid; end if;
  else
    insert into workspace_members (workspace_id, profile_id, role, is_active) values (w, uid, 'manager', true);
    select coalesce(full_name, email) into who from profiles where id = uid;
    perform public.notify_admins('team', coalesce(who, 'Новый человек') || ' присоединился к команде', '/team', 'join-' || uid, w);
  end if;
  update profiles set current_workspace_id = w where id = uid;
  return w;
end $$;

create or replace function public.switch_workspace(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and profile_id = auth.uid()) then
    raise exception 'Вы не состоите в этом кабинете';
  end if;
  update profiles set current_workspace_id = p_ws where id = auth.uid();
end $$;

create or replace function public.my_workspaces()
returns table (id uuid, name text, role text, is_active boolean, deactivated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, m.role, m.is_active, m.deactivated_at
  from workspace_members m join workspaces w on w.id = m.workspace_id
  where m.profile_id = auth.uid()
  order by m.created_at
$$;

create or replace function public.reset_invite() returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'Ссылку меняют учредители'; end if;
  update workspace_invites set token = encode(gen_random_bytes(12), 'hex'), created_at = now()
  where workspace_id = public.current_ws() returning token into t;
  return t;
end $$;

revoke execute on function public.create_workspace(text), public.join_workspace(text), public.switch_workspace(uuid),
  public.my_workspaces(), public.reset_invite() from public, anon;
grant execute on function public.create_workspace(text), public.join_workspace(text), public.switch_workspace(uuid),
  public.my_workspaces(), public.reset_invite() to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  Функции, которые обходят правила доступа, теперь смотрят только в свой кабинет
-- ---------------------------------------------------------------------
drop function if exists public.notify(uuid, text, text, text, text);
create or replace function public.notify(p_profile uuid, p_kind text, p_title text, p_link text,
                                         p_key text default null, p_ws uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare w uuid := coalesce(p_ws, public.current_ws());
begin
  if p_profile is null or w is null then return; end if;
  if not exists (select 1 from workspace_members where workspace_id = w and profile_id = p_profile and is_active) then return; end if;
  insert into notifications (workspace_id, profile_id, kind, title, link, dedupe_key)
  values (w, p_profile, p_kind, p_title, p_link, p_key)
  on conflict (workspace_id, profile_id, dedupe_key) where read_at is null and dedupe_key is not null
  do update set title = excluded.title, created_at = now();
end $$;

drop function if exists public.notify_admins(text, text, text, text);
create or replace function public.notify_admins(p_kind text, p_title text, p_link text,
                                                p_key text default null, p_ws uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare a record; w uuid := coalesce(p_ws, public.current_ws());
begin
  for a in select profile_id from workspace_members
           where workspace_id = w and role = 'admin' and is_active and profile_id is distinct from auth.uid() loop
    perform public.notify(a.profile_id, p_kind, p_title, p_link, p_key, w);
  end loop;
end $$;

create or replace function public.sees_blogger(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member()
    and exists (select 1 from bloggers b where b.id = bid and b.workspace_id = public.current_ws())
    and (public.is_admin()
         or exists (select 1 from bloggers b where b.id = bid and b.owner_id = auth.uid())
         or public.blogger_shared(bid))
$$;

create or replace function public.sees_campaign(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member()
    and exists (select 1 from campaigns c where c.id = cid and c.workspace_id = public.current_ws())
    and (public.is_admin()
         or exists (select 1 from campaigns c where c.id = cid and c.owner_id = auth.uid())
         or exists (select 1 from campaign_members m where m.campaign_id = cid and m.profile_id = auth.uid()))
$$;

create or replace function public.existing_bloggers(p_keys text[])
returns table (key text, owner_name text, visible boolean)
language sql stable security definer set search_path = public as $$
  select b.platform || ':' || b.nick_key,
         coalesce(p.full_name, p.email, 'не назначен'),
         public.sees_blogger(b.id)
  from bloggers b left join profiles p on p.id = b.owner_id
  where public.is_member() and b.workspace_id = public.current_ws()
    and (b.platform || ':' || b.nick_key) = any (p_keys)
$$;

create or replace function public.request_blogger_access(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare b record; me text;
begin
  if not public.is_member() then raise exception 'нет доступа'; end if;
  select id, nick into b from bloggers where workspace_id = public.current_ws() and platform || ':' || nick_key = p_key;
  if not found then return; end if;
  select coalesce(full_name, email) into me from profiles where id = auth.uid();
  perform public.notify_admins('access', me || ' просит доступ к блогеру ' || b.nick,
                               '/bloggers/' || b.id, 'access-' || b.id || '-' || auth.uid());
end $$;

create or replace function public.task_section_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.section_id is null then
    select id into new.section_id from task_sections where workspace_id = new.workspace_id order by position limit 1;
  end if;
  return new;
end $$;

-- ссылки для клиентов открываются без входа: кабинет берём у кампании
create or replace function public.set_share_decision(p_token text, p_integration uuid, p_decision text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s share_links; c campaigns; i integrations;
begin
  select * into s from share_links where token = p_token and kind = 'shortlist' and not revoked;
  if not found then return jsonb_build_object('error', 'revoked'); end if;
  if p_decision not in ('pending', 'approved', 'rejected') then return jsonb_build_object('error', 'bad_decision'); end if;
  select * into i from integrations where id = p_integration and campaign_id = s.campaign_id and client_decision <> 'none';
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if public.decision_locked(i.status) and p_decision is distinct from i.client_decision then
    return jsonb_build_object('error', 'locked');
  end if;
  update integrations set client_decision = p_decision,
                          client_comment = nullif(left(btrim(coalesce(p_comment, '')), 500), ''),
                          client_decided_at = now()
  where id = i.id;
  select * into c from campaigns where id = s.campaign_id;
  if c.owner_id is not null then
    perform public.notify(c.owner_id, 'client', 'Клиент отметил выбор в подборке «' || c.name || '»',
                          '/campaigns/' || c.id, 'decision-' || c.id, c.workspace_id);
  else
    perform public.notify_admins('client', 'Клиент отметил выбор в подборке «' || c.name || '»',
                                 '/campaigns/' || c.id, 'decision-' || c.id, c.workspace_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- в шапке страницы для клиента — название агентства из кабинета
do $$
declare src text;
begin
  select pg_get_functiondef('public.get_share(text)'::regprocedure) into src;
  if position('(select agency_name from settings)' in src) = 0 then
    raise exception 'get_share изменилась, обновите миграцию';
  end if;
  execute replace(src, '(select agency_name from settings)', '(select name from workspaces where id = c.workspace_id)');
end $$;

-- название для страницы входа больше не нужно: там название сайта
drop function if exists public.public_agency_name();

-- файлы удаляют учредители только своего кабинета
drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects for delete
  using (bucket_id = 'documents' and (owner_id = auth.uid()::text
         or (public.is_admin() and exists (select 1 from public.documents d where d.storage_path = objects.name))));

drop policy if exists task_files_bucket_delete on storage.objects;
create policy task_files_bucket_delete on storage.objects for delete
  using (bucket_id = 'task-files' and (owner_id = auth.uid()::text
         or (public.is_admin() and exists (select 1 from public.task_files f where f.storage_path = objects.name))));

commit;
