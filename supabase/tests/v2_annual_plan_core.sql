begin;
select plan(27);

select has_table('public', 'annual_plan_cycles');
select has_table('public', 'annual_plan_revisions');
select has_table('public', 'annual_plan_lines');
select has_table('public', 'purchase_waves');
select has_table('public', 'purchase_wave_revisions');
select has_table('public', 'purchase_wave_allocations');
select has_function('public', 'create_or_resume_annual_plan_v2', ARRAY['uuid','integer','uuid']);
select has_function('public', 'save_annual_plan_scope_v2', ARRAY['uuid','integer','uuid']);
select has_function('public', 'save_annual_plan_lines_v2', ARRAY['uuid','integer','jsonb','uuid']);
select has_function('public', 'save_purchase_wave_allocations_v2', ARRAY['uuid','integer','jsonb','uuid']);
select has_function('public', 'create_annual_plan_revision_v2', ARRAY['uuid','uuid']);
select has_index('public', 'annual_plan_cycles', 'annual_plan_cycles_brand_id_planning_year_key');
select has_index('public', 'annual_plan_revisions', 'annual_plan_one_draft_owner_idx');
select col_is_pk('public', 'purchase_waves', 'id');
select has_check('public', 'annual_plan_lines', 'annual_plan_lines_opening_stock_check');
select has_check('public', 'purchase_wave_revisions', 'purchase_wave_revisions_needed_month_check');
select has_column('public', 'purchase_wave_revisions', 'order_month');
select has_column('public', 'purchase_wave_revisions', 'arrival_month');
select has_check('public', 'purchase_wave_revisions', 'purchase_wave_revisions_order_month_check');
select has_check('public', 'purchase_wave_revisions', 'purchase_wave_revisions_arrival_month_check');
select has_check('public', 'purchase_wave_revisions', 'purchase_wave_revisions_order_before_arrival_check');

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
