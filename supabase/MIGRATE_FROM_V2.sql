-- EASY TRAIN — MIGRAÇÃO OPCIONAL DA VERSÃO 2.0/2.1
-- Rode APÓS INSTALL_ALL.sql no mesmo projeto antigo.
-- Copia os dados das tabelas public.easy_train_* para easy_train_private.*.
-- Não apaga as tabelas antigas. Faça backup antes.

begin;

do $$
begin
  if to_regclass('public.easy_train_profiles') is not null then
    execute $copy$
      insert into easy_train_private.profiles(
        id, display_name, username, bio, avatar_url, created_at, updated_at
      )
      select id, display_name, easy_train_private.make_unique_username(username::text, id), coalesce(bio, ''), avatar_url, created_at, updated_at
      from public.easy_train_profiles
      on conflict (id) do update set
        display_name = excluded.display_name,
        username = excluded.username,
        bio = excluded.bio,
        avatar_url = excluded.avatar_url,
        updated_at = greatest(easy_train_private.profiles.updated_at, excluded.updated_at)
    $copy$;
  end if;

  if to_regclass('public.easy_train_user_states') is not null then
    execute $copy$
      insert into easy_train_private.user_states(user_id, state, state_version, updated_at)
      select user_id, state, 13, updated_at
      from public.easy_train_user_states
      where state is not null and jsonb_typeof(state) = 'object'
        and octet_length(state::text) <= 2097152
      on conflict (user_id) do update set
        state = case
          when excluded.state <> '{}'::jsonb then excluded.state
          else easy_train_private.user_states.state
        end,
        state_version = 15,
        updated_at = greatest(easy_train_private.user_states.updated_at, excluded.updated_at)
    $copy$;
  end if;

  if to_regclass('public.easy_train_collab_requests') is not null then
    execute $copy$
      insert into easy_train_private.collab_requests(
        id, requester_id, addressee_id, status, created_at, responded_at
      )
      select id, requester_id, addressee_id, status, created_at, responded_at
      from public.easy_train_collab_requests
      on conflict (id) do nothing
    $copy$;
  end if;

  if to_regclass('public.easy_train_shared_plans') is not null then
    execute $copy$
      insert into easy_train_private.shared_plans(
        id, sender_id, recipient_id, title, plan, status, created_at, imported_at
      )
      select id, sender_id, recipient_id, title, plan, status, created_at, imported_at
      from public.easy_train_shared_plans
      where octet_length(plan::text) <= 262144
      on conflict (id) do nothing
    $copy$;
  end if;

  if to_regclass('public.easy_train_competitions') is not null then
    execute $copy$
      insert into easy_train_private.competitions(
        id, creator_id, title, description, metric, start_date, end_date,
        invite_code, status, created_at
      )
      select id, creator_id, title, description, metric, start_date,
        least(end_date, start_date + 365), upper(invite_code::text), status, created_at
      from public.easy_train_competitions
      on conflict (id) do nothing
    $copy$;
  end if;

  if to_regclass('public.easy_train_competition_members') is not null then
    execute $copy$
      insert into easy_train_private.competition_members(
        competition_id, user_id, status, joined_at, created_at
      )
      select competition_id, user_id, status, joined_at, created_at
      from public.easy_train_competition_members
      on conflict (competition_id, user_id) do update set
        status = excluded.status,
        joined_at = excluded.joined_at
    $copy$;
  end if;

  if to_regclass('public.easy_train_workout_events') is not null then
    execute $copy$
      insert into easy_train_private.workout_events(
        user_id, session_id, workout_id, workout_title, completed_at, local_date,
        total_volume, new_prs, duration_seconds, created_at
      )
      select user_id, left(session_id, 100), left(workout_id, 100), left(workout_title, 100),
        completed_at, completed_at::date, least(greatest(total_volume, 0), 50000000),
        least(greatest(new_prs, 0), 100),
        least(greatest(duration_seconds, 0), 21600), created_at
      from public.easy_train_workout_events
      where char_length(session_id) between 8 and 100
      on conflict (user_id, session_id) do nothing
    $copy$;
  end if;
end $$;

do $$
declare r record;
begin
  for r in select id from easy_train_private.profiles loop
    perform easy_train_private.rebuild_stats(r.id);
  end loop;
end $$;

commit;

select
  (select count(*) from easy_train_private.profiles) as profiles,
  (select count(*) from easy_train_private.user_states where state <> '{}'::jsonb) as states_with_data,
  (select count(*) from easy_train_private.workout_events) as workout_events;
