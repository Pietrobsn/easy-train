-- EASY TRAIN — 03/03: SEGURANÇA, RLS E PERMISSÕES

begin;

alter table easy_train_private.profiles enable row level security;
alter table easy_train_private.user_states enable row level security;
alter table easy_train_private.user_stats enable row level security;
alter table easy_train_private.collab_requests enable row level security;
alter table easy_train_private.shared_plans enable row level security;
alter table easy_train_private.competitions enable row level security;
alter table easy_train_private.competition_members enable row level security;
alter table easy_train_private.workout_events enable row level security;
alter table easy_train_private.action_limits enable row level security;

-- Defesa em profundidade. O app acessa os dados pelas RPCs públicas,
-- mas estas políticas também impedem acesso cruzado se algum grant mudar no futuro.
drop policy if exists profiles_own on easy_train_private.profiles;
create policy profiles_own on easy_train_private.profiles
for all to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists states_own on easy_train_private.user_states;
create policy states_own on easy_train_private.user_states
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists stats_own on easy_train_private.user_stats;
create policy stats_own on easy_train_private.user_stats
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists collabs_participants on easy_train_private.collab_requests;
create policy collabs_participants on easy_train_private.collab_requests
for select to authenticated
using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists shares_participants on easy_train_private.shared_plans;
create policy shares_participants on easy_train_private.shared_plans
for select to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists competitions_members on easy_train_private.competitions;
create policy competitions_members on easy_train_private.competitions
for select to authenticated
using (
  creator_id = (select auth.uid())
  or exists (
    select 1
    from easy_train_private.competition_members m
    where m.competition_id = competitions.id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists competition_members_visible on easy_train_private.competition_members;
create policy competition_members_visible on easy_train_private.competition_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from easy_train_private.competition_members me
    where me.competition_id = competition_members.competition_id
      and me.user_id = (select auth.uid())
      and me.status in ('invited', 'accepted')
  )
);

drop policy if exists workout_events_own on easy_train_private.workout_events;
create policy workout_events_own on easy_train_private.workout_events
for select to authenticated
using (user_id = (select auth.uid()));

-- Nenhuma policy para action_limits: tabela exclusivamente interna.

-- Retira o acesso direto às tabelas, mesmo para usuários autenticados.
revoke all on schema easy_train_private from public, anon, authenticated;
revoke all on all tables in schema easy_train_private from public, anon, authenticated;
revoke all on all sequences in schema easy_train_private from public, anon, authenticated;
revoke all on all functions in schema easy_train_private from public, anon, authenticated;
alter default privileges in schema easy_train_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema easy_train_private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema easy_train_private revoke all on functions from public, anon, authenticated;


-- Bloqueia assinaturas e tabelas das versões antigas caso este SQL seja executado
-- no mesmo projeto. Os dados legados não são apagados automaticamente.
do $$
declare
  r record;
begin
  if to_regprocedure('public.easy_train_save_my_state(jsonb,jsonb)') is not null then
    execute 'revoke all on function public.easy_train_save_my_state(jsonb,jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.easy_train_update_my_profile(text,text,text)') is not null then
    execute 'revoke all on function public.easy_train_update_my_profile(text,text,text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.easy_train_get_public_state()') is not null then
    execute 'revoke all on function public.easy_train_get_public_state() from public, anon, authenticated';
  end if;
  if to_regprocedure('public.easy_train_save_public_state(jsonb)') is not null then
    execute 'revoke all on function public.easy_train_save_public_state(jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.easy_train_update_public_name(text)') is not null then
    execute 'revoke all on function public.easy_train_update_public_name(text) from public, anon, authenticated';
  end if;

  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'easy_train_%'
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', r.relname);
    execute format('alter table public.%I enable row level security', r.relname);
  end loop;
end $$;

-- RPCs públicas: primeiro revoga toda função Easy Train antiga ou atual,
-- inclusive overloads e helpers deixados pelas versões anteriores.
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
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

-- Libera somente as RPCs necessárias.
revoke all on function public.easy_train_username_available(text) from public, anon, authenticated;
revoke all on function public.easy_train_get_my_bootstrap() from public, anon, authenticated;
revoke all on function public.easy_train_save_my_state(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.easy_train_update_my_profile(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.easy_train_search_people(text) from public, anon, authenticated;
revoke all on function public.easy_train_send_collab_request(uuid) from public, anon, authenticated;
revoke all on function public.easy_train_respond_collab_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.easy_train_get_collab_dashboard() from public, anon, authenticated;
revoke all on function public.easy_train_share_plan(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.easy_train_mark_share_imported(uuid) from public, anon, authenticated;
revoke all on function public.easy_train_create_competition(text, text, text, date, date, uuid[]) from public, anon, authenticated;
revoke all on function public.easy_train_join_competition(text) from public, anon, authenticated;
revoke all on function public.easy_train_respond_competition(uuid, boolean) from public, anon, authenticated;
revoke all on function public.easy_train_get_competitions() from public, anon, authenticated;

grant execute on function public.easy_train_username_available(text) to anon, authenticated;
grant execute on function public.easy_train_get_my_bootstrap() to authenticated;
grant execute on function public.easy_train_save_my_state(jsonb, bigint) to authenticated;
grant execute on function public.easy_train_update_my_profile(text, text, text, boolean) to authenticated;
grant execute on function public.easy_train_search_people(text) to authenticated;
grant execute on function public.easy_train_send_collab_request(uuid) to authenticated;
grant execute on function public.easy_train_respond_collab_request(uuid, boolean) to authenticated;
grant execute on function public.easy_train_get_collab_dashboard() to authenticated;
grant execute on function public.easy_train_share_plan(uuid, jsonb, text) to authenticated;
grant execute on function public.easy_train_mark_share_imported(uuid) to authenticated;
grant execute on function public.easy_train_create_competition(text, text, text, date, date, uuid[]) to authenticated;
grant execute on function public.easy_train_join_competition(text) to authenticated;
grant execute on function public.easy_train_respond_competition(uuid, boolean) to authenticated;
grant execute on function public.easy_train_get_competitions() to authenticated;

commit;
