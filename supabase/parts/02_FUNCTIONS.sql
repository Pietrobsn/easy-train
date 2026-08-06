-- EASY TRAIN — 02/03: FUNÇÕES E REGRAS DE NEGÓCIO

begin;

create or replace function easy_train_private.clean_username(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    trim(both '_' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9_]+', '_', 'g')),
    24
  )
$$;

create or replace function easy_train_private.make_unique_username(p_requested text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := easy_train_private.clean_username(p_requested);
  v_try text;
  v_counter integer := 0;
begin
  if char_length(v_base) < 3 then v_base := 'atleta'; end if;
  -- Serializa cadastros concorrentes que pedirem o mesmo @usuário.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(v_base), 0));
  v_try := v_base;

  while exists (
    select 1
    from easy_train_private.profiles p
    where lower(p.username) = lower(v_try)
      and p.id <> p_user_id
  ) loop
    v_counter := v_counter + 1;
    v_try := left(v_base, greatest(3, 18 - length(v_counter::text)))
      || '_' || right(replace(p_user_id::text, '-', ''), 3) || v_counter::text;
  end loop;

  return v_try;
end;
$$;

create or replace function easy_train_private.assert_active_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'Sessão necessária.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from easy_train_private.profiles p
    where p.id = p_user_id and p.account_status = 'active'
  ) then
    raise exception 'Conta indisponível.' using errcode = '42501';
  end if;
end;
$$;

create or replace function easy_train_private.assert_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_window timestamptz;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Configuração de limite inválida.';
  end if;

  insert into easy_train_private.action_limits(user_id, action_name, window_started_at, hits)
  values (p_user_id, p_action, now(), 1)
  on conflict (user_id, action_name) do update
  set
    window_started_at = case
      when easy_train_private.action_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then now()
      else easy_train_private.action_limits.window_started_at
    end,
    hits = case
      when easy_train_private.action_limits.window_started_at
        <= now() - make_interval(secs => p_window_seconds)
      then 1
      else easy_train_private.action_limits.hits + 1
    end
  returning hits, window_started_at into v_hits, v_window;

  if v_hits > p_limit then
    raise exception 'Muitas ações em pouco tempo. Aguarde e tente novamente.'
      using errcode = 'P0001', hint = 'RATE_LIMIT';
  end if;
end;
$$;

create or replace function easy_train_private.validate_plan(p_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_day jsonb;
  v_exercise jsonb;
  v_muscle jsonb;
  v_days integer;
  v_exercises integer;
  v_sets integer;
  v_min integer;
  v_max integer;
  v_rest integer;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Ficha inválida.';
  end if;
  if octet_length(p_plan::text) > 262144 then
    raise exception 'A ficha ficou grande demais.';
  end if;

  if jsonb_typeof(coalesce(p_plan -> 'days', '[]'::jsonb)) <> 'array' then
    raise exception 'A lista de treinos é inválida.';
  end if;

  v_days := jsonb_array_length(coalesce(p_plan -> 'days', '[]'::jsonb));
  if v_days > 14 then
    raise exception 'Uma ficha pode ter no máximo 14 dias.';
  end if;

  for v_day in select value from jsonb_array_elements(coalesce(p_plan -> 'days', '[]'::jsonb)) loop
    if jsonb_typeof(v_day) <> 'object' then raise exception 'Dia de treino inválido.'; end if;
    if coalesce(v_day ->> 'id', '') !~ '^[A-Za-z0-9_-]{3,100}$' then
      raise exception 'Identificador do treino inválido.';
    end if;
    if char_length(btrim(coalesce(v_day ->> 'title', ''))) not between 1 and 60 then
      raise exception 'Nome do treino inválido.';
    end if;
    if coalesce(v_day ->> 'title', '') ~ '[<>]' then
      raise exception 'O nome do treino contém caracteres não permitidos.';
    end if;
    if jsonb_typeof(coalesce(v_day -> 'exercises', '[]'::jsonb)) <> 'array' then
      raise exception 'Lista de exercícios inválida.';
    end if;

    v_exercises := jsonb_array_length(coalesce(v_day -> 'exercises', '[]'::jsonb));
    if v_exercises not between 1 and 40 then
      raise exception 'Cada dia deve ter entre 1 e 40 exercícios.';
    end if;

    for v_exercise in select value from jsonb_array_elements(coalesce(v_day -> 'exercises', '[]'::jsonb)) loop
      if jsonb_typeof(v_exercise) <> 'object' then raise exception 'Exercício inválido.'; end if;
      if coalesce(v_exercise ->> 'id', '') !~ '^[A-Za-z0-9_-]{3,100}$' then
        raise exception 'Identificador de exercício inválido.';
      end if;
      if char_length(btrim(coalesce(v_exercise ->> 'name', ''))) not between 1 and 80 then
        raise exception 'Nome de exercício inválido.';
      end if;
      if coalesce(v_exercise ->> 'name', '') ~ '[<>]' then
        raise exception 'O nome do exercício contém caracteres não permitidos.';
      end if;
      if char_length(coalesce(v_exercise ->> 'tip', '')) > 240 then
        raise exception 'Dica de exercício muito longa.';
      end if;
      if jsonb_typeof(coalesce(v_exercise -> 'muscles', '[]'::jsonb)) <> 'array' then
        raise exception 'Lista de músculos inválida.';
      end if;
      if jsonb_array_length(coalesce(v_exercise -> 'muscles', '[]'::jsonb)) > 8 then
        raise exception 'Muitos grupos musculares em um exercício.';
      end if;
      for v_muscle in select value from jsonb_array_elements(coalesce(v_exercise -> 'muscles', '[]'::jsonb)) loop
        if jsonb_typeof(v_muscle) <> 'string' or char_length(trim(both '"' from v_muscle::text)) > 40 then
          raise exception 'Grupo muscular inválido.';
        end if;
      end loop;

      begin
        v_sets := coalesce((v_exercise ->> 'sets')::integer, 1);
        v_min := coalesce((v_exercise ->> 'minReps')::integer, 1);
        v_max := coalesce((v_exercise ->> 'maxReps')::integer, v_min);
        v_rest := coalesce((v_exercise ->> 'restSeconds')::integer, 60);
      exception when others then
        raise exception 'Séries, repetições ou descanso inválidos.';
      end;

      if v_sets not between 1 and 20 then raise exception 'Séries devem ficar entre 1 e 20.'; end if;
      if v_min not between 1 and 100 or v_max not between v_min and 100 then
        raise exception 'Faixa de repetições inválida.';
      end if;
      if v_rest not between 0 and 900 then raise exception 'Descanso deve ficar entre 0 e 900 segundos.'; end if;
    end loop;
  end loop;
end;
$$;

create or replace function easy_train_private.validate_state(p_state jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sessions integer;
  v_activity_dates integer;
  v_histories integer;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Estado inválido.';
  end if;
  if octet_length(p_state::text) > 2097152 then
    raise exception 'Seus dados ultrapassaram o limite de sincronização.';
  end if;

  perform easy_train_private.validate_plan(coalesce(p_state -> 'workoutPlan', '{}'::jsonb));

  if jsonb_typeof(coalesce(p_state -> 'sessions', '[]'::jsonb)) <> 'array' then
    raise exception 'Histórico inválido.';
  end if;
  v_sessions := jsonb_array_length(coalesce(p_state -> 'sessions', '[]'::jsonb));
  if v_sessions > 500 then
    raise exception 'O histórico local ultrapassou 500 sessões.';
  end if;

  if p_state ? 'activeSession'
    and p_state -> 'activeSession' <> 'null'::jsonb
    and jsonb_typeof(p_state -> 'activeSession') <> 'object' then
    raise exception 'Sessão ativa inválida.';
  end if;

  if jsonb_typeof(coalesce(p_state -> 'activityDates', '[]'::jsonb)) <> 'array' then
    raise exception 'Calendário inválido.';
  end if;
  v_activity_dates := jsonb_array_length(coalesce(p_state -> 'activityDates', '[]'::jsonb));
  if v_activity_dates > 1000 then
    raise exception 'O calendário ultrapassou o limite permitido.';
  end if;

  if jsonb_typeof(coalesce(p_state -> 'exerciseHistory', '{}'::jsonb)) <> 'object' then
    raise exception 'Histórico de exercícios inválido.';
  end if;
  select count(*) into v_histories
  from jsonb_object_keys(coalesce(p_state -> 'exerciseHistory', '{}'::jsonb));
  if v_histories > 250 then
    raise exception 'Muitos exercícios no histórico.';
  end if;
end;
$$;

create or replace function easy_train_private.calculate_session_volume(p_session jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_exercise jsonb;
  v_set jsonb;
  v_weight numeric;
  v_reps numeric;
  v_total numeric := 0;
begin
  if jsonb_typeof(coalesce(p_session -> 'exercises', '{}'::jsonb)) <> 'object' then
    return 0;
  end if;

  for v_exercise in select value from jsonb_each(coalesce(p_session -> 'exercises', '{}'::jsonb)) loop
    if jsonb_typeof(coalesce(v_exercise -> 'sets', '[]'::jsonb)) <> 'array' then continue; end if;
    for v_set in select value from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb)) loop
      begin
        if lower(coalesce(v_set ->> 'done', 'false')) not in ('true', 'false') then
          raise exception 'Estado de série inválido.';
        end if;
        if coalesce((v_set ->> 'done')::boolean, false) then
          v_weight := greatest(0, least(10000, coalesce((v_set ->> 'weight')::numeric, 0)));
          v_reps := greatest(0, least(1000, coalesce((v_set ->> 'reps')::numeric, 0)));
          v_total := least(50000000, v_total + (v_weight * v_reps));
        end if;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Peso, repetições ou estado de série inválidos.';
      end;
    end loop;
  end loop;

  return round(v_total, 2);
end;
$$;

create or replace function easy_train_private.sync_workout_events(p_user_id uuid, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session jsonb;
  v_session_id text;
  v_completed_at timestamptz;
  v_started_at timestamptz;
  v_local_date date;
  v_volume numeric;
  v_prs integer;
  v_duration integer;
  v_paused integer;
  v_created_at timestamptz;
  v_new_events integer := 0;
  v_daily_events integer;
begin
  select p.created_at into v_created_at
  from easy_train_private.profiles p where p.id = p_user_id;

  for v_session in
    select value from jsonb_array_elements(coalesce(p_state -> 'sessions', '[]'::jsonb))
  loop
    v_session_id := left(coalesce(v_session ->> 'id', ''), 100);
    if char_length(v_session_id) < 8 or nullif(v_session ->> 'completedAt', '') is null then
      continue;
    end if;

    -- Eventos concluídos são imutáveis. Isso evita reescrever rankings antigos.
    if exists (
      select 1 from easy_train_private.workout_events e
      where e.user_id = p_user_id and e.session_id = v_session_id
    ) then
      continue;
    end if;

    begin
      v_completed_at := (v_session ->> 'completedAt')::timestamptz;
      v_started_at := nullif(v_session ->> 'startedAt', '')::timestamptz;
      v_local_date := coalesce(nullif(v_session ->> 'localDate', '')::date, v_completed_at::date);
      v_volume := easy_train_private.calculate_session_volume(v_session);
      v_prs := greatest(0, least(100, coalesce((v_session #>> '{summary,newPRs}')::integer, 0)));
      v_paused := greatest(0, least(21600, coalesce((v_session ->> 'pausedSeconds')::integer, 0)));
      if v_started_at is null or v_started_at > v_completed_at then
        raise exception 'Horário de início inválido.';
      end if;
      v_duration := greatest(0, least(21600,
        floor(extract(epoch from (v_completed_at - v_started_at)))::integer - v_paused
      ));
    exception when others then
      raise exception 'Uma sessão concluída possui dados inválidos.';
    end;

    if v_completed_at > now() + interval '5 minutes' then
      raise exception 'Uma sessão não pode ser concluída no futuro.';
    end if;
    if abs(v_local_date - v_completed_at::date) > 1 then
      raise exception 'A data local da sessão não corresponde ao horário informado.';
    end if;
    if v_created_at is not null and v_completed_at < v_created_at - interval '1 day' then
      continue;
    end if;

    v_new_events := v_new_events + 1;
    if v_new_events > 20 then
      raise exception 'Muitas sessões novas foram enviadas de uma vez. Sincronize com mais frequência.';
    end if;

    select count(*) into v_daily_events
    from easy_train_private.workout_events e
    where e.user_id = p_user_id and e.local_date = v_local_date;
    if v_daily_events >= 8 then
      raise exception 'Limite diário de sessões concluídas atingido.';
    end if;

    insert into easy_train_private.workout_events(
      user_id, session_id, workout_id, workout_title, completed_at, local_date,
      total_volume, new_prs, duration_seconds
    ) values (
      p_user_id,
      v_session_id,
      nullif(left(coalesce(v_session ->> 'workoutId', ''), 100), ''),
      left(coalesce(
        nullif(v_session #>> '{summary,workoutTitle}', ''),
        nullif(v_session #>> '{snapshot,workoutTitle}', ''),
        'Treino'
      ), 100),
      v_completed_at,
      v_local_date,
      v_volume,
      v_prs,
      v_duration
    );
  end loop;
end;
$$;

create or replace function easy_train_private.rebuild_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dates date[];
  v_current integer := 0;
  v_best integer := 0;
  v_running integer := 0;
  v_index integer;
  v_previous date;
begin
  select array_agg(d order by d desc) into v_dates
  from (
    select distinct e.local_date d
    from easy_train_private.workout_events e
    where e.user_id = p_user_id
  ) dates;

  if coalesce(array_length(v_dates, 1), 0) > 0 then
    if v_dates[1] >= current_date - 1 then
      v_current := 1;
      if array_length(v_dates, 1) >= 2 then
        for v_index in 2..array_length(v_dates, 1) loop
          exit when v_dates[v_index - 1] - v_dates[v_index] <> 1;
          v_current := v_current + 1;
        end loop;
      end if;
    end if;

    v_previous := null;
    for v_index in reverse array_length(v_dates, 1)..1 loop
      if v_previous is null or v_dates[v_index] - v_previous = 1 then
        v_running := v_running + 1;
      else
        v_running := 1;
      end if;
      v_best := greatest(v_best, v_running);
      v_previous := v_dates[v_index];
    end loop;
  end if;

  insert into easy_train_private.user_stats(
    user_id, workouts_count, weekly_workouts, total_volume,
    current_streak, best_streak, prs_count, last_workout_at, updated_at
  )
  select
    p_user_id,
    count(*)::integer,
    count(*) filter (where e.local_date >= date_trunc('week', current_date)::date)::integer,
    coalesce(sum(e.total_volume), 0),
    v_current,
    v_best,
    coalesce(sum(e.new_prs), 0)::integer,
    max(e.completed_at),
    now()
  from easy_train_private.workout_events e
  where e.user_id = p_user_id
  on conflict (user_id) do update set
    workouts_count = excluded.workouts_count,
    weekly_workouts = excluded.weekly_workouts,
    total_volume = excluded.total_volume,
    current_streak = excluded.current_streak,
    best_streak = excluded.best_streak,
    prs_count = excluded.prs_count,
    last_workout_at = excluded.last_workout_at,
    updated_at = now();
end;
$$;

create or replace function easy_train_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'Atleta'
  );

  v_username := easy_train_private.make_unique_username(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.id
  );

  insert into easy_train_private.profiles(id, display_name, username)
  values (new.id, left(v_name, 80), v_username)
  on conflict (id) do update set
    display_name = excluded.display_name,
    updated_at = now();

  insert into easy_train_private.user_states(user_id, state)
  values (new.id, jsonb_build_object('version', 15))
  on conflict (user_id) do nothing;

  insert into easy_train_private.user_stats(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger de cadastro.
drop trigger if exists easy_train_on_auth_user_created on auth.users;
create trigger easy_train_on_auth_user_created
after insert on auth.users
for each row execute procedure easy_train_private.handle_new_user();

-- Backfill para contas criadas antes da instalação.
do $$
declare
  r record;
  v_name text;
  v_username text;
begin
  for r in select id, email, raw_user_meta_data from auth.users loop
    v_name := coalesce(
      nullif(btrim(r.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(r.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(r.email, '@', 1), ''),
      'Atleta'
    );
    v_username := easy_train_private.make_unique_username(
      coalesce(r.raw_user_meta_data ->> 'username', split_part(r.email, '@', 1)),
      r.id
    );

    insert into easy_train_private.profiles(id, display_name, username)
    values (r.id, left(v_name, 80), v_username)
    on conflict (id) do nothing;
    insert into easy_train_private.user_states(user_id, state)
    values (r.id, jsonb_build_object('version', 15)) on conflict do nothing;
    insert into easy_train_private.user_stats(user_id)
    values (r.id) on conflict do nothing;
  end loop;
end $$;

-- =========================================================
-- RPCs EXPOSTAS AO APLICATIVO
-- =========================================================

create or replace function public.easy_train_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    char_length(easy_train_private.clean_username(p_username)) between 3 and 24
    and not exists (
      select 1 from easy_train_private.profiles p
      where lower(p.username) = lower(easy_train_private.clean_username(p_username))
    )
$$;

create or replace function public.easy_train_get_my_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  perform easy_train_private.assert_active_user(v_uid);

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'username', p.username,
      'bio', p.bio,
      'avatar_url', p.avatar_url,
      'discoverable', p.discoverable
    ),
    'state', coalesce(s.state, '{}'::jsonb),
    'state_revision', coalesce(s.revision, 1),
    'stats', to_jsonb(st) - 'user_id'
  ) into v_result
  from easy_train_private.profiles p
  left join easy_train_private.user_states s on s.user_id = p.id
  left join easy_train_private.user_stats st on st.user_id = p.id
  where p.id = v_uid;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.easy_train_save_my_state(
  p_state jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_version integer := 1;
  v_current_revision bigint;
  v_new_revision bigint;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'save_state', 180, 60);
  perform easy_train_private.validate_state(p_state);

  begin
    if coalesce(p_state ->> 'version', '') ~ '^[0-9]{1,4}$' then
      v_version := greatest(1, least(1000, (p_state ->> 'version')::integer));
    end if;
  exception when others then
    v_version := 1;
  end;

  select s.revision into v_current_revision
  from easy_train_private.user_states s
  where s.user_id = v_uid
  for update;

  if v_current_revision is null then
    insert into easy_train_private.user_states(user_id, state, state_version, revision, updated_at)
    values (v_uid, p_state, v_version, 1, now())
    returning revision into v_new_revision;
  else
    if p_expected_revision is not null and p_expected_revision <> v_current_revision then
      raise exception 'Seus dados foram alterados em outro dispositivo. Recarregue antes de salvar novamente.'
        using errcode = '40001', hint = 'STATE_CONFLICT';
    end if;

    update easy_train_private.user_states
    set state = p_state,
        state_version = v_version,
        revision = revision + 1,
        updated_at = now()
    where user_id = v_uid
    returning revision into v_new_revision;
  end if;

  perform easy_train_private.sync_workout_events(v_uid, p_state);
  perform easy_train_private.rebuild_stats(v_uid);

  return jsonb_build_object(
    'state', p_state,
    'revision', v_new_revision,
    'saved_at', now()
  );
end;
$$;

create or replace function public.easy_train_update_my_profile(
  p_display_name text,
  p_username text,
  p_bio text default '',
  p_discoverable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_username text := easy_train_private.clean_username(p_username);
  v_profile easy_train_private.profiles;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'update_profile', 20, 3600);

  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'Informe um nome válido.';
  end if;
  if char_length(v_username) not between 3 and 24 then
    raise exception 'O @usuário precisa ter entre 3 e 24 caracteres.';
  end if;
  if exists (
    select 1 from easy_train_private.profiles p
    where lower(p.username) = lower(v_username) and p.id <> v_uid
  ) then
    raise exception 'Esse @usuário já está em uso.' using errcode = '23505';
  end if;

  update easy_train_private.profiles
  set display_name = left(btrim(p_display_name), 80),
      username = v_username,
      bio = left(coalesce(p_bio, ''), 180),
      discoverable = coalesce(p_discoverable, true),
      updated_at = now()
  where id = v_uid
  returning * into v_profile;

  return jsonb_build_object(
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'username', v_profile.username,
    'bio', v_profile.bio,
    'discoverable', v_profile.discoverable
  );
end;
$$;

create or replace function public.easy_train_search_people(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := left(btrim(coalesce(p_query, '')), 30);
  v_result jsonb;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'search_people', 30, 60);

  if char_length(v_query) < 2 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name), '[]'::jsonb)
  into v_result
  from (
    select p.id, p.display_name, p.username, p.bio,
      case
        when r.status = 'accepted' then 'friend'
        when r.status = 'pending' and r.requester_id = v_uid then 'sent'
        when r.status = 'pending' and r.addressee_id = v_uid then 'received'
        else 'none'
      end relationship
    from easy_train_private.profiles p
    left join lateral (
      select cr.*
      from easy_train_private.collab_requests cr
      where (cr.requester_id = v_uid and cr.addressee_id = p.id)
         or (cr.addressee_id = v_uid and cr.requester_id = p.id)
      order by cr.created_at desc
      limit 1
    ) r on true
    where p.id <> v_uid
      and p.account_status = 'active'
      and p.discoverable = true
      and (
        p.username ilike '%' || easy_train_private.clean_username(v_query) || '%'
        or p.display_name ilike '%' || v_query || '%'
      )
    limit 12
  ) x;

  return v_result;
end;
$$;

create or replace function public.easy_train_send_collab_request(p_target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_total integer;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'send_collab', 20, 3600);

  if p_target_user = v_uid then raise exception 'Você não pode adicionar a si mesmo.'; end if;
  if not exists (
    select 1 from easy_train_private.profiles p
    where p.id = p_target_user and p.account_status = 'active' and p.discoverable = true
  ) then raise exception 'Pessoa não encontrada.'; end if;

  select count(*) into v_total
  from easy_train_private.collab_requests r
  where (r.requester_id = v_uid or r.addressee_id = v_uid)
    and r.status = 'accepted';
  if v_total >= 200 then raise exception 'Limite de 200 collabs atingido.'; end if;

  if exists (
    select 1 from easy_train_private.collab_requests r
    where ((r.requester_id = v_uid and r.addressee_id = p_target_user)
       or (r.requester_id = p_target_user and r.addressee_id = v_uid))
      and r.status in ('pending', 'accepted')
  ) then raise exception 'Já existe uma solicitação ou collab com essa pessoa.'; end if;

  insert into easy_train_private.collab_requests(requester_id, addressee_id)
  values (v_uid, p_target_user)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.easy_train_respond_collab_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'respond_collab', 30, 3600);

  update easy_train_private.collab_requests
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = p_request_id and addressee_id = v_uid and status = 'pending'
  returning status into v_status;

  if v_status is null then raise exception 'Solicitação não encontrada.'; end if;
  return jsonb_build_object('status', v_status);
end;
$$;

create or replace function public.easy_train_get_collab_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  perform easy_train_private.assert_active_user(v_uid);

  select jsonb_build_object(
    'received', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at,
        'user', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username)
      ) order by r.created_at desc)
      from easy_train_private.collab_requests r
      join easy_train_private.profiles p on p.id = r.requester_id
      where r.addressee_id = v_uid and r.status = 'pending'
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at,
        'user', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username)
      ) order by r.created_at desc)
      from easy_train_private.collab_requests r
      join easy_train_private.profiles p on p.id = r.addressee_id
      where r.requester_id = v_uid and r.status = 'pending'
    ), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'username', p.username, 'bio', p.bio,
        'stats', jsonb_build_object(
          'workouts_count', coalesce(s.workouts_count, 0),
          'weekly_workouts', coalesce(s.weekly_workouts, 0),
          'current_streak', coalesce(s.current_streak, 0),
          'total_volume', coalesce(s.total_volume, 0),
          'prs_count', coalesce(s.prs_count, 0)
        )
      ) order by p.display_name)
      from (
        select case when r.requester_id = v_uid then r.addressee_id else r.requester_id end friend_id
        from easy_train_private.collab_requests r
        where (r.requester_id = v_uid or r.addressee_id = v_uid) and r.status = 'accepted'
      ) f
      join easy_train_private.profiles p on p.id = f.friend_id and p.account_status = 'active'
      left join easy_train_private.user_stats s on s.user_id = p.id
    ), '[]'::jsonb),
    'received_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'title', sp.title, 'plan', sp.plan, 'status', sp.status,
        'created_at', sp.created_at,
        'sender', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username)
      ) order by sp.created_at desc)
      from easy_train_private.shared_plans sp
      join easy_train_private.profiles p on p.id = sp.sender_id
      where sp.recipient_id = v_uid and sp.status = 'shared'
    ), '[]'::jsonb),
    'sent_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'title', sp.title, 'status', sp.status,
        'created_at', sp.created_at,
        'recipient', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username)
      ) order by sp.created_at desc)
      from easy_train_private.shared_plans sp
      join easy_train_private.profiles p on p.id = sp.recipient_id
      where sp.sender_id = v_uid
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.easy_train_share_plan(p_target_user uuid, p_plan jsonb, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'share_plan', 20, 3600);
  perform easy_train_private.validate_plan(p_plan);

  if not exists (
    select 1 from easy_train_private.collab_requests r
    where ((r.requester_id = v_uid and r.addressee_id = p_target_user)
       or (r.addressee_id = v_uid and r.requester_id = p_target_user))
      and r.status = 'accepted'
  ) then raise exception 'Adicione essa pessoa como collab antes de compartilhar.'; end if;

  insert into easy_train_private.shared_plans(sender_id, recipient_id, title, plan)
  values (
    v_uid,
    p_target_user,
    left(coalesce(nullif(btrim(p_title), ''), 'Ficha compartilhada'), 100),
    p_plan
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'shared');
end;
$$;

create or replace function public.easy_train_mark_share_imported(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform easy_train_private.assert_active_user(v_uid);

  update easy_train_private.shared_plans
  set status = 'imported', imported_at = now()
  where id = p_share_id and recipient_id = v_uid and status = 'shared';

  if not found then raise exception 'Ficha compartilhada não encontrada.'; end if;
  return jsonb_build_object('status', 'imported');
end;
$$;

create or replace function public.easy_train_create_competition(
  p_title text,
  p_description text,
  p_metric text,
  p_start_date date,
  p_end_date date,
  p_invite_user_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_target uuid;
  v_invited integer := 0;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'create_competition', 10, 86400);

  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 80 then raise exception 'Título inválido.'; end if;
  if p_metric not in ('workouts', 'volume', 'prs', 'streak') then raise exception 'Métrica inválida.'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'Informe as datas.'; end if;
  if p_end_date < p_start_date then raise exception 'A data final deve ser posterior à inicial.'; end if;
  if p_end_date > p_start_date + 365 then raise exception 'A competição pode durar no máximo 365 dias.'; end if;
  if p_start_date < current_date - 7 then raise exception 'A data inicial está muito distante no passado.'; end if;

  loop
    v_code := upper(substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (
      select 1 from easy_train_private.competitions c where c.invite_code = v_code
    );
  end loop;

  insert into easy_train_private.competitions(
    creator_id, title, description, metric, start_date, end_date, invite_code
  ) values (
    v_uid, left(btrim(p_title), 80), left(coalesce(p_description, ''), 240),
    p_metric, p_start_date, p_end_date, v_code
  ) returning id into v_id;

  insert into easy_train_private.competition_members(competition_id, user_id, status, joined_at)
  values (v_id, v_uid, 'accepted', now());

  foreach v_target in array coalesce(p_invite_user_ids, array[]::uuid[]) loop
    exit when v_invited >= 49;
    if v_target <> v_uid and exists (
      select 1 from easy_train_private.collab_requests r
      where ((r.requester_id = v_uid and r.addressee_id = v_target)
         or (r.addressee_id = v_uid and r.requester_id = v_target))
        and r.status = 'accepted'
    ) then
      insert into easy_train_private.competition_members(competition_id, user_id, status)
      values (v_id, v_target, 'invited') on conflict do nothing;
      v_invited := v_invited + 1;
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'invite_code', v_code);
end;
$$;

create or replace function public.easy_train_join_competition(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_members integer;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'join_competition', 20, 3600);

  select c.id into v_id
  from easy_train_private.competitions c
  where c.invite_code = upper(btrim(p_code))
    and c.status = 'active'
    and c.end_date >= current_date
  for update;

  if v_id is null then raise exception 'Código de disputa inválido ou encerrado.'; end if;

  select count(*) into v_members
  from easy_train_private.competition_members m
  where m.competition_id = v_id and m.status = 'accepted';
  if v_members >= 50 then raise exception 'Essa competição atingiu 50 participantes.'; end if;

  insert into easy_train_private.competition_members(competition_id, user_id, status, joined_at)
  values (v_id, v_uid, 'accepted', now())
  on conflict (competition_id, user_id) do update set status = 'accepted', joined_at = now();

  return jsonb_build_object('competition_id', v_id, 'status', 'accepted');
end;
$$;

create or replace function public.easy_train_respond_competition(p_competition_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  perform easy_train_private.assert_active_user(v_uid);
  perform easy_train_private.assert_rate_limit(v_uid, 'respond_competition', 30, 3600);

  update easy_train_private.competition_members
  set status = case when p_accept then 'accepted' else 'rejected' end,
      joined_at = case when p_accept then now() else null end
  where competition_id = p_competition_id and user_id = v_uid and status = 'invited'
  returning status into v_status;

  if v_status is null then raise exception 'Convite não encontrado.'; end if;
  return jsonb_build_object('status', v_status);
end;
$$;

create or replace function public.easy_train_get_competitions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb := '[]'::jsonb;
  c record;
  v_members jsonb;
begin
  perform easy_train_private.assert_active_user(v_uid);

  for c in
    select comp.*, me.status my_status,
      creator.display_name creator_name, creator.username creator_username
    from easy_train_private.competitions comp
    join easy_train_private.profiles creator on creator.id = comp.creator_id
    join easy_train_private.competition_members me
      on me.competition_id = comp.id and me.user_id = v_uid
    where me.status in ('invited', 'accepted') and comp.status <> 'cancelled'
    order by (comp.end_date >= current_date) desc, comp.end_date asc
  loop
    select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.score desc, ranked.display_name), '[]'::jsonb)
    into v_members
    from (
      select p.id, p.display_name, p.username,
        case c.metric
          when 'workouts' then coalesce((
            select count(*)::numeric
            from easy_train_private.workout_events e
            where e.user_id = p.id and e.local_date between c.start_date and c.end_date
          ), 0)
          when 'volume' then coalesce((
            select sum(e.total_volume)
            from easy_train_private.workout_events e
            where e.user_id = p.id and e.local_date between c.start_date and c.end_date
          ), 0)
          when 'prs' then coalesce((
            select sum(e.new_prs)::numeric
            from easy_train_private.workout_events e
            where e.user_id = p.id and e.local_date between c.start_date and c.end_date
          ), 0)
          when 'streak' then coalesce((
            select max(streak_length)::numeric
            from (
              select count(*) streak_length
              from (
                select d,
                  d - (row_number() over (order by d))::integer as streak_group
                from (
                  select distinct e.local_date as d
                  from easy_train_private.workout_events e
                  where e.user_id = p.id
                    and e.local_date between c.start_date and c.end_date
                ) distinct_dates
              ) grouped_dates
              group by streak_group
            ) streaks
          ), 0)
          else 0::numeric
        end score
      from easy_train_private.competition_members m
      join easy_train_private.profiles p on p.id = m.user_id and p.account_status = 'active'
      where m.competition_id = c.id and m.status = 'accepted'
    ) ranked;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'metric', c.metric,
      'start_date', c.start_date,
      'end_date', c.end_date,
      'invite_code', c.invite_code,
      'status', case when c.end_date < current_date then 'finished' else c.status end,
      'my_status', c.my_status,
      'creator', jsonb_build_object(
        'id', c.creator_id,
        'display_name', c.creator_name,
        'username', c.creator_username
      ),
      'members', v_members
    ));
  end loop;

  return v_result;
end;
$$;

commit;
