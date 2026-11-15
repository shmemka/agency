-- =====================================================================
--  020: подборки и отчёты для клиента - в оформлении агентства
--
--  get_share дополнительно отдаёт логотип и брендовый цвет кабинета
--  (их добавила миграция 019). Клиент видит тот же логотип и цвет, что и команда.
--
--  Запускать после 019. Можно запускать повторно.
--  Сайт можно публиковать до миграции: без неё страницы клиента остаются в цветах «Сверки».
-- =====================================================================

do $$
declare src text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name = 'brand_color') then
    raise exception 'Сначала запустите миграцию 019_workspace_brand.sql';
  end if;
  select pg_get_functiondef('public.get_share(text)'::regprocedure) into src;
  -- уже запускали
  if position('''logo''' in src) > 0 then return; end if;
  if position('(select name from workspaces where id = c.workspace_id)' in src) = 0 then
    raise exception 'get_share изменилась, обновите миграцию';
  end if;
  execute replace(src, '(select name from workspaces where id = c.workspace_id)',
    '(select name from workspaces where id = c.workspace_id),
    ''logo'', (select logo_url from workspaces where id = c.workspace_id),
    ''brand'', (select brand_color from workspaces where id = c.workspace_id)');
end $$;
