-- Возраст блогера. Запускать в SQL Editor после 003_avatars.sql. Повторный запуск безопасен.
alter table public.bloggers add column if not exists age smallint;
alter table public.bloggers drop constraint if exists bloggers_age_check;
alter table public.bloggers add constraint bloggers_age_check check (age is null or age between 5 and 100);
