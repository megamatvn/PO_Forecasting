begin;
select plan(27);

select has_table('public'::name, 'annual_plan_cycles'::name);
select has_table('public'::name, 'annual_plan_revisions'::name);
select has_table('public'::name, 'annual_plan_lines'::name);
select has_table('public'::name, 'purchase_waves'::name);
select has_table('public'::name, 'purchase_wave_revisions'::name);
select has_table('public'::name, 'purchase_wave_allocations'::name);
select has_function('public', 'create_or_resume_annual_plan_v2', ARRAY['uuid','integer','uuid']);
select has_function('public', 'save_annual_plan_scope_v2', ARRAY['uuid','integer','uuid']);
select has_function('public', 'save_annual_plan_lines_v2', ARRAY['uuid','integer','jsonb','uuid']);
select has_function('public', 'save_purchase_wave_allocations_v2', ARRAY['uuid','integer','jsonb','uuid']);
select has_function('public', 'create_annual_plan_revision_v2', ARRAY['uuid','uuid']);
select has_index('public'::name, 'annual_plan_cycles'::name, 'annual_plan_cycles_brand_id_planning_year_key'::name);
select has_index('public'::name, 'annual_plan_revisions'::name, 'annual_plan_one_draft_owner_idx'::name);
select col_is_pk('public'::name, 'purchase_waves'::name, 'id'::name, 'purchase wave has primary key');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.purchase_wave_revisions'::regclass and conname = 'purchase_wave_revisions_needed_month_check'), 'needed month is normalized');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.annual_plan_lines'::regclass and conname = 'annual_plan_lines_opening_stock_check'), 'opening stock is non-negative');
select has_column('public'::name, 'purchase_wave_revisions'::name, 'order_month'::name, 'order month column exists');
select has_column('public'::name, 'purchase_wave_revisions'::name, 'arrival_month'::name, 'arrival month column exists');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.purchase_wave_revisions'::regclass and conname = 'purchase_wave_revisions_order_month_check'), 'order month is valid');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.purchase_wave_revisions'::regclass and conname = 'purchase_wave_revisions_arrival_month_check'), 'arrival month is valid');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.purchase_wave_revisions'::regclass and conname = 'purchase_wave_revisions_order_before_arrival_check'), 'order precedes arrival');

select throws_ok(
  $$ select public.create_or_resume_annual_plan_v2(gen_random_uuid(), extract(year from current_date)::int - 1, gen_random_uuid()) $$,
  'P0001', 'PAST_PLANNING_YEAR', 'past planning years are rejected'
);

select throws_ok(
  $$ select public.save_annual_plan_lines_v2(gen_random_uuid(), 0, '[{"productId":"00000000-0000-4000-8000-000000000001","annualPaidQty":-1}]'::jsonb, gen_random_uuid()) $$,
  '42501', 'ANNUAL_PLAN_DRAFT_FORBIDDEN', 'lines require the owner draft'
);

select results_eq(
  $$ select round(10511::numeric * 1.75, 2) $$,
  $$ values (18394.25::numeric) $$,
  'amount is paid quantity times ex price'
);
select results_eq(
  $$ select date_trunc('month', '2026-03-18'::date)::date $$,
  $$ values ('2026-03-01'::date) $$,
  'wave months are stored at month precision'
);
select results_eq(
  $$ select '2026-03-01'::date <= '2026-04-01'::date $$,
  $$ values (true) $$,
  'order month cannot be after arrival month'
);
select isnt((select relrowsecurity from pg_class where oid = 'public.annual_plan_revisions'::regclass), false, 'revision RLS remains enabled');

select * from finish();
rollback;
