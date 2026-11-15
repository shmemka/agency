-- =====================================================================
--  018: удаление кабинета со всеми данными
--
--  delete_workspace(id, название) - только учредитель текущего кабинета,
--  название вводится вручную для подтверждения. Удаляются кабинет, команда,
--  блогеры, интеграции, кампании, задачи, документы, финансы, уведомления и история:
--  все таблицы ссылаются на кабинет с on delete cascade.
--  Файлы в хранилище сайт удаляет сам до вызова: правила хранилища разрешают
--  удалять файл, только пока есть запись о нём.
--  У участников открывается другой их кабинет, а если других нет - экран
--  «создать кабинет или войти по ссылке».
--
--  Запускать после 017. Можно запускать повторно.
-- =====================================================================

create or replace function public.delete_workspace(p_ws uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare w workspaces; ids uuid[];
begin
  select * into w from workspaces where id = p_ws;
  if not found then raise exception 'Кабинет не найден'; end if;
  if p_ws is distinct from public.current_ws() or not public.is_admin() then
    raise exception 'Удалить кабинет может только его учредитель';
  end if;
  if btrim(coalesce(p_name, '')) <> w.name then
    raise exception 'Название не совпадает. Введите его точно как в настройках';
  end if;

  select array_agg(profile_id) into ids from workspace_members where workspace_id = p_ws;

  -- интеграции - до кампаний: их триггер пересчитывает статус кампании,
  -- пока кабинет ещё существует. Остальное уходит каскадом вместе с кабинетом
  delete from integrations where workspace_id = p_ws;
  delete from workspaces where id = p_ws;

  -- участникам сразу открываем другой их кабинет (current_workspace_id обнулился каскадом)
  update profiles p
  set current_workspace_id = (
    select m.workspace_id from workspace_members m
    where m.profile_id = p.id and m.is_active
    order by m.created_at limit 1)
  where p.id = any(ids) and p.current_workspace_id is null;
end $$;

revoke execute on function public.delete_workspace(uuid, text) from public, anon;
grant execute on function public.delete_workspace(uuid, text) to authenticated;
