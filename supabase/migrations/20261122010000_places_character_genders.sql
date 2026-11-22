-- Voice casting: per-character gender guesses ('female' | 'male' | 'unknown'), editable on the script page.
alter table public.places_scripts
  add column if not exists character_genders jsonb not null default '{}'::jsonb;
