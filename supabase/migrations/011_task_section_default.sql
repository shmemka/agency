-- =====================================================================
--  011: у каждой задачи есть колонка
--  Задачи без колонки показывались в первой колонке доски. Когда первую колонку
--  перетаскивали, они «переезжали» вместе с местом. Теперь колонка пишется в задачу сразу:
--  при создании (в том числе из карточки блогера) и когда её колонку удаляют.
--  Запускать после 008. Можно запускать повторно.
-- =====================================================================

create or replace function public.task_section_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.section_id is null then
    select id into new.section_id from task_sections order by position limit 1;
  end if;
  return new;
end $$;

drop trigger if exists tasks_section_default on public.tasks;
create trigger tasks_section_default before insert or update of section_id on public.tasks
  for each row execute function public.task_section_default();

-- задачи, у которых колонки ещё нет, кладём в текущую первую колонку
update public.tasks set section_id = (select id from public.task_sections order by position limit 1)
where section_id is null;
