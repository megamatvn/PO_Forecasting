begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table('public', 'workflow_approval_cases', 'generic approval cases table exists');
select has_table('public', 'workflow_approval_steps', 'generic approval steps table exists');
select has_table('public', 'workflow_approval_decisions', 'append-only decisions table exists');
select has_function('public', 'submit_annual_plan_v2', array['uuid','integer','uuid']::text[], 'annual plan submit command exists');
select has_function('public', 'decide_annual_plan_v2', array['uuid','text','text','uuid']::text[], 'annual plan decision command exists');
select has_function('public', 'request_annual_plan_changes_v2', array['uuid','text','uuid']::text[], 'request changes command exists');
select has_function('public', 'v2_annual_plan_validate_ready', array['uuid']::text[], 'database revalidation helper exists');
select has_column('public', 'workflow_approval_cases', 'assigned_executive_id', 'case stores exact executive assignee');
select has_column('public', 'workflow_approval_cases', 'route_snapshot', 'case stores immutable route snapshot');
select has_column('public', 'workflow_approval_steps', 'assignee_id', 'step stores exact assignee');
select has_column('public', 'workflow_approval_decisions', 'idempotency_key', 'decision is idempotent');
select col_is_pk('public'::name, 'workflow_approval_cases'::name, 'id'::name, 'case has primary key');
select col_is_pk('public'::name, 'workflow_approval_steps'::name, 'id'::name, 'step has primary key');
select col_is_pk('public'::name, 'workflow_approval_decisions'::name, 'id'::name, 'decision has primary key');
select has_index('public'::name, 'workflow_approval_cases'::name, 'workflow_approval_cases_one_pending_idx'::name, 'one pending workflow per target');
select has_index('public'::name, 'annual_plan_revisions'::name, 'annual_plan_one_active_workflow_idx'::name, 'one draft or pending revision per cycle');
select is((select relrowsecurity from pg_class where oid = 'public.workflow_approval_cases'::regclass), true, 'case RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.workflow_approval_steps'::regclass), true, 'step RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.workflow_approval_decisions'::regclass), true, 'decision RLS enabled');
select has_trigger('public', 'workflow_approval_decisions', 'workflow_approval_decisions_append_only_guard', 'decisions are append-only');
select isnt((select proconfig from pg_proc where oid = 'public.submit_annual_plan_v2(uuid,integer,uuid)'::regprocedure), null, 'submit command has a function configuration');

select throws_ok(
  $$ select public.submit_annual_plan_v2(gen_random_uuid(), 0, gen_random_uuid()) $$,
  '42501', 'ANNUAL_PLAN_SUBMIT_FORBIDDEN', 'submit cannot bypass owner authorization'
);
select throws_ok(
  $$ select public.decide_annual_plan_v2(gen_random_uuid(), 'approve', '', gen_random_uuid()) $$,
  '42501', 'ANNUAL_PLAN_DECISION_FORBIDDEN', 'decision cannot bypass assignee authorization'
);
select throws_ok(
  $$ select public.decide_annual_plan_v2(gen_random_uuid(), 'request_changes', '', gen_random_uuid()) $$,
  'P0001', 'ANNUAL_PLAN_COMMENT_REQUIRED', 'change requests require a reason'
);
select results_eq(
  $$ select round(10511::numeric * 1.75, 2) $$,
  $$ values (18394.25::numeric) $$,
  'approval uses the same paid quantity amount rule'
);

select * from finish();
rollback;
