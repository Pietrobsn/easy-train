-- EASY TRAIN — RESET DE DESENVOLVIMENTO (DESTRUTIVO)
-- APAGA todos os dados do Easy Train, mas preserva os usuários em auth.users.
-- Use apenas se você realmente quer recomeçar o projeto do zero.

begin;

-- Remove a estrutura nova.
drop schema if exists easy_train_private cascade;

-- Remove tabelas públicas deixadas pelas versões antigas.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'easy_train_%'
  loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;
end $$;

-- Remove funções públicas antigas e atuais pelo nome.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'easy_train_%'
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;
end $$;

drop trigger if exists easy_train_on_auth_user_created on auth.users;

commit;
