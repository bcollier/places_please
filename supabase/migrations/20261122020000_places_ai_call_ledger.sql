-- AI call ledger: every paid call is written BEFORE it is sent (status 'pending', estimated cost),
-- then completed with the provider's reported cost. The spend-cap check and the pending insert happen
-- in one transaction under an advisory lock, so concurrent requests can't race past the daily caps.

alter table public.places_ai_calls drop constraint if exists places_ai_calls_status_check;
alter table public.places_ai_calls
  add constraint places_ai_calls_status_check check (status in ('pending', 'success', 'error'));

-- true while cost_usd is our estimate (pending calls, timeouts, list-price providers like Azure TTS);
-- false once it is the cost the provider reported.
alter table public.places_ai_calls add column if not exists cost_is_estimate boolean not null default false;
alter table public.places_ai_calls add column if not exists completed_at timestamptz;

create or replace function public.places_begin_ai_call(
  p_user_id uuid,
  p_purpose text,
  p_model text,
  p_estimate numeric,
  p_request_bytes integer,
  p_user_limit numeric,
  p_total_limit numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := date_trunc('day', now(), 'UTC');
  v_user numeric;
  v_total numeric;
  v_id uuid;
begin
  -- One caller at a time checks and reserves spend.
  perform pg_advisory_xact_lock(hashtext('places_ai_spend'));

  select coalesce(sum(cost_usd), 0) into v_total
    from public.places_ai_calls where created_at >= v_since;
  select coalesce(sum(cost_usd), 0) into v_user
    from public.places_ai_calls where created_at >= v_since and user_id = p_user_id;

  if v_user + p_estimate > p_user_limit or v_total + p_estimate > p_total_limit then
    raise exception 'places_daily_limit' using errcode = 'P0001';
  end if;

  insert into public.places_ai_calls (user_id, purpose, model_requested, status, cost_usd, cost_is_estimate, request_bytes)
  values (p_user_id, p_purpose, p_model, 'pending', p_estimate, true, p_request_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.places_begin_ai_call(uuid, text, text, numeric, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.places_begin_ai_call(uuid, text, text, numeric, integer, numeric, numeric) to service_role;
