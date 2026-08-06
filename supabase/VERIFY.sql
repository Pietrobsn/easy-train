-- EASY TRAIN — VERIFICAÇÃO PÓS-INSTALAÇÃO
-- Este arquivo não altera dados. Ele falha cedo quando encontra uma configuração insegura.

do $$
declare
  v_missing text[];
begin
  if to_regnamespace('easy_train_private') is null then
    raise exception 'Schema easy_train_private não encontrado. Rode INSTALL_ALL.sql primeiro.';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'easy_train_private'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ) then
    raise exception 'Existe tabela interna sem RLS habilitado.';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'easy_train_private'
      and c.relkind in ('r', 'p')
      and (
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
      )
  ) then
    raise exception 'Existe acesso direto indevido às tabelas internas.';
  end if;

  select array_agg(required_name order by required_name) into v_missing
  from unnest(array[
    'easy_train_username_available',
    'easy_train_get_my_bootstrap',
    'easy_train_save_my_state',
    'easy_train_update_my_profile',
    'easy_train_search_people',
    'easy_train_send_collab_request',
    'easy_train_respond_collab_request',
    'easy_train_get_collab_dashboard',
    'easy_train_share_plan',
    'easy_train_mark_share_imported',
    'easy_train_create_competition',
    'easy_train_join_competition',
    'easy_train_respond_competition',
    'easy_train_get_competitions'
  ]) required_name
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = required_name
  );

  if v_missing is not null then
    raise exception 'RPCs ausentes: %', array_to_string(v_missing, ', ');
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'easy_train_%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname <> 'easy_train_username_available'
  ) then
    raise exception 'Uma RPC autenticada está exposta para anon.';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'easy_train_%'
      and p.proname <> 'easy_train_username_available'
      and (
        not p.prosecdef
        or not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
        )
      )
  ) then
    raise exception 'Existe RPC sem SECURITY DEFINER ou search_path protegido.';
  end if;
end $$;

select
  'PASS' as status,
  'Schema, RLS, grants e RPCs essenciais verificados.' as message;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_has_direct_access,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_can_write_directly
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'easy_train_private' and c.relkind in ('r', 'p')
order by c.relname;

select
  p.proname as rpc_name,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'easy_train_%'
order by p.proname;

select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from easy_train_private.profiles) as profiles,
  (select count(*) from easy_train_private.user_states) as user_states,
  (select count(*) from easy_train_private.workout_events) as workout_events;
