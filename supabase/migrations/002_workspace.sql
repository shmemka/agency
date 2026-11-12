-- =====================================================================
--  No Name Agency — версия 2: права, статусы, подборки, задачи, финансы
--  Запускать ПОСЛЕ schema.sql. Повторный запуск безопасен.
--  Supabase → SQL Editor → New query → вставить → Run
-- =====================================================================

-- ---------------------------------------------------------------------
--  Настройки агентства (одна строка)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                  boolean primary key default true check (id),
  agency_name         text    not null default 'No Name Agency',
  default_markup_pct  numeric not null default 20,
  tax_org_pct         numeric not null default 6,
  tax_person_pct      numeric not null default 4,
  income_limit        numeric not null default 2400000,
  ord_deadline_days   integer not null default 30
);
insert into public.settings default values on conflict do nothing;

-- ---------------------------------------------------------------------
--  Кампании: наценка, команда, бюджет отдельно (его видят только учредители)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'campaigns' and column_name = 'markup_pct') then
    alter table public.campaigns add column markup_pct numeric not null default 20;
    update public.campaigns set markup_pct = coalesce(commission_pct, 20);
    -- архив из чужой таблицы: наценки там не было
    update public.campaigns set markup_pct = 0 where name = 'TikTok-выходы, август 2026';
  end if;
end $$;

create table if not exists public.campaign_members (
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (campaign_id, profile_id)
);

create table if not exists public.campaign_money (
  campaign_id  uuid primary key references public.campaigns(id) on delete cascade,
  budget       numeric
);
insert into public.campaign_money (campaign_id, budget)
  select id, budget from public.campaigns where budget is not null
  on conflict do nothing;
update public.campaigns set budget = null where budget is not null;

-- ---------------------------------------------------------------------
--  Блогеры: новые поля и короткий статус отношений
-- ---------------------------------------------------------------------
alter table public.bloggers
  add column if not exists blacklist_reason     text,
  add column if not exists stats_updated_at     timestamptz,
  add column if not exists audience_female_pct  numeric check (audience_female_pct between 0 and 100),
  add column if not exists audience_age         jsonb,
  add column if not exists clip_views           bigint;

-- ---------------------------------------------------------------------
--  Интеграции: цена для клиента, решение клиента, маркировка
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'integrations' and column_name = 'client_decision') then
    alter table public.integrations
      add column price_client         numeric,
      add column price_client_manual  boolean not null default false,
      add column client_decision      text not null default 'none'
                                      check (client_decision in ('none', 'pending', 'approved', 'rejected')),
      add column client_comment       text,
      add column client_decided_at    timestamptz,
      add column first_shown_at       date,
      add column ord_reported_at      timestamptz,
      add column ord_reported_by      uuid references public.profiles(id) on delete set null,
      add column marked_by            text not null default 'us' check (marked_by in ('us', 'client', 'blogger'));
    -- всё, что уже было в кампаниях, считаем согласованным с клиентом
    update public.integrations set client_decision = 'approved' where campaign_id is not null;
    update public.integrations set ord_reported_at = updated_at where ord_registered;
    -- архив из чужой таблицы: это закрытые выходы, маркировали их не мы
    update public.integrations set status = 'done', marked_by = 'client'
    where status = 'published'
      and campaign_id in (select id from public.campaigns where name = 'TikTok-выходы, август 2026');
  end if;
end $$;

-- Перенос статусов: воронка уходит в интеграции, у блогера остаётся статус отношений
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'bloggers_status_check' and pg_get_constraintdef(oid) like '%valid_status%') then
    alter table public.bloggers drop constraint bloggers_status_check;
    alter table public.bloggers disable trigger user;

    -- незавершённые переговоры без интеграции не теряем
    insert into public.integrations (blogger_id, status, price, owner_id, notes)
    select b.id, b.status, b.price, b.owner_id, 'Перенесено из статуса блогера'
    from public.bloggers b
    where b.status in ('contacted', 'waiting_reply', 'negotiating', 'agreed', 'waiting_details',
                       'waiting_contract', 'waiting_signature', 'waiting_payment', 'paid', 'declined')
      and not exists (select 1 from public.integrations i where i.blogger_id = b.id);

    update public.bloggers b set status = case
      when b.status = 'blacklist' then 'blacklist'
      when b.status in ('published', 'done')
        or exists (select 1 from public.integrations i
                   where i.blogger_id = b.id and i.status in ('published', 'done')) then 'worked'
      else 'in_base' end;

    alter table public.bloggers enable trigger user;
    alter table public.bloggers alter column status set default 'in_base';
    alter table public.bloggers add constraint bloggers_status_check
      check (status in ('in_base', 'verified', 'worked', 'blacklist'));
  end if;
end $$;

update public.integrations set status = 'declined' where status = 'blacklist';
alter table public.integrations alter column status set default 'new';

create or replace function public.valid_status(s text) returns boolean
language sql immutable as $$
  select s in ('new', 'contacted', 'waiting_reply', 'negotiating', 'agreed', 'waiting_details',
               'waiting_contract', 'waiting_signature', 'waiting_payment', 'paid', 'published', 'done', 'declined')
$$;

alter table public.documents add column if not exists hide_from_client boolean not null default false;

-- ---------------------------------------------------------------------
--  Задачи, уведомления, ссылки для клиента, финансы
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  assignee_id     uuid not null references public.profiles(id) on delete cascade,
  due_date        date,
  due_time        time,
  blogger_id      uuid references public.bloggers(id) on delete cascade,
  integration_id  uuid references public.integrations(id) on delete cascade,
  campaign_id     uuid references public.campaigns(id) on delete cascade,
  done_at         timestamptz,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, done_at);

create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  title       text not null,
  link        text,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_profile_idx on public.notifications (profile_id, read_at, created_at desc);
create unique index if not exists notifications_dedupe_idx
  on public.notifications (profile_id, dedupe_key) where read_at is null and dedupe_key is not null;

create table if not exists public.share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(gen_random_bytes(18), 'hex'),
  kind         text not null check (kind in ('shortlist', 'report')),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  revoked      boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.incomes (
  id           uuid primary key default gen_random_uuid(),
  paid_on      date not null default current_date,
  amount       numeric not null check (amount > 0),
  client_id    uuid references public.clients(id) on delete set null,
  campaign_id  uuid references public.campaigns(id) on delete set null,
  receiver_id  uuid references public.profiles(id) on delete set null,
  payer_type   text not null default 'org' check (payer_type in ('org', 'person')),
  has_receipt  boolean not null default false,
  receipt_url  text,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  paid_on     date not null default current_date,
  amount      numeric not null check (amount > 0),
  category    text,
  paid_by     uuid references public.profiles(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Кто что видит
-- ---------------------------------------------------------------------
create or replace function public.sees_campaign(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and (
    public.is_admin()
    or exists (select 1 from campaigns c where c.id = cid and c.owner_id = auth.uid())
    or exists (select 1 from campaign_members m where m.campaign_id = cid and m.profile_id = auth.uid())
  )
$$;

-- блогер попал к специалисту через интеграцию или кампанию
create or replace function public.blogger_shared(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from integrations i
    where i.blogger_id = bid
      and (i.owner_id = auth.uid() or (i.campaign_id is not null and public.sees_campaign(i.campaign_id)))
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

-- ответственный по умолчанию — тот, кто создаёт
create or replace function public.set_owner_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null and auth.uid() is not null and not public.is_admin() then
    new.owner_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists bloggers_owner_default on public.bloggers;
create trigger bloggers_owner_default before insert on public.bloggers
  for each row execute function public.set_owner_default();
drop trigger if exists integrations_owner_default on public.integrations;
create trigger integrations_owner_default before insert on public.integrations
  for each row execute function public.set_owner_default();

alter table public.settings         enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_money   enable row level security;
alter table public.tasks            enable row level security;
alter table public.notifications    enable row level security;
alter table public.share_links      enable row level security;
alter table public.incomes          enable row level security;
alter table public.expenses         enable row level security;

-- старые правила «все видят всё» убираем
drop policy if exists clients_member_all      on public.clients;
drop policy if exists campaigns_member_all    on public.campaigns;
drop policy if exists bloggers_member_all     on public.bloggers;
drop policy if exists integrations_member_all on public.integrations;
drop policy if exists documents_member_all    on public.documents;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public' and policyname like 'v2_%' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- блогеры
create policy v2_bloggers_select on public.bloggers for select
  using (public.is_member() and (public.is_admin() or owner_id = auth.uid() or public.blogger_shared(id)));
create policy v2_bloggers_insert on public.bloggers for insert
  with check (public.is_member() and (public.is_admin() or owner_id = auth.uid()));
create policy v2_bloggers_update on public.bloggers for update
  using (public.is_member() and (public.is_admin() or owner_id = auth.uid() or public.blogger_shared(id)))
  with check (public.is_member() and (public.is_admin() or owner_id = auth.uid() or public.blogger_shared(id)));
create policy v2_bloggers_delete on public.bloggers for delete using (public.is_admin());

-- интеграции
create policy v2_integrations_select on public.integrations for select
  using (public.is_member() and (public.is_admin() or owner_id = auth.uid()
         or (campaign_id is not null and public.sees_campaign(campaign_id))
         or exists (select 1 from public.bloggers b where b.id = blogger_id and b.owner_id = auth.uid())));
create policy v2_integrations_insert on public.integrations for insert
  with check (public.is_member() and public.sees_blogger(blogger_id)
              and (campaign_id is null or public.sees_campaign(campaign_id)));
create policy v2_integrations_update on public.integrations for update
  using (public.is_member() and (public.is_admin() or owner_id = auth.uid()
         or (campaign_id is not null and public.sees_campaign(campaign_id))
         or exists (select 1 from public.bloggers b where b.id = blogger_id and b.owner_id = auth.uid())))
  with check (public.is_member());
create policy v2_integrations_delete on public.integrations for delete using (public.is_admin());

-- кампании, их команда и бюджет
create policy v2_campaigns_select on public.campaigns for select using (public.sees_campaign(id));
create policy v2_campaigns_insert on public.campaigns for insert with check (public.is_admin());
create policy v2_campaigns_update on public.campaigns for update
  using (public.is_admin() or (public.is_member() and owner_id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and owner_id = auth.uid()));
create policy v2_campaigns_delete on public.campaigns for delete using (public.is_admin());

create policy v2_members_select on public.campaign_members for select using (public.sees_campaign(campaign_id));
create policy v2_members_write  on public.campaign_members for all
  using (public.is_admin()) with check (public.is_admin());

create policy v2_money_all on public.campaign_money for all
  using (public.is_admin()) with check (public.is_admin());

-- клиенты: специалист видит только клиентов своих кампаний
create policy v2_clients_select on public.clients for select
  using (public.is_admin() or (public.is_member()
         and exists (select 1 from public.campaigns c where c.client_id = clients.id)));
create policy v2_clients_write on public.clients for all
  using (public.is_admin()) with check (public.is_admin());

-- документы
create policy v2_documents_select on public.documents for select
  using (public.is_member() and (public.is_admin() or uploaded_by = auth.uid()
         or (blogger_id is not null and public.sees_blogger(blogger_id))
         or (campaign_id is not null and public.sees_campaign(campaign_id))));
create policy v2_documents_insert on public.documents for insert
  with check (public.is_member() and (public.is_admin()
         or (blogger_id is not null and public.sees_blogger(blogger_id))
         or (campaign_id is not null and public.sees_campaign(campaign_id))));
create policy v2_documents_update on public.documents for update
  using (public.is_member() and (public.is_admin() or uploaded_by = auth.uid()
         or (blogger_id is not null and public.sees_blogger(blogger_id))
         or (campaign_id is not null and public.sees_campaign(campaign_id))))
  with check (public.is_member());
create policy v2_documents_delete on public.documents for delete using (public.is_admin());

-- лента событий
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select
  using (public.is_admin() or (blogger_id is not null and public.sees_blogger(blogger_id)));
drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity for insert
  with check (kind = 'comment' and actor_id = auth.uid() and public.sees_blogger(blogger_id));

-- задачи: учредитель ставит любому, специалист — себе и учредителям
create policy v2_tasks_select on public.tasks for select
  using (public.is_admin() or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())));
create policy v2_tasks_insert on public.tasks for insert
  with check (public.is_admin() or (public.is_member() and (assignee_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = assignee_id and p.role = 'admin' and p.is_active))));
create policy v2_tasks_update on public.tasks for update
  using (public.is_admin() or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.is_member());
create policy v2_tasks_delete on public.tasks for delete
  using (public.is_admin() or (public.is_member() and created_by = auth.uid()));

-- уведомления: только свои
create policy v2_notifications_select on public.notifications for select using (profile_id = auth.uid());
create policy v2_notifications_update on public.notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ссылки для клиента
create policy v2_share_select on public.share_links for select using (public.sees_campaign(campaign_id));
create policy v2_share_insert on public.share_links for insert with check (public.sees_campaign(campaign_id));
create policy v2_share_update on public.share_links for update
  using (public.sees_campaign(campaign_id)) with check (public.sees_campaign(campaign_id));
create policy v2_share_delete on public.share_links for delete using (public.is_admin());

-- финансы и настройки
create policy v2_incomes_all  on public.incomes  for all using (public.is_admin()) with check (public.is_admin());
create policy v2_expenses_all on public.expenses for all using (public.is_admin()) with check (public.is_admin());
create policy v2_settings_select on public.settings for select using (public.is_member());
create policy v2_settings_update on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
--  Автоматика
-- ---------------------------------------------------------------------
create or replace function public.calc_price_client(p numeric, m numeric) returns numeric
language sql immutable as $$
  select case when p is null then null else ceil(p * (1 + coalesce(m, 0) / 100) / 100) * 100 end
$$;

-- цена для клиента = цена блогера + наценка кампании, пока её не поправили вручную
create or replace function public.integration_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare m numeric;
begin
  if new.campaign_id is not null and not new.price_client_manual then
    select markup_pct into m from campaigns where id = new.campaign_id;
    new.price_client := public.calc_price_client(new.price, m);
  end if;
  if new.first_shown_at is null and new.status in ('published', 'done') then
    new.first_shown_at := coalesce(new.publish_date, current_date);
  end if;
  return new;
end $$;

drop trigger if exists integrations_price on public.integrations;
create trigger integrations_price before insert or update on public.integrations
  for each row execute function public.integration_price();

create or replace function public.campaign_markup_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.markup_pct is distinct from old.markup_pct then
    update integrations set price_client = public.calc_price_client(price, new.markup_pct)
    where campaign_id = new.id and not price_client_manual;
  end if;
  return new;
end $$;

drop trigger if exists campaigns_markup on public.campaigns;
create trigger campaigns_markup after update on public.campaigns
  for each row execute function public.campaign_markup_changed();

-- вышла первая интеграция — блогер становится «Работали»
create or replace function public.blogger_worked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'done') then
    update bloggers set status = 'worked' where id = new.blogger_id and status in ('in_base', 'verified');
  end if;
  return new;
end $$;

drop trigger if exists integrations_worked on public.integrations;
create trigger integrations_worked after insert or update of status on public.integrations
  for each row execute function public.blogger_worked();

-- дата замера статистики
create or replace function public.blogger_stats_touch() returns trigger
language plpgsql as $$
begin
  if (new.followers, new.avg_reach, new.clip_views, new.audience_female_pct, new.audience_age)
     is distinct from (old.followers, old.avg_reach, old.clip_views, old.audience_female_pct, old.audience_age) then
    new.stats_updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists bloggers_stats on public.bloggers;
create trigger bloggers_stats before update on public.bloggers
  for each row execute function public.blogger_stats_touch();

-- предоплату отмечает учредитель: блогерам клиент платит напрямую, и сайт этих денег не видит
drop trigger if exists incomes_prepaid on public.incomes;

-- ---------------------------------------------------------------------
--  Уведомления
-- ---------------------------------------------------------------------
create or replace function public.notify(p_profile uuid, p_kind text, p_title text, p_link text, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_profile is null then return; end if;
  insert into notifications (profile_id, kind, title, link, dedupe_key)
  values (p_profile, p_kind, p_title, p_link, p_key)
  on conflict (profile_id, dedupe_key) where read_at is null and dedupe_key is not null
  do update set title = excluded.title, created_at = now();
end $$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_admins(p_kind text, p_title text, p_link text, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select id from profiles where role = 'admin' and is_active and id is distinct from auth.uid() loop
    perform public.notify(a.id, p_kind, p_title, p_link, p_key);
  end loop;
end $$;
revoke execute on function public.notify_admins(text, text, text, text) from public, anon, authenticated;

create or replace function public.task_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task', 'Вам поставили задачу: ' || new.title, '/tasks');
  end if;
  return new;
end $$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function public.task_notify();

create or replace function public.blogger_owner_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and new.owner_id is distinct from old.owner_id
     and new.owner_id is distinct from auth.uid() then
    perform public.notify(new.owner_id, 'assigned', 'Вам передали блогеров', '/bloggers?owner=me', 'bloggers-assigned');
  end if;
  return new;
end $$;

drop trigger if exists bloggers_owner_notify on public.bloggers;
create trigger bloggers_owner_notify after update of owner_id on public.bloggers
  for each row execute function public.blogger_owner_notify();

create or replace function public.member_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is distinct from auth.uid() then
    perform public.notify(new.profile_id, 'assigned',
      'Вас добавили в кампанию «' || (select name from campaigns where id = new.campaign_id) || '»',
      '/campaigns/' || new.campaign_id);
  end if;
  return new;
end $$;

drop trigger if exists members_notify on public.campaign_members;
create trigger members_notify after insert on public.campaign_members
  for each row execute function public.member_notify();

-- новая регистрация — сообщаем учредителям
create or replace function public.notify_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = new.id;
  if found and not p.is_active then
    perform public.notify_admins('team', coalesce(p.full_name, p.email) || ' ждёт доступа', '/team', 'signup-' || new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_notify on auth.users;
create trigger on_auth_user_notify after insert on auth.users
  for each row execute function public.notify_signup();

-- ---------------------------------------------------------------------
--  Проверка дублей по всей базе (не раскрывает чужие данные)
-- ---------------------------------------------------------------------
create or replace function public.existing_bloggers(p_keys text[])
returns table (key text, owner_name text, visible boolean)
language sql stable security definer set search_path = public as $$
  select b.platform || ':' || b.nick_key,
         coalesce(p.full_name, p.email, 'не назначен'),
         public.sees_blogger(b.id)
  from bloggers b left join profiles p on p.id = b.owner_id
  where public.is_member() and (b.platform || ':' || b.nick_key) = any (p_keys)
$$;

create or replace function public.request_blogger_access(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare b record; me text;
begin
  if not public.is_member() then raise exception 'нет доступа'; end if;
  select id, nick into b from bloggers where platform || ':' || nick_key = p_key;
  if not found then return; end if;
  select coalesce(full_name, email) into me from profiles where id = auth.uid();
  perform public.notify_admins('access', me || ' просит доступ к блогеру ' || b.nick,
                               '/bloggers/' || b.id, 'access-' || b.id || '-' || auth.uid());
end $$;

-- ---------------------------------------------------------------------
--  Страницы для клиента: подборка и отчёт по ссылке, без входа
--  Отдают только разрешённые поля: цены блогера и наценки здесь нет
-- ---------------------------------------------------------------------
create or replace function public.get_share(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s share_links; c campaigns; res jsonb; rows jsonb;
begin
  select * into s from share_links where token = p_token;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if s.revoked then return jsonb_build_object('error', 'revoked'); end if;
  select * into c from campaigns where id = s.campaign_id;

  res := jsonb_build_object(
    'kind', s.kind,
    'agency', (select agency_name from settings),
    'campaign', c.name,
    'client', (select name from clients where id = c.client_id),
    'start_date', c.start_date,
    'end_date', c.end_date);

  if s.kind = 'shortlist' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'nick', b.nick, 'name', b.name, 'url', b.url, 'platform', b.platform, 'topic', b.topic,
      'followers', b.followers, 'avg_reach', b.avg_reach,
      'female_pct', b.audience_female_pct, 'age', b.audience_age,
      'format', i.format, 'price', i.price_client,
      'decision', i.client_decision, 'comment', i.client_comment
    ) order by b.avg_reach desc nulls last), '[]'::jsonb) into rows
    from integrations i join bloggers b on b.id = i.blogger_id
    where i.campaign_id = c.id and i.client_decision <> 'none' and i.status <> 'declined';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'date', i.publish_date, 'nick', b.nick, 'url', b.url, 'platform', b.platform,
      'ad_url', i.ad_url, 'price', i.price_client, 'guaranteed_reach', i.guaranteed_reach,
      'fact_reach', i.fact_reach, 'erid', i.erid,
      'shots', (select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'path', d.storage_path, 'url', d.external_url)), '[]'::jsonb)
                from documents d where d.integration_id = i.id and d.kind = 'stats' and not d.hide_from_client)
    ) order by i.publish_date), '[]'::jsonb) into rows
    from integrations i join bloggers b on b.id = i.blogger_id
    where i.campaign_id = c.id and i.status in ('published', 'done');
    res := res || jsonb_build_object(
      'planned', (select count(*) from integrations i where i.campaign_id = c.id
                  and i.client_decision = 'approved' and i.status <> 'declined'),
      'budget', (select budget from campaign_money where campaign_id = c.id));
  end if;
  return res || jsonb_build_object('rows', rows);
end $$;

create or replace function public.set_share_decision(p_token text, p_integration uuid, p_decision text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s share_links; c campaigns; i integrations;
begin
  select * into s from share_links where token = p_token and kind = 'shortlist' and not revoked;
  if not found then return jsonb_build_object('error', 'revoked'); end if;
  if p_decision not in ('pending', 'approved', 'rejected') then return jsonb_build_object('error', 'bad_decision'); end if;
  update integrations set client_decision = p_decision,
                          client_comment = nullif(left(btrim(coalesce(p_comment, '')), 500), ''),
                          client_decided_at = now()
  where id = p_integration and campaign_id = s.campaign_id and client_decision <> 'none'
  returning * into i;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select * into c from campaigns where id = s.campaign_id;
  if c.owner_id is not null then
    perform public.notify(c.owner_id, 'client', 'Клиент отметил выбор в подборке «' || c.name || '»',
                          '/campaigns/' || c.id, 'decision-' || c.id);
  else
    perform public.notify_admins('client', 'Клиент отметил выбор в подборке «' || c.name || '»',
                                 '/campaigns/' || c.id, 'decision-' || c.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.get_share(text) to anon, authenticated;
grant execute on function public.set_share_decision(text, uuid, text, text) to anon, authenticated;

-- скрин статистики можно открыть без входа, только пока жива ссылка на отчёт кампании
create or replace function public.share_shot_visible(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents d
    join integrations i on i.id = d.integration_id
    join share_links s on s.campaign_id = i.campaign_id and s.kind = 'report' and not s.revoked
    where d.storage_path = p_path and d.kind = 'stats' and not d.hide_from_client)
$$;

-- ---------------------------------------------------------------------
--  Файлы: скачать можно только документ, который тебе виден
-- ---------------------------------------------------------------------
drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select on storage.objects for select
  using (bucket_id = 'documents' and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.documents d where d.storage_path = objects.name)
    or public.share_shot_visible(name)));

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects for delete
  using (bucket_id = 'documents' and public.is_admin());

-- ---------------------------------------------------------------------
--  Живое обновление
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tasks', 'notifications', 'campaigns', 'documents'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
