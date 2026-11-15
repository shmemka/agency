-- =====================================================================
--  021: пустые интеграции и статус «Предложили»
--
--  Блогеры - справочник, работа идёт в кампаниях. Поэтому:
--  1. Пустые интеграции (этап «Новый», без кампании, даты, цены, erid, ссылок,
--     заметок, документов и задач) удаляются. Комментарии из них переезжают
--     в карточку блогера, а не пропадают.
--  2. Если блогеру уже предложили работу (статус «Предложили»), его пустая
--     интеграция не удаляется, а переходит на этап «Написали»: факт предложения
--     теперь живёт в этапе интеграции.
--  3. Статус блогера «Предложили» убирается: такие блогеры становятся «В базе».
--  Переносы не попадают в историю и не меняют даты правок.
--
--  Удаляет данные - запускается только с согласия владельца (получено).
--  Запускать после 020. Можно запускать повторно.
-- =====================================================================

begin;

create temporary table empty_int on commit drop as
select i.id, i.blogger_id, b.status as blogger_status, b.updated_at as offered_at
from public.integrations i
join public.bloggers b on b.id = i.blogger_id
where i.status = 'new' and i.campaign_id is null and i.publish_date is null
  and i.price is null and i.price_client is null and i.erid is null
  and i.fact_reach is null and i.guaranteed_reach is null
  and coalesce(i.notes, '') = '' and coalesce(i.promo_code, '') = ''
  and coalesce(i.ad_url, '') = '' and coalesce(i.script_url, '') = ''
  and not exists (select 1 from public.documents d where d.integration_id = i.id)
  and not exists (select 1 from public.tasks t where t.integration_id = i.id);

alter table public.integrations disable trigger integrations_log;
alter table public.integrations disable trigger integrations_touch;
alter table public.integrations disable trigger integrations_status_touch;

-- 2. предложение блогеру - теперь этап интеграции «Написали»
update public.integrations i
set status = 'contacted', status_changed_at = e.offered_at
from empty_int e
where e.id = i.id and e.blogger_status = 'offer_sent';

alter table public.integrations enable trigger integrations_log;
alter table public.integrations enable trigger integrations_touch;
alter table public.integrations enable trigger integrations_status_touch;

-- 1. комментарии остаются у блогера, интеграция удаляется
update public.activity a
set integration_id = null
from empty_int e
where a.integration_id = e.id and e.blogger_status <> 'offer_sent' and a.kind = 'comment';

delete from public.integrations i
using empty_int e
where e.id = i.id and e.blogger_status <> 'offer_sent';

-- 3. статуса «Предложили» больше нет
alter table public.bloggers disable trigger bloggers_log;
alter table public.bloggers disable trigger bloggers_touch;
update public.bloggers set status = 'in_base' where status = 'offer_sent';
alter table public.bloggers enable trigger bloggers_log;
alter table public.bloggers enable trigger bloggers_touch;

alter table public.bloggers drop constraint if exists bloggers_status_check;
alter table public.bloggers add constraint bloggers_status_check
  check (status in ('in_base', 'verified', 'worked', 'blacklist'));

create or replace function public.blogger_worked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'done') then
    update bloggers set status = 'worked'
    where id = new.blogger_id and status in ('in_base', 'verified');
  end if;
  return new;
end $$;

commit;
