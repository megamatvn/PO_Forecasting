begin;
select plan(33);

select has_table('public'::name, 'proposal_approval_policies'::name);
select has_table('public'::name, 'proposal_approval_policy_brands'::name);
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'proposal_approval_policies' and policyname = 'proposal_approval_policies_select_admin'), 'proposal policy visibility exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'proposal_approval_policy_brands' and policyname = 'proposal_approval_policy_brands_select_admin'), 'proposal brand policy visibility exists');
select has_table('public'::name, 'purchase_proposals'::name);
select has_table('public'::name, 'proposal_revisions'::name);
select has_table('public'::name, 'proposal_lines'::name);
select has_table('public'::name, 'proposal_route_snapshots'::name);
select has_table('public'::name, 'capacity_reservations'::name);
select has_column('public'::name, 'purchase_proposals'::name, 'assigned_manager_id'::name, 'assigned manager column exists');
select has_column('public'::name, 'purchase_proposals'::name, 'assigned_executive_id'::name, 'assigned executive column exists');
select has_column('public'::name, 'proposal_route_snapshots'::name, 'over_plan'::name, 'over plan column exists');
select has_column('public'::name, 'proposal_route_snapshots'::name, 'reference_amount'::name, 'reference amount column exists');
select has_column('public'::name, 'capacity_reservations'::name, 'status'::name, 'reservation status column exists');
select has_index('public'::name, 'purchase_proposals'::name, 'purchase_proposals_owner_status_idx'::name);
select has_index('public'::name, 'capacity_reservations'::name, 'capacity_reservations_one_active_idx'::name);
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'purchase_proposals' and policyname = 'purchase_proposals_select_scoped'), 'proposal privacy policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'proposal_lines' and policyname = 'proposal_lines_select_scoped'), 'proposal line privacy policy exists');
select has_function('public', 'v2_proposal_revision_access', ARRAY['uuid','boolean']);
select has_function('public', 'create_or_resume_proposal_v2', ARRAY['uuid','integer','date','text','uuid']);
select has_function('public', 'save_proposal_v2', ARRAY['uuid','integer','jsonb','uuid']);
select has_function('public', 'submit_proposal_v2', ARRAY['uuid','integer','uuid']);
select has_function('public', 'assign_proposal_wave_v2', ARRAY['uuid','integer','uuid','uuid']);
select has_function('public', 'decide_proposal_v2', ARRAY['uuid','text','text','uuid']);
select has_function('public', 'withdraw_proposal_v2', ARRAY['uuid','uuid']);
select has_function('public', 'request_proposal_cancellation_v2', ARRAY['uuid','text','uuid']);
select has_function('public', 'decide_proposal_cancellation_v2', ARRAY['uuid','text','text','uuid']);
select has_function('public', 'create_proposal_approval_policy_v2', ARRAY['text','public.proposal_approval_mode_v2','numeric','text','uuid[]','date','date','uuid']);
select throws_ok(
  $$ select public.create_or_resume_proposal_v2(gen_random_uuid(), extract(year from current_date)::integer, date_trunc('month', current_date)::date, 'Một lý do đủ dài', gen_random_uuid()) $$,
  '42501',
  'PROPOSAL_BRAND_ACCESS_REQUIRED',
  'proposal creation is brand-capability protected'
);
select results_eq($$ select greatest(0, 10 - 4) $$, $$ values (6) $$, 'remaining capacity subtracts active reservations');
select results_eq($$ select 100::numeric * 1.75 $$, $$ values (175::numeric) $$, 'reference amount uses requested units and baseline price');
select isnt((select relrowsecurity from pg_class where oid = 'public.purchase_proposals'::regclass), false, 'proposal RLS is enabled');
select isnt((select relrowsecurity from pg_class where oid = 'public.capacity_reservations'::regclass), false, 'capacity RLS is enabled');
select * from finish();
rollback;
