-- Local-only E2E cleanup needs to remove scenario audit rows before deleting
-- their brand. Normal sessions remain append-only; the exception is scoped
-- to the local database superuser and an explicit transaction-local marker set
-- by the E2E reset route (which is unavailable outside E2E local mode).
create or replace function public.guard_workflow_approval_decisions_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user = 'postgres'
     and current_setting('app.e2e_cleanup_audit', true) = 'true' then
    return old;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'workflow_decisions_append_only';
end;
$$;

create or replace function public.guard_audit_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user = 'postgres'
     and current_setting('app.e2e_cleanup_audit', true) = 'true' then
    return old;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'audit_events_append_only';
end;
$$;
