-- =====================================================================
--  006: предложение о сотрудничестве для блогера
--  - новый статус блогера «Отправили предложение» (offer_sent), идёт после «В базе»
--  - таблица offers: персональная ссылка на страницу-приглашение
--  - get_offer / reply_offer: страница открывается без входа, по токену
--  Запускать после 002–005. Можно запускать повторно.
-- =====================================================================

-- статус блогера
alter table public.bloggers drop constraint if exists bloggers_status_check;
alter table public.bloggers add constraint bloggers_status_check
  check (status in ('in_base', 'offer_sent', 'verified', 'worked', 'blacklist'));

-- вышла первая интеграция — блогер становится «Работали» (теперь и из «Отправили предложение»)
create or replace function public.blogger_worked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'done') then
    update bloggers set status = 'worked' where id = new.blogger_id and status in ('in_base', 'offer_sent', 'verified');
  end if;
  return new;
end $$;

-- предложения
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  blogger_id     uuid not null references public.bloggers(id) on delete cascade,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  views          integer not null default 0,
  first_seen_at  timestamptz,
  last_seen_at   timestamptz,
  reply_contact  text,
  reply_text     text,
  replied_at     timestamptz
);
create index if not exists offers_blogger_idx on public.offers (blogger_id, created_at desc);

alter table public.offers enable row level security;
grant select, insert, delete on public.offers to authenticated;

-- видно и можно создать тем, кто видит самого блогера
drop policy if exists offers_select on public.offers;
drop policy if exists offers_insert on public.offers;
drop policy if exists offers_delete on public.offers;
create policy offers_select on public.offers for select
  using (public.is_member() and exists (select 1 from public.bloggers b where b.id = blogger_id));
create policy offers_insert on public.offers for insert
  with check (public.is_member() and created_by = auth.uid()
              and exists (select 1 from public.bloggers b where b.id = blogger_id));
create policy offers_delete on public.offers for delete
  using (public.is_admin() or created_by = auth.uid());

-- страница предложения: только ник, площадка, фото и менеджер. Цены и контакты блогера не отдаём
create or replace function public.get_offer(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o offers; b bloggers; m profiles;
begin
  select * into o from offers where token = p_token;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into b from bloggers where id = o.blogger_id;
  select * into m from profiles where id = coalesce(o.created_by, b.owner_id);

  -- просмотры считаем только у гостей, а не у команды, которая проверяет ссылку
  if auth.uid() is null then
    update offers set views = views + 1,
                      first_seen_at = coalesce(first_seen_at, now()),
                      last_seen_at = now()
    where id = o.id;
  end if;

  return jsonb_build_object(
    'agency', (select agency_name from settings),
    'nick', b.nick,
    'platform', b.platform,
    'avatar_url', b.avatar_url,
    'manager', m.full_name,
    'manager_avatar', m.avatar_url,
    'replied', o.replied_at is not null);
end $$;

create or replace function public.reply_offer(p_token text, p_contact text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o offers; b bloggers;
begin
  if coalesce(btrim(p_contact), '') = '' then return jsonb_build_object('error', 'no_contact'); end if;
  update offers set reply_contact = left(btrim(p_contact), 200),
                    reply_text = nullif(left(btrim(coalesce(p_text, '')), 2000), ''),
                    replied_at = now()
  where token = p_token
  returning * into o;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into b from bloggers where id = o.blogger_id;

  if coalesce(o.created_by, b.owner_id) is not null then
    perform public.notify(coalesce(o.created_by, b.owner_id), 'offer',
                          b.nick || ' откликнулся на предложение', '/bloggers/' || b.id, 'offer-' || o.id);
  else
    perform public.notify_admins('offer', b.nick || ' откликнулся на предложение', '/bloggers/' || b.id, 'offer-' || o.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.get_offer(text) to anon, authenticated;
grant execute on function public.reply_offer(text, text, text) to anon, authenticated;
