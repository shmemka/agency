-- =====================================================================
--  007: статус кампании ставится сам
--  Планируем → Идёт, как только клиент одобрил хотя бы одного блогера («Берём»)
--           → Завершена, когда все одобренные интеграции закрыты
--  «На паузе», «Завершена» и «Отменена» автоматика не трогает: их можно поставить вручную,
--  а «Завершена» после автоматического завершения так и остаётся. Вернуть автоматику —
--  выбрать «Автоматически» в карточке кампании (сохраняется как planning и пересчитывается).
--  Запускать после 002–006. Можно запускать повторно.
-- =====================================================================

create or replace function public.campaign_auto_status(p_campaign uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when count(*) = 0 then 'planning'
    when bool_and(i.status = 'done') then 'done'
    else 'active' end
  from integrations i
  where i.campaign_id = p_campaign and i.client_decision = 'approved' and i.status <> 'declined'
$$;

-- любой «автоматический» статус при сохранении кампании пересчитывается
create or replace function public.campaign_status_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('paused', 'done', 'cancelled') then
    new.status := public.campaign_auto_status(new.id);
  end if;
  return new;
end $$;

drop trigger if exists campaigns_status_auto on public.campaigns;
create trigger campaigns_status_auto before insert or update on public.campaigns
  for each row execute function public.campaign_status_auto();

-- интеграция поменялась — пересчитываем статус её кампании
create or replace function public.integration_campaign_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if tg_op = 'DELETE' then ids := array[old.campaign_id];
  elsif tg_op = 'INSERT' then ids := array[new.campaign_id];
  else ids := array[old.campaign_id, new.campaign_id];
  end if;
  update campaigns c set status = public.campaign_auto_status(c.id)
  where c.id = any(ids) and c.status not in ('paused', 'done', 'cancelled')
    and c.status is distinct from public.campaign_auto_status(c.id);
  return null;
end $$;

drop trigger if exists integrations_campaign_status on public.integrations;
create trigger integrations_campaign_status
  after insert or delete or update of status, client_decision, campaign_id on public.integrations
  for each row execute function public.integration_campaign_status();

-- пересчитать то, что уже есть
update public.campaigns c set status = public.campaign_auto_status(c.id)
where c.status not in ('paused', 'done', 'cancelled')
  and c.status is distinct from public.campaign_auto_status(c.id);
