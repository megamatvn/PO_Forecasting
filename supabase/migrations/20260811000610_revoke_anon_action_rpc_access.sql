revoke all on function public.commit_import_batch(uuid, uuid, boolean)
  from public, anon;
revoke all on function public.submit_plan(uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.approve_step(uuid, uuid, text)
  from public, anon;
revoke all on function public.request_changes(uuid, uuid, text)
  from public, anon;

grant execute on function public.commit_import_batch(uuid, uuid, boolean)
  to authenticated, service_role;
grant execute on function public.submit_plan(uuid, uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.approve_step(uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.request_changes(uuid, uuid, text)
  to authenticated, service_role;
