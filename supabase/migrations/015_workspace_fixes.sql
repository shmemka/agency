-- =====================================================================
--  015: исправления после перехода на кабинеты
--
--  1. Не создавалась кампания: «new row violates row-level security policy
--     for table campaigns». Правило видимости кампании искало её в таблице,
--     а новой кампании там ещё нет. Возвращаем правила видимости кампании и блогера
--     к прежнему виду: чужой кабинет и так отсекается отдельным правилом на каждой таблице.
--  2. Чтобы нельзя было связать записи из разных кабинетов (интеграцию с чужой
--     кампанией, задачу с чужим блогером), проверяем это при сохранении.
--  3. Можно покинуть кабинет самому (раздел «Мой профиль»). Последний учредитель
--     уйти не может, пока не назначит другого.
--
--  Запускать после 014. Можно запускать повторно.
-- =====================================================================

begin;

create or replace function public.sees_campaign(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and (
    public.is_admin()
    or exists (select 1 from campaigns c where c.id = cid and c.owner_id = auth.uid())
    or exists (select 1 from campaign_members m where m.campaign_id = cid and m.profile_id = auth.uid())
  )
$$;

create or replace function public.sees_blogger(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and (
    public.is_admin()
    or exists (select 1 from bloggers b where b.id = bid and b.owner_id = auth.uid())
    or public.blogger_shared(bid)
  )
$$;

-- все связанные записи должны быть из того же кабинета, что и сама запись
create or replace function public.check_same_ws() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new);
  w uuid := new.workspace_id;
  bad boolean := false;
begin
  if j ? 'blogger_id' and (j ->> 'blogger_id') is not null then
    bad := bad or exists (select 1 from bloggers where id = (j ->> 'blogger_id')::uuid and workspace_id <> w);
  end if;
  if j ? 'campaign_id' and (j ->> 'campaign_id') is not null then
    bad := bad or exists (select 1 from campaigns where id = (j ->> 'campaign_id')::uuid and workspace_id <> w);
  end if;
  if j ? 'integration_id' and (j ->> 'integration_id') is not null then
    bad := bad or exists (select 1 from integrations where id = (j ->> 'integration_id')::uuid and workspace_id <> w);
  end if;
  if j ? 'client_id' and (j ->> 'client_id') is not null then
    bad := bad or exists (select 1 from clients where id = (j ->> 'client_id')::uuid and workspace_id <> w);
  end if;
  if j ? 'section_id' and (j ->> 'section_id') is not null then
    bad := bad or exists (select 1 from task_sections where id = (j ->> 'section_id')::uuid and workspace_id <> w);
  end if;
  if bad then
    raise exception 'Запись ссылается на данные другого кабинета';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- «ab_» — после «aa_ws_from_parent», который сначала выставляет кабинет по родителю
  foreach t in array array['integrations', 'documents', 'activity', 'tasks', 'campaigns', 'incomes', 'offers'] loop
    execute format('drop trigger if exists ab_check_same_ws on public.%I', t);
    execute format('create trigger ab_check_same_ws before insert or update on public.%I for each row execute function public.check_same_ws()', t);
  end loop;
end $$;

create or replace function public.leave_workspace() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w uuid := public.current_ws(); m workspace_members;
begin
  select * into m from workspace_members where workspace_id = w and profile_id = uid;
  if not found then raise exception 'Вы не состоите в этом кабинете'; end if;
  if m.role = 'admin' and m.is_active and not exists (
    select 1 from workspace_members where workspace_id = w and role = 'admin' and is_active and profile_id <> uid) then
    raise exception 'Вы единственный учредитель. Сначала назначьте учредителем кого-то ещё в разделе «Команда»';
  end if;
  delete from workspace_members where workspace_id = w and profile_id = uid;
  update profiles set current_workspace_id = (
    select workspace_id from workspace_members where profile_id = uid order by is_active desc, created_at limit 1)
  where id = uid;
end $$;

revoke execute on function public.leave_workspace() from public, anon;
grant execute on function public.leave_workspace() to authenticated;

commit;
