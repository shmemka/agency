-- =====================================================================
--  024: подборок для клиента больше нет
--
--  С клиентом о блогере договариваются сами, поэтому блогер в сделке сразу
--  в работе. Старые интеграции с решением клиента «не отправлено» и «ждём
--  решения» помечаются как взятые в работу: так цена для клиента, статус
--  сделки и комиссия считаются по ним, как по остальным.
--  Отклонённые клиентом не трогаются. Ничего не удаляется.
--  Перенос не попадает в историю и не меняет даты правок.
--
--  Можно запускать повторно. Сайт работает и до миграции, и после.
-- =====================================================================

begin;

alter table public.integrations disable trigger integrations_log;
alter table public.integrations disable trigger integrations_touch;
alter table public.integrations disable trigger integrations_status_touch;

update public.integrations set client_decision = 'approved' where client_decision in ('none', 'pending');

alter table public.integrations enable trigger integrations_log;
alter table public.integrations enable trigger integrations_touch;
alter table public.integrations enable trigger integrations_status_touch;

commit;
