-- =====================================================================
--  016: статусы блогера
--
--  1. Статуса «Откликнулся» больше нет. Его ставил сам отклик на персональное
--     предложение, а предложения отключены в 013. Блогеры с этим статусом
--     переходят в offer_sent (на сайте он теперь называется «Предложили»).
--     Перенос не попадает в историю и не меняет дату правки блогера.
--  2. Список допустимых статусов и правило «Работали после первого выхода»
--     больше не знают про replied.
--
--  Запускать после 015. Можно запускать повторно.
-- =====================================================================

begin;

alter table public.bloggers disable trigger bloggers_log;
alter table public.bloggers disable trigger bloggers_touch;
update public.bloggers set status = 'offer_sent' where status = 'replied';
alter table public.bloggers enable trigger bloggers_log;
alter table public.bloggers enable trigger bloggers_touch;

alter table public.bloggers drop constraint if exists bloggers_status_check;
alter table public.bloggers add constraint bloggers_status_check
  check (status in ('in_base', 'offer_sent', 'verified', 'worked', 'blacklist'));

create or replace function public.blogger_worked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'done') then
    update bloggers set status = 'worked'
    where id = new.blogger_id and status in ('in_base', 'offer_sent', 'verified');
  end if;
  return new;
end $$;

commit;
