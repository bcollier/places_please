-- Places, Please: initial schema
-- Entities: user (auth.users + places_profiles), script, practice history, AI call + cost log.
-- Every table has row level security; users can only ever see their own rows.
-- Everything is prefixed places_ because the Supabase project is shared with other apps.

-- ---------------------------------------------------------------------------
-- places_profiles: one row per user, holds app settings
-- ---------------------------------------------------------------------------
create table if not exists public.places_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  settings jsonb not null default '{}'::jsonb,
  current_script_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.places_profiles enable row level security;

create policy "places profiles: read own" on public.places_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "places profiles: insert own" on public.places_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "places profiles: update own" on public.places_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- No trigger on auth.users: this project is shared with other apps (Ignatius at Home), so the app
-- creates its own places_profiles row the first time it needs one.

-- ---------------------------------------------------------------------------
-- places_scripts
-- lines is an ordered array of { id, character, text, scene }
-- ---------------------------------------------------------------------------
create table if not exists public.places_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  my_character text,
  characters text[] not null default '{}',
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  source_type text not null default 'text' check (source_type in ('photos', 'pdf', 'docx', 'text')),
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_scripts_user_id_idx on public.places_scripts (user_id, updated_at desc);

alter table public.places_scripts enable row level security;

create policy "places scripts: read own" on public.places_scripts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "places scripts: insert own" on public.places_scripts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "places scripts: update own" on public.places_scripts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "places scripts: delete own" on public.places_scripts
  for delete to authenticated using (user_id = (select auth.uid()));

alter table public.places_profiles
  drop constraint if exists places_profiles_current_script_id_fkey,
  add constraint places_profiles_current_script_id_fkey
    foreign key (current_script_id) references public.places_scripts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- places_practice_history: one row per finished (or abandoned) practice session
-- ---------------------------------------------------------------------------
create table if not exists public.places_practice_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  script_id uuid references public.places_scripts (id) on delete cascade,
  mode text not null check (mode in ('run_lines', 'warmup', 'listen')),
  character text,
  scene text,
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  lines_total integer not null default 0 check (lines_total >= 0),
  perfect_count integer not null default 0 check (perfect_count >= 0),
  close_count integer not null default 0 check (close_count >= 0),
  missed_count integer not null default 0 check (missed_count >= 0),
  score numeric(5, 2),
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists places_practice_history_user_idx on public.places_practice_history (user_id, started_at desc);
create index if not exists places_practice_history_script_idx on public.places_practice_history (script_id);

alter table public.places_practice_history enable row level security;

create policy "places history: read own" on public.places_practice_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy "places history: insert own" on public.places_practice_history
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "places history: delete own" on public.places_practice_history
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- places_ai_calls: every OpenRouter request, with tokens and cost.
-- Written only by the `places-ai` edge function (service role). Users can read their own.
-- ---------------------------------------------------------------------------
create table if not exists public.places_ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  purpose text not null,
  model_requested text,
  model_used text,
  generation_id text,
  status text not null check (status in ('success', 'error')),
  http_status integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer,
  request_bytes integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists places_ai_calls_user_idx on public.places_ai_calls (user_id, created_at desc);
create index if not exists places_ai_calls_created_idx on public.places_ai_calls (created_at desc);

alter table public.places_ai_calls enable row level security;

create policy "places ai_calls: read own" on public.places_ai_calls
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies: only the service role (edge function) can write.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.places_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_scripts_touch on public.places_scripts;
create trigger places_scripts_touch before update on public.places_scripts
  for each row execute function public.places_touch_updated_at();

drop trigger if exists places_profiles_touch on public.places_profiles;
create trigger places_profiles_touch before update on public.places_profiles
  for each row execute function public.places_touch_updated_at();
