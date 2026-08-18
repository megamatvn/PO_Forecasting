-- Local/CI E2E ownership registry. The application never grants access to this
-- table; the guarded reset route uses the local Postgres connection only.
create table if not exists public.e2e_scenario_runs (
  run_id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  registered_brand_ids uuid[] not null default '{}'::uuid[],
  registered_user_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

revoke all on table public.e2e_scenario_runs from public, anon, authenticated;
grant all on table public.e2e_scenario_runs to service_role;
