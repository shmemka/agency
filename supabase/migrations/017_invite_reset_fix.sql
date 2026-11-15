-- =====================================================================
--  017: не создавалась новая ссылка-приглашение
--
--  «function gen_random_bytes(integer) does not exist»: в Supabase расширение
--  pgcrypto лежит в схеме extensions, а функция reset_invite ищет только в public.
--  Берём gen_random_uuid() - она встроена в Postgres и не зависит от расширений.
--  Ссылка, как и раньше, из 24 символов.
--
--  Запускать после 016. Можно запускать повторно.
-- =====================================================================

create or replace function public.reset_invite() returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'Ссылку меняют учредители'; end if;
  update workspace_invites set token = left(replace(gen_random_uuid()::text, '-', ''), 24), created_at = now()
  where workspace_id = public.current_ws() returning token into t;
  return t;
end $$;

alter table public.workspace_invites alter column token set default left(replace(gen_random_uuid()::text, '-', ''), 24);
