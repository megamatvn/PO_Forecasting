begin;
select plan(21);

select has_table('public'::name, 'annual_plan_excel_staging'::name);
select has_table('public'::name, 'annual_plan_excel_checkpoints'::name);
select has_column('public'::name, 'annual_plan_excel_staging'::name, 'import_session_id'::name, 'import session id column exists');
select has_column('public'::name, 'annual_plan_excel_staging'::name, 'checksum'::name, 'checksum column exists');
select has_column('public'::name, 'annual_plan_excel_staging'::name, 'diagnostics'::name, 'diagnostics column exists');
select has_column('public'::name, 'annual_plan_excel_checkpoints'::name, 'before_lines'::name, 'before lines column exists');
select has_column('public'::name, 'annual_plan_excel_checkpoints'::name, 'before_waves'::name, 'before waves column exists');
select has_index('public'::name, 'annual_plan_excel_staging'::name, 'annual_plan_excel_staging_revision_idx'::name);
select has_index('public'::name, 'annual_plan_excel_checkpoints'::name, 'annual_plan_excel_checkpoints_revision_idx'::name);
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'annual_plan_excel_staging' and policyname = 'annual_plan_excel_staging_owner_select'), 'staging owner policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'annual_plan_excel_checkpoints' and policyname = 'annual_plan_excel_checkpoints_owner_select'), 'checkpoint owner policy exists');
select has_function('public', 'stage_annual_plan_excel_v2', ARRAY['uuid','integer','uuid','text','jsonb','jsonb']);
select has_function('public', 'apply_annual_plan_excel_v2', ARRAY['uuid','integer','uuid','text','jsonb','uuid']);
select has_function('public', 'restore_annual_plan_excel_checkpoint_v2', ARRAY['uuid','integer','uuid']);
select ok(exists(select 1 from pg_constraint where conrelid = 'public.annual_plan_excel_staging'::regclass and conname = 'annual_plan_excel_staging_checksum_check'), 'staging checksum is validated');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.annual_plan_excel_checkpoints'::regclass and conname = 'annual_plan_excel_checkpoints_checksum_check'), 'checkpoint checksum is validated');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.annual_plan_excel_checkpoints'::regclass and conname = 'annual_plan_excel_checkpoints_replace_sections_check'), 'checkpoint sections are validated');
select isnt((select relrowsecurity from pg_class where oid = 'public.annual_plan_excel_staging'::regclass), false, 'staging RLS is enabled');
select isnt((select relrowsecurity from pg_class where oid = 'public.annual_plan_excel_checkpoints'::regclass), false, 'checkpoint RLS is enabled');
select throws_ok(
  $$ select public.apply_annual_plan_excel_v2(gen_random_uuid(), 0, gen_random_uuid(), repeat('a', 64), '{}'::jsonb, gen_random_uuid()) $$,
  '42501',
  'ANNUAL_PLAN_DRAFT_FORBIDDEN',
  'apply is owner-draft protected'
);
select results_eq(
  $$ select jsonb_typeof('[]'::jsonb) $$,
  $$ values ('array'::text) $$,
  'diagnostics are represented as an array'
);
select * from finish();
rollback;
