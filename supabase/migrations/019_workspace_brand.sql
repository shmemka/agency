-- =====================================================================
--  019: логотип и брендовый цвет кабинета
--
--  Учредитель загружает логотип (SVG или PNG) - он стоит в меню вместо
--  значка и названия агентства. Брендовый цвет заменяет зелёный акцент сайта.
--  Пока ничего не выбрано, всё выглядит как раньше.
--
--  Запускать после 018. Можно запускать повторно.
--  Сайт можно публиковать до миграции: без неё логотип и цвет просто
--  не сохранятся, остальное работает.
-- =====================================================================

begin;

alter table public.workspaces add column if not exists logo_url text;
alter table public.workspaces add column if not exists brand_color text;

alter table public.workspaces drop constraint if exists workspaces_brand_color_check;
alter table public.workspaces add constraint workspaces_brand_color_check
  check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');

-- список кабинетов теперь отдаёт и оформление: меню рисуется сразу в нужном виде
drop function if exists public.my_workspaces();
create function public.my_workspaces()
returns table (id uuid, name text, role text, is_active boolean, deactivated_at timestamptz, logo_url text, brand_color text)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, m.role, m.is_active, m.deactivated_at, w.logo_url, w.brand_color
  from workspace_members m join workspaces w on w.id = m.workspace_id
  where m.profile_id = auth.uid()
  order by m.created_at
$$;
revoke execute on function public.my_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated;

-- Публичный бакет для логотипов: до 1 МБ, SVG, PNG, WebP и JPG.
-- Файлы лежат в logos/<id кабинета>/..., менять их может только учредитель этого кабинета
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists logos_select on storage.objects;
create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos');

drop policy if exists logos_insert on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_ws()::text and public.is_admin());

drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_ws()::text and public.is_admin());

drop policy if exists logos_delete on storage.objects;
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_ws()::text and public.is_admin());

commit;
