-- =====================================================================
--  012: правки по второму аудиту
--  - колонки доски задач меняют только учредители (как и списки блогеров)
--  - счётчики комментариев и вложений на доске считает база, а не браузер
--  - название агентства доступно страницам без входа (страница входа, превью ссылок)
--  - почта в профиле обновляется, когда человек сменил почту для входа
--  - ещё раз пробуем включить запрет «один блогер — одна интеграция в кампании»
--    и, если мешают повторы, перечисляем их
--  Запускать после 008–011. Можно запускать повторно.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Колонки доски: видят все, меняют учредители
-- ---------------------------------------------------------------------
drop policy if exists task_sections_write on public.task_sections;
create policy task_sections_write on public.task_sections for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Счётчики на карточках задач: только числа, по правам того, кто смотрит
-- ---------------------------------------------------------------------
create or replace function public.task_counts()
returns table (task_id uuid, comments int, files int)
language sql stable security invoker set search_path = public as $$
  select t.id,
         (select count(*)::int from task_comments c where c.task_id = t.id),
         (select count(*)::int from task_files f where f.task_id = t.id)
  from tasks t
  where exists (select 1 from task_comments c where c.task_id = t.id)
     or exists (select 1 from task_files f where f.task_id = t.id);
$$;
grant execute on function public.task_counts() to authenticated;

-- ---------------------------------------------------------------------
--  Название агентства для страниц без входа. Только название, остальные настройки закрыты
-- ---------------------------------------------------------------------
create or replace function public.public_agency_name()
returns text
language sql stable security definer set search_path = public as $$
  select agency_name from settings limit 1;
$$;
grant execute on function public.public_agency_name() to anon, authenticated;

-- ---------------------------------------------------------------------
--  Сменили почту для входа — меняется и почта в профиле (её видят коллеги в «Команде»)
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ---------------------------------------------------------------------
--  Один блогер — одна интеграция в кампании
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select 1 from pg_indexes where indexname = 'integrations_blogger_campaign_uniq') then
    return;
  end if;
  if not exists (select 1 from integrations where campaign_id is not null
                 group by blogger_id, campaign_id having count(*) > 1) then
    create unique index integrations_blogger_campaign_uniq
      on public.integrations (blogger_id, campaign_id) where campaign_id is not null;
    raise notice 'Запрет повторов включён';
    return;
  end if;
  raise notice 'Запрет повторов не включён: блогер стоит в кампании дважды. Удалите лишнюю интеграцию и запустите файл ещё раз:';
  for r in
    select b.nick, c.name as campaign, count(*) as n
    from integrations i
    join bloggers b on b.id = i.blogger_id
    join campaigns c on c.id = i.campaign_id
    group by b.nick, c.name, i.blogger_id, i.campaign_id
    having count(*) > 1
  loop
    raise notice '  % в кампании «%»: % шт.', r.nick, r.campaign, r.n;
  end loop;
end $$;
