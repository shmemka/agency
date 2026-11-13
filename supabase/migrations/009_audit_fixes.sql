-- =====================================================================
--  009: исправления по аудиту
--  - клиент не может снять «Берём», когда с блогером уже оформляют документы
--  - один блогер — одна интеграция в кампании
--  - закрытый доступ отличается от новой регистрации (deactivated_at)
--  - статус блогера «Откликнулся»: ставится сам, когда блогер ответил на предложение
--  - «молчит N дн.» считается от смены этапа (status_changed_at)
--  - уведомление о задаче ведёт на саму задачу
--  - права: свой документ можно удалить; кандидата из подборки убирает и ведущий кампании;
--    правка задач и интеграций проверяется так же строго, как создание;
--    вложение к задаче кладётся только в папку видимой задачи
--  Запускать после 003–008. Можно запускать повторно.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Подборка: решение клиента замораживается, когда пошли документы
-- ---------------------------------------------------------------------
create or replace function public.decision_locked(s text) returns boolean
language sql immutable as $$
  select s in ('waiting_details', 'waiting_contract', 'waiting_signature', 'waiting_payment', 'paid', 'published', 'done')
$$;

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
      'decision', i.client_decision, 'comment', i.client_comment,
      'locked', public.decision_locked(i.status)
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
  select * into i from integrations where id = p_integration and campaign_id = s.campaign_id and client_decision <> 'none';
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  -- с блогером уже оформляют документы или он вышел: решение меняет только менеджер
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
                          '/campaigns/' || c.id, 'decision-' || c.id);
  else
    perform public.notify_admins('client', 'Клиент отметил выбор в подборке «' || c.name || '»',
                                 '/campaigns/' || c.id, 'decision-' || c.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.get_share(text) to anon, authenticated;
grant execute on function public.set_share_decision(text, uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  Один блогер — одна интеграция в кампании.
--  Если повторы уже есть, индекс не создаётся: сначала уберите их на странице кампании
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.integrations where campaign_id is not null
             group by blogger_id, campaign_id having count(*) > 1) then
    raise notice 'Есть повторы блогеров в кампаниях — запрет повторов не включён';
  else
    create unique index if not exists integrations_blogger_campaign_uniq
      on public.integrations (blogger_id, campaign_id) where campaign_id is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Закрытый доступ
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists deactivated_at timestamptz;

create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active
          or new.deactivated_at is distinct from old.deactivated_at) then
    raise exception 'Только админ может менять роль и доступ';
  end if;
  return new;
end $$;

-- новая регистрация: сообщаем, только если это не человек с закрытым доступом
create or replace function public.notify_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = new.id;
  if found and not p.is_active and p.deactivated_at is null then
    perform public.notify_admins('team', coalesce(p.full_name, p.email) || ' ждёт доступа', '/team', 'signup-' || new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
--  Блогер откликнулся на предложение
-- ---------------------------------------------------------------------
alter table public.bloggers drop constraint if exists bloggers_status_check;
alter table public.bloggers add constraint bloggers_status_check
  check (status in ('in_base', 'offer_sent', 'replied', 'verified', 'worked', 'blacklist'));

create or replace function public.blogger_worked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'done') then
    update bloggers set status = 'worked'
    where id = new.blogger_id and status in ('in_base', 'offer_sent', 'replied', 'verified');
  end if;
  return new;
end $$;

create or replace function public.reply_offer(p_token text, p_contact text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o offers; b bloggers;
begin
  if coalesce(btrim(p_contact), '') = '' then return jsonb_build_object('error', 'no_contact'); end if;
  select * into o from offers where token = p_token;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  -- не чаще раза в минуту: защита от случайных повторов и спама
  if o.replied_at is not null and o.replied_at > now() - interval '1 minute' then
    return jsonb_build_object('error', 'too_often');
  end if;
  update offers set reply_contact = left(btrim(p_contact), 200),
                    reply_text = nullif(left(btrim(coalesce(p_text, '')), 2000), ''),
                    replied_at = now()
  where id = o.id
  returning * into o;
  select * into b from bloggers where id = o.blogger_id;
  update bloggers set status = 'replied' where id = b.id and status in ('in_base', 'offer_sent');

  if coalesce(o.created_by, b.owner_id) is not null then
    perform public.notify(coalesce(o.created_by, b.owner_id), 'offer',
                          b.nick || ' откликнулся на предложение', '/bloggers/' || b.id, 'offer-' || o.id);
  else
    perform public.notify_admins('offer', b.nick || ' откликнулся на предложение', '/bloggers/' || b.id, 'offer-' || o.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.reply_offer(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  Когда интеграция последний раз сменила этап
-- ---------------------------------------------------------------------
alter table public.integrations add column if not exists status_changed_at timestamptz;
update public.integrations set status_changed_at = updated_at where status_changed_at is null;
alter table public.integrations alter column status_changed_at set default now();

create or replace function public.integration_status_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists integrations_status_touch on public.integrations;
create trigger integrations_status_touch before insert or update of status on public.integrations
  for each row execute function public.integration_status_touch();

-- ---------------------------------------------------------------------
--  Уведомление о задаче ведёт на неё саму
-- ---------------------------------------------------------------------
create or replace function public.task_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task', 'Вам поставили задачу: ' || new.title, '/tasks/' || new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
--  Права
-- ---------------------------------------------------------------------
-- свой документ может удалить тот, кто его загрузил
drop policy if exists v2_documents_delete on public.documents;
create policy v2_documents_delete on public.documents for delete
  using (public.is_admin() or (public.is_member() and uploaded_by = auth.uid()));

drop policy if exists documents_bucket_delete on storage.objects;
create policy documents_bucket_delete on storage.objects for delete
  using (bucket_id = 'documents' and (public.is_admin() or owner_id = auth.uid()::text));

-- кандидата из подборки (ещё не одобренного) может убрать и тот, кто ведёт кампанию
drop policy if exists v2_integrations_delete on public.integrations;
create policy v2_integrations_delete on public.integrations for delete
  using (public.is_admin() or (public.is_member() and campaign_id is not null and client_decision <> 'approved'
         and exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())));

-- правка проверяется так же, как создание
drop policy if exists v2_tasks_update on public.tasks;
create policy v2_tasks_update on public.tasks for update
  using (public.is_admin() or (public.is_member() and (assignee_id = auth.uid() or created_by = auth.uid())))
  with check (public.is_admin() or (public.is_member() and (assignee_id is null or assignee_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = assignee_id and p.role = 'admin' and p.is_active))));

drop policy if exists v2_integrations_update on public.integrations;
create policy v2_integrations_update on public.integrations for update
  using (public.is_member() and (public.is_admin() or owner_id = auth.uid()
         or (campaign_id is not null and public.sees_campaign(campaign_id))
         or exists (select 1 from public.bloggers b where b.id = blogger_id and b.owner_id = auth.uid())))
  with check (public.is_member() and (campaign_id is null or public.sees_campaign(campaign_id)));

-- вложение к задаче — только в папку задачи, которую человек видит
drop policy if exists task_files_bucket_insert on storage.objects;
create policy task_files_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.is_member()
              and exists (select 1 from public.tasks t where t.id::text = split_part(name, '/', 1)));
