-- EASY TRAIN — 01/03: ESTRUTURA DO BANCO
-- Projeto novo: rode os arquivos 01 -> 03, ou simplesmente INSTALL_ALL.sql.
-- Todas as tabelas internas ficam fora do schema public.

begin;

create extension if not exists pgcrypto;

create schema if not exists easy_train_private;
revoke all on schema easy_train_private from public, anon, authenticated;

create table if not exists easy_train_private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Atleta'
    check (char_length(btrim(display_name)) between 1 and 80),
  username text not null
    check (username = lower(username) and username ~ '^[a-z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 180),
  avatar_url text,
  discoverable boolean not null default true,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists easy_train_profiles_username_uidx
  on easy_train_private.profiles (lower(username));

create table if not exists easy_train_private.user_states (
  user_id uuid primary key references easy_train_private.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object')
    check (octet_length(state::text) <= 2097152),
  state_version integer not null default 1 check (state_version between 1 and 1000),
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists easy_train_private.user_stats (
  user_id uuid primary key references easy_train_private.profiles(id) on delete cascade,
  workouts_count integer not null default 0 check (workouts_count >= 0),
  weekly_workouts integer not null default 0 check (weekly_workouts >= 0),
  total_volume numeric(18,2) not null default 0 check (total_volume >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  prs_count integer not null default 0 check (prs_count >= 0),
  last_workout_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists easy_train_private.collab_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  addressee_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists easy_train_collab_active_pair_uidx
  on easy_train_private.collab_requests (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  )
  where status in ('pending', 'accepted');

create index if not exists easy_train_collabs_requester_idx
  on easy_train_private.collab_requests(requester_id, status, created_at desc);
create index if not exists easy_train_collabs_addressee_idx
  on easy_train_private.collab_requests(addressee_id, status, created_at desc);

create table if not exists easy_train_private.shared_plans (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  recipient_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  plan jsonb not null
    check (jsonb_typeof(plan) = 'object')
    check (octet_length(plan::text) <= 262144),
  status text not null default 'shared'
    check (status in ('shared', 'imported', 'dismissed')),
  created_at timestamptz not null default now(),
  imported_at timestamptz,
  check (sender_id <> recipient_id)
);

create index if not exists easy_train_shared_recipient_idx
  on easy_train_private.shared_plans(recipient_id, status, created_at desc);
create index if not exists easy_train_shared_sender_idx
  on easy_train_private.shared_plans(sender_id, created_at desc);

create table if not exists easy_train_private.competitions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 240),
  metric text not null check (metric in ('workouts', 'volume', 'prs', 'streak')),
  start_date date not null,
  end_date date not null,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6,10}$'),
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date <= start_date + 365)
);

create table if not exists easy_train_private.competition_members (
  competition_id uuid not null references easy_train_private.competitions(id) on delete cascade,
  user_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'rejected', 'left')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index if not exists easy_train_comp_members_user_idx
  on easy_train_private.competition_members(user_id, status, created_at desc);

create table if not exists easy_train_private.workout_events (
  user_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 100),
  workout_id text check (workout_id is null or char_length(workout_id) <= 100),
  workout_title text not null default 'Treino' check (char_length(workout_title) <= 100),
  completed_at timestamptz not null,
  local_date date not null,
  total_volume numeric(18,2) not null default 0
    check (total_volume between 0 and 50000000),
  new_prs integer not null default 0 check (new_prs between 0 and 100),
  duration_seconds integer not null default 0
    check (duration_seconds between 0 and 21600),
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

-- Compatibilidade com instalações anteriores à coluna local_date.
alter table easy_train_private.workout_events
  add column if not exists local_date date;
update easy_train_private.workout_events
set local_date = completed_at::date
where local_date is null;
alter table easy_train_private.workout_events
  alter column local_date set not null;

create index if not exists easy_train_events_user_date_idx
  on easy_train_private.workout_events(user_id, local_date desc, completed_at desc);
create index if not exists easy_train_events_competition_idx
  on easy_train_private.workout_events(local_date, user_id);

-- Limite simples por usuário para reduzir spam nas RPCs sociais.
create table if not exists easy_train_private.action_limits (
  user_id uuid not null references easy_train_private.profiles(id) on delete cascade,
  action_name text not null check (char_length(action_name) between 2 and 50),
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  primary key (user_id, action_name)
);

commit;
