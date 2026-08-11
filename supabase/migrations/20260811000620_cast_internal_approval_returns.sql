do $migration$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.approve_step_unlocked(uuid,uuid,text)'::regprocedure
  ) into function_definition;

  function_definition := replace(
    function_definition,
    'return ''pending_l2'';',
    'return ''pending_l2''::public.approval_request_status;'
  );
  function_definition := replace(
    function_definition,
    'return ''approved'';',
    'return ''approved''::public.approval_request_status;'
  );
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.request_changes_unlocked(uuid,uuid,text)'::regprocedure
  ) into function_definition;

  function_definition := replace(
    function_definition,
    'return ''changes_requested'';',
    'return ''changes_requested''::public.approval_request_status;'
  );
  execute function_definition;
end;
$migration$;
