begin;
select plan(12);

select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'annual_plan_revisions' and policyname = 'annual_plan_revisions_select_owner_or_approval'), 'annual plan revision privacy policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'annual_plan_lines' and policyname = 'annual_plan_lines_select_revision_access'), 'annual plan line privacy policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_wave_allocations' and policyname = 'purchase_wave_allocations_select_revision_access'), 'wave allocation privacy policy exists');
select has_function('public', 'v2_annual_revision_access', ARRAY['uuid','boolean']);
select has_function('public', 'v2_annual_plan_authorized', ARRAY['uuid']);
select has_column('public'::name, 'annual_plan_revisions'::name, 'owner_id'::name, 'revision owner column exists');
select has_column('public'::name, 'annual_plan_revisions'::name, 'assigned_executive_id'::name, 'assigned executive column exists');
select has_column('public'::name, 'purchase_waves'::name, 'stable_key'::name, 'stable wave key column exists');
select has_column('public'::name, 'purchase_wave_revisions'::name, 'wave_id'::name, 'wave revision link column exists');
select has_column('public'::name, 'annual_plan_lines'::name, 'ex_price'::name, 'line ex price column exists');
select results_eq($$ select count(*) from public.annual_plan_revisions where status = 'draft_owner_only' $$, $$ values (0::bigint) $$, 'privacy fixture starts without leaked drafts');
select isnt((select relrowsecurity from pg_class where oid = 'public.purchase_wave_allocations'::regclass), false, 'allocation RLS remains enabled');

select * from finish();
rollback;
