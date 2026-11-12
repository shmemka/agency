-- =====================================================================
--  Агентство — схема базы для Supabase
--  Запустить один раз: Supabase → SQL Editor → New query → вставить → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Справочник статусов (общий для блогеров и интеграций)
-- ---------------------------------------------------------------------
create or replace function public.valid_status(s text) returns boolean
language sql immutable as $$
  select s in (
    'new',               -- Новый
    'contacted',         -- Написали
    'waiting_reply',     -- Жду ответ
    'negotiating',       -- Переговоры
    'agreed',            -- Согласовано
    'waiting_details',   -- Жду реквизиты
    'waiting_contract',  -- Жду договор
    'waiting_signature', -- Жду подпись
    'waiting_payment',   -- На оплате
    'paid',              -- Оплачено
    'published',         -- Вышел
    'done',              -- Закрыт
    'declined',          -- Отказ
    'blacklist'          -- Чёрный список
  )
$$;

-- ---------------------------------------------------------------------
--  Профили специалистов (личные кабинеты)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'manager' check (role in ('admin', 'manager')),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Первый зарегистрированный становится админом и активен сразу.
-- Остальные ждут, пока админ включит их в разделе «Команда».
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    case when is_first then 'admin' else 'manager' end,
    is_first
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role = 'admin')
$$;

-- Менять роль и доступ может только админ (или SQL Editor)
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Только админ может менять роль и доступ';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------
--  Общий триггер updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
--  Клиенты и кампании
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact       text,
  inn           text,
  niche         text,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.clients(id) on delete set null,
  name            text not null,
  status          text not null default 'planning'
                  check (status in ('planning', 'active', 'paused', 'done', 'cancelled')),
  budget          numeric,
  commission_pct  numeric default 20,
  prepaid         boolean not null default false,
  start_date      date,
  end_date        date,
  brief           text,
  owner_id        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Блогеры
-- ---------------------------------------------------------------------
create table if not exists public.bloggers (
  id              uuid primary key default gen_random_uuid(),
  nick            text not null,
  nick_key        text generated always as (lower(btrim(nick))) stored,
  name            text,
  platform        text not null default 'tiktok'
                  check (platform in ('tiktok', 'youtube', 'telegram', 'vk', 'instagram', 'other')),
  url             text,
  topic           text,
  audience        text,
  content_type    text,
  city            text,
  followers       bigint,
  avg_reach       bigint,
  price           numeric,
  contact         text,
  email           text,
  phone           text,
  legal_status    text not null default 'unknown'
                  check (legal_status in ('self_employed', 'ip', 'ooo', 'individual', 'unknown')),
  rkn_registered  boolean,
  status          text not null default 'new' check (public.valid_status(status)),
  owner_id        uuid references public.profiles(id) on delete set null,
  next_action_at  date,
  tags            text[] not null default '{}',
  notes           text,
  source          text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bloggers_platform_nick unique (platform, nick_key)
);

create index if not exists bloggers_status_idx on public.bloggers (status);
create index if not exists bloggers_owner_idx on public.bloggers (owner_id);

drop trigger if exists bloggers_touch on public.bloggers;
create trigger bloggers_touch before update on public.bloggers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Интеграции (выходы)
-- ---------------------------------------------------------------------
create table if not exists public.integrations (
  id                uuid primary key default gen_random_uuid(),
  blogger_id        uuid not null references public.bloggers(id) on delete cascade,
  campaign_id       uuid references public.campaigns(id) on delete set null,
  publish_date      date,
  format            text,
  price             numeric,
  guaranteed_reach  bigint,
  fact_reach        bigint,
  status            text not null default 'negotiating' check (public.valid_status(status)),
  script_url        text,
  script_approved   boolean not null default false,
  ad_url            text,
  promo_code        text,
  erid              text,
  ord_registered    boolean not null default false,
  payments_count    integer,
  revenue           numeric,
  owner_id          uuid references public.profiles(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists integrations_blogger_idx on public.integrations (blogger_id);
create index if not exists integrations_campaign_idx on public.integrations (campaign_id);

drop trigger if exists integrations_touch on public.integrations;
create trigger integrations_touch before update on public.integrations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
--  Документы (файлы в Storage или внешние ссылки)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  blogger_id      uuid references public.bloggers(id) on delete cascade,
  integration_id  uuid references public.integrations(id) on delete set null,
  campaign_id     uuid references public.campaigns(id) on delete cascade,
  kind            text not null default 'other'
                  check (kind in ('contract', 'act', 'receipt', 'invoice', 'stats', 'brief', 'other')),
  name            text not null,
  storage_path    text,
  external_url    text,
  size            bigint,
  mime            text,
  uploaded_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists documents_blogger_idx on public.documents (blogger_id);

-- ---------------------------------------------------------------------
--  Лента событий: комментарии и смены статусов
-- ---------------------------------------------------------------------
create table if not exists public.activity (
  id              bigint generated always as identity primary key,
  blogger_id      uuid references public.bloggers(id) on delete cascade,
  integration_id  uuid references public.integrations(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null default auth.uid(),
  kind            text not null check (kind in ('comment', 'status', 'document', 'created')),
  body            text,
  from_status     text,
  to_status       text,
  created_at      timestamptz not null default now()
);

create index if not exists activity_blogger_idx on public.activity (blogger_id, created_at desc);

create or replace function public.log_blogger_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity (blogger_id, actor_id, kind, to_status)
    values (new.id, auth.uid(), 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.activity (blogger_id, actor_id, kind, from_status, to_status)
    values (new.id, auth.uid(), 'status', old.status, new.status);
  end if;
  return new;
end $$;

drop trigger if exists bloggers_log on public.bloggers;
create trigger bloggers_log after insert or update of status on public.bloggers
  for each row execute function public.log_blogger_status();

create or replace function public.log_integration_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.activity (blogger_id, integration_id, actor_id, kind, from_status, to_status)
    values (new.blogger_id, new.id, auth.uid(), 'status', old.status, new.status);
  end if;
  return new;
end $$;

drop trigger if exists integrations_log on public.integrations;
create trigger integrations_log after update of status on public.integrations
  for each row execute function public.log_integration_status();

create or replace function public.log_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- импорт через SQL Editor (без пользователя) в ленту не пишем
  if new.blogger_id is not null and auth.uid() is not null then
    insert into public.activity (blogger_id, integration_id, actor_id, kind, body)
    values (new.blogger_id, new.integration_id, auth.uid(), 'document', new.name);
  end if;
  return new;
end $$;

drop trigger if exists documents_log on public.documents;
create trigger documents_log after insert on public.documents
  for each row execute function public.log_document();

-- ---------------------------------------------------------------------
--  Доступ (RLS): видят и меняют данные только активные специалисты
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.clients      enable row level security;
alter table public.campaigns    enable row level security;
alter table public.bloggers     enable row level security;
alter table public.integrations enable row level security;
alter table public.documents    enable row level security;
alter table public.activity     enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_member());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['clients', 'campaigns', 'bloggers', 'integrations', 'documents'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format(
      'create policy %I_member_all on public.%I for all using (public.is_member()) with check (public.is_member())',
      t, t);
  end loop;
end $$;

drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select using (public.is_member());

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity for insert
  with check (public.is_member() and kind = 'comment' and actor_id = auth.uid());

drop policy if exists activity_delete on public.activity;
create policy activity_delete on public.activity for delete
  using (public.is_member() and kind = 'comment' and (actor_id = auth.uid() or public.is_admin()));

-- ---------------------------------------------------------------------
--  Хранилище файлов (договоры, акты, чеки, скрины)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists documents_bucket_select on storage.objects;
create policy documents_bucket_select on storage.objects for select
  using (bucket_id = 'documents' and public.is_member());

drop policy if exists documents_bucket_insert on storage.objects;
create policy documents_bucket_insert on storage.objects for insert
  with check (bucket_id = 'documents' and public.is_member());

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects for delete
  using (bucket_id = 'documents' and public.is_member());

-- ---------------------------------------------------------------------
--  Живое обновление: изменения коллег видны сразу
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.bloggers, public.integrations, public.activity;
  exception when duplicate_object then null;
  end;
end $$;
