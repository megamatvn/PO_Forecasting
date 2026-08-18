begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_view('public', 'v2_dashboard_approved_plan_lines', 'approved plan line projection exists');
select has_view('public', 'v2_dashboard_purchase_waves', 'purchase wave projection exists');
select has_view('public', 'v2_dashboard_proposal_activity', 'proposal activity projection exists');
select has_view('public', 'v2_dashboard_governance_signals', 'governance projection exists');
select has_function('public', 'operate_purchase_wave_v2', array['uuid','text','text','date','date','date','jsonb','uuid'], 'wave operation command exists');
select has_column('public', 'purchase_waves', 'official_po_number', 'official PO number is stored');
select has_column('public', 'purchase_waves', 'ordered_at', 'exact ordered date is stored');
select has_column('public', 'purchase_waves', 'supplier_confirmed_at', 'exact supplier confirmation date is stored');
select has_column('public', 'purchase_waves', 'received_at', 'exact received date is stored');
select has_index('public'::name, 'purchase_waves'::name, 'purchase_waves_status_cycle_idx'::name, 'wave status scope index exists');
select has_index('public'::name, 'purchase_proposals'::name, 'purchase_proposals_dashboard_scope_idx'::name, 'proposal dashboard scope index exists');
select ok((select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[])) from pg_class where oid = 'public.v2_dashboard_approved_plan_lines'::regclass), 'baseline projection is security invoker');
select ok((select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[])) from pg_class where oid = 'public.v2_dashboard_purchase_waves'::regclass), 'wave projection is security invoker');
select ok((select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[])) from pg_class where oid = 'public.v2_dashboard_proposal_activity'::regclass), 'proposal projection is security invoker');
select is((select count(*) from pg_views where schemaname = 'public' and viewname in ('v2_dashboard_approved_plan_lines','v2_dashboard_purchase_waves','v2_dashboard_proposal_activity','v2_dashboard_governance_signals')), 4::bigint, 'all V2 projections are registered');
select ok(not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v2_dashboard_approved_plan_lines' and definition ~ 'planning_cycles|plan_versions'), 'dashboard projection does not depend on legacy plan tables');
select ok(not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v2_dashboard_purchase_waves' and definition ~ 'planning_cycles|plan_versions'), 'wave projection does not depend on legacy plan tables');
select ok((select pg_get_functiondef('public.operate_purchase_wave_v2(uuid,text,text,date,date,date,jsonb,uuid)'::regprocedure) like '%ACTIVE_PROPOSAL_REASSIGNMENT_REQUIRED%'), 'cancel command requires active proposal reassignment');
select ok((select pg_get_functiondef('public.operate_purchase_wave_v2(uuid,text,text,date,date,date,jsonb,uuid)'::regprocedure) like '%purchase_wave_operated%'), 'wave command writes an audit event');

select * from finish();
rollback;
