-- Destructive V2 cutover and legacy contract. This migration is intentionally
-- inert unless a controlled, test-rehearsed cutover session sets the exact
-- confirmation token.
create or replace function public.assert_v2_cutover_confirmed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.v2_cutover_confirmed', true) is distinct from 'BUSINESS_DATA_BACKED_UP' then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_BACKUP_CONFIRMATION_REQUIRED';
  end if;
end;
$$;

revoke all on function public.assert_v2_cutover_confirmed() from public, anon, authenticated;

-- The destructive operation is registered but deliberately not invoked while
-- the migration chain is replayed. The controlled cutover runner must set the
-- exact session token and call this function in the same database session.
create or replace function public.perform_v2_legacy_cutover()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  retained_admin_id uuid;
  legacy_dependency_count integer;
  legacy_fk_dependency_count integer;
  legacy_function_dependency_count integer;
  legacy_function text;
begin
  perform public.assert_v2_cutover_confirmed();

  select users.id into retained_admin_id
  from auth.users
  where lower(users.email) = 'admin@sagen-groupe.com'
  limit 1;

  if retained_admin_id is null then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_RETAINED_ADMIN_REQUIRED';
  end if;

  if not exists (select 1 from public.profiles where id = retained_admin_id) then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_RETAINED_ADMIN_PROFILE_REQUIRED';
  end if;

  select count(*) into legacy_dependency_count
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class dependent_view on dependent_view.oid = r.ev_class
  join pg_class legacy_table on legacy_table.oid = d.refobjid
  join pg_namespace legacy_schema on legacy_schema.oid = legacy_table.relnamespace
  where legacy_schema.nspname = 'public'
    and legacy_table.relname in (
      'import_issues', 'import_staging_rows', 'import_batches', 'sales_demand',
      'inventory_snapshots', 'purchased_receipts', 'source_snapshots', 'version_diffs',
      'purchase_lines', 'purchase_batches', 'plan_monthly_demand', 'plan_lines',
      'plan_versions', 'planning_cycles', 'approval_steps', 'approval_requests',
      'approval_policy_brands', 'approval_policies', 'suppliers', 'product_prices',
      'planning_settings', 'user_brand_access', 'user_roles', 'roles'
    )
    and dependent_view.relname like '%v2%';

  if legacy_dependency_count <> 0 then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_LEGACY_VIEW_DEPENDENCY';
  end if;

  select count(*) into legacy_fk_dependency_count
  from pg_constraint c
  join pg_class dependent_table on dependent_table.oid = c.conrelid
  join pg_namespace dependent_schema on dependent_schema.oid = dependent_table.relnamespace
  join pg_class legacy_table on legacy_table.oid = c.confrelid
  join pg_namespace legacy_schema on legacy_schema.oid = legacy_table.relnamespace
  where c.contype = 'f'
    and dependent_schema.nspname = 'public'
    and legacy_schema.nspname = 'public'
    and dependent_table.relname in (
      'annual_plan_cycles', 'annual_plan_revisions', 'annual_plan_lines',
      'purchase_waves', 'purchase_wave_revisions', 'purchase_wave_allocations',
      'annual_plan_excel_staging', 'annual_plan_excel_checkpoints',
      'purchase_proposals', 'proposal_revisions', 'proposal_lines',
      'proposal_route_snapshots', 'capacity_reservations',
      'workflow_approval_cases', 'workflow_approval_steps', 'workflow_approval_decisions',
      'notification_outbox', 'notifications',
      'reporting_lines', 'user_capabilities', 'user_brand_permissions'
    )
    and legacy_table.relname in (
      'import_issues', 'import_staging_rows', 'import_batches', 'sales_demand',
      'inventory_snapshots', 'purchased_receipts', 'source_snapshots', 'version_diffs',
      'purchase_lines', 'purchase_batches', 'plan_monthly_demand', 'plan_lines',
      'plan_versions', 'planning_cycles', 'approval_steps', 'approval_requests',
      'approval_policy_brands', 'approval_policies', 'suppliers', 'product_prices',
      'planning_settings', 'user_brand_access', 'user_roles', 'roles'
    );

  if legacy_fk_dependency_count <> 0 then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_LEGACY_FK_DEPENDENCY';
  end if;

  -- PL/pgSQL bodies are not fully represented in pg_depend. Scan retained V2
  -- functions as a conservative second guard so a V2 function cannot keep a
  -- reference to a table/type that this contract is about to remove. Legacy
  -- functions are intentionally removed after their tables/triggers below.
  select count(*) into legacy_function_dependency_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname ~ '_v2$'
    and p.oid <> 'public.perform_v2_legacy_cutover()'::regprocedure
    and p.prosrc ~* '(import_issues|import_staging_rows|import_batches|sales_demand|inventory_snapshots|purchased_receipts|source_snapshots|version_diffs|purchase_lines|purchase_batches|plan_monthly_demand|plan_lines|plan_versions|planning_cycles|approval_steps|approval_requests|(^|[^a-z_])approval_policy_brands([^a-z_]|$)|(^|[^a-z_])approval_policies([^a-z_]|$)|suppliers|product_prices|planning_settings|user_brand_access|user_roles|public\.roles)';

  if legacy_function_dependency_count <> 0 then
    raise exception using errcode = 'P0001', message = 'V2_CUTOVER_LEGACY_FUNCTION_DEPENDENCY';
  end if;

  -- Remove V2 and legacy business rows in child-to-parent order so brands and
  -- SKUs can be reseeded cleanly after cutover. Historical migrations and
  -- identity/profile rows are preserved.
  delete from public.notifications where to_regclass('public.notifications') is not null;
  delete from public.notification_outbox where to_regclass('public.notification_outbox') is not null;
  delete from public.workflow_approval_decisions where to_regclass('public.workflow_approval_decisions') is not null;
  delete from public.workflow_approval_steps where to_regclass('public.workflow_approval_steps') is not null;
  delete from public.workflow_approval_cases where to_regclass('public.workflow_approval_cases') is not null;
  delete from public.capacity_reservations where to_regclass('public.capacity_reservations') is not null;
  delete from public.proposal_route_snapshots where to_regclass('public.proposal_route_snapshots') is not null;
  delete from public.proposal_lines where to_regclass('public.proposal_lines') is not null;
  delete from public.proposal_revisions where to_regclass('public.proposal_revisions') is not null;
  delete from public.purchase_proposals where to_regclass('public.purchase_proposals') is not null;
  delete from public.annual_plan_excel_checkpoints where to_regclass('public.annual_plan_excel_checkpoints') is not null;
  delete from public.annual_plan_excel_staging where to_regclass('public.annual_plan_excel_staging') is not null;
  delete from public.purchase_wave_allocations where to_regclass('public.purchase_wave_allocations') is not null;
  delete from public.purchase_wave_revisions where to_regclass('public.purchase_wave_revisions') is not null;
  delete from public.purchase_waves where to_regclass('public.purchase_waves') is not null;
  delete from public.annual_plan_lines where to_regclass('public.annual_plan_lines') is not null;
  delete from public.annual_plan_revisions where to_regclass('public.annual_plan_revisions') is not null;
  delete from public.annual_plan_cycles where to_regclass('public.annual_plan_cycles') is not null;

  if to_regclass('public.proposal_approval_policy_brands') is not null then
    delete from public.proposal_approval_policy_brands;
  end if;
  if to_regclass('public.proposal_approval_policies') is not null then
    delete from public.proposal_approval_policies;
  end if;

  if to_regclass('public.audit_events') is not null then
    alter table public.audit_events disable trigger user;
    delete from public.audit_events;
    alter table public.audit_events enable trigger user;
  end if;

  -- Remove policies that keep retired helper functions reachable from tables
  -- retained by V2. Recreate the profile read policy with the V2 capability
  -- guard before the legacy helper cleanup below.
  if to_regclass('public.audit_events') is not null then
    execute 'drop policy if exists audit_events_select_by_access on public.audit_events';
    execute 'drop policy if exists audit_events_select_v2 on public.audit_events';
    execute 'create policy audit_events_select_v2 on public.audit_events for select to authenticated using (public.current_profile_is_active() and (public.current_user_is_administrator_v2() or public.can_use_brand_capability(brand_id, ''view_approved_plan''::public.user_capability)))';
  end if;
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists profiles_manage_admin on public.profiles';
    execute 'drop policy if exists profiles_select_own_or_admin on public.profiles';
    execute 'create policy profiles_select_own_or_admin on public.profiles for select to authenticated using (public.current_profile_is_active() and (id = (select auth.uid()) or public.current_user_is_administrator_v2()))';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists po_forecast_imports_select_admin on storage.objects';
    execute 'drop policy if exists po_forecast_imports_insert_admin on storage.objects';
    execute 'drop policy if exists po_forecast_imports_delete_admin on storage.objects';
  end if;

  if to_regclass('public.import_issues') is not null then delete from public.import_issues; end if;
  if to_regclass('public.import_staging_rows') is not null then delete from public.import_staging_rows; end if;
  if to_regclass('public.sales_demand') is not null then delete from public.sales_demand; end if;
  if to_regclass('public.inventory_snapshots') is not null then delete from public.inventory_snapshots; end if;
  if to_regclass('public.purchased_receipts') is not null then delete from public.purchased_receipts; end if;
  if to_regclass('public.product_prices') is not null then delete from public.product_prices; end if;
  if to_regclass('public.source_snapshots') is not null then delete from public.source_snapshots; end if;
  if to_regclass('public.version_diffs') is not null then delete from public.version_diffs; end if;
  if to_regclass('public.purchase_lines') is not null then delete from public.purchase_lines; end if;
  if to_regclass('public.purchase_batches') is not null then delete from public.purchase_batches; end if;
  if to_regclass('public.plan_monthly_demand') is not null then delete from public.plan_monthly_demand; end if;
  if to_regclass('public.plan_lines') is not null then delete from public.plan_lines; end if;
  if to_regclass('public.approval_steps') is not null then delete from public.approval_steps; end if;
  if to_regclass('public.approval_requests') is not null then delete from public.approval_requests; end if;
  if to_regclass('public.approval_policy_brands') is not null then delete from public.approval_policy_brands; end if;
  if to_regclass('public.approval_policies') is not null then delete from public.approval_policies; end if;
  if to_regclass('public.plan_versions') is not null then delete from public.plan_versions; end if;
  if to_regclass('public.planning_cycles') is not null then delete from public.planning_cycles; end if;
  if to_regclass('public.suppliers') is not null then delete from public.suppliers; end if;
  if to_regclass('public.planning_settings') is not null then delete from public.planning_settings; end if;

  -- The legacy projection view is not part of the V2 contract and otherwise
  -- keeps the old plan tables alive through a view dependency.
  execute 'drop view if exists public.plan_projection_view';

  delete from public.user_brand_permissions;
  delete from public.sku_aliases;
  delete from public.products;
  delete from public.brands;

  update public.profiles
  set org_tier = 'executive'::public.org_tier,
      is_active = true,
      updated_at = now()
  where id = retained_admin_id;

  delete from public.user_capabilities where user_id = retained_admin_id;
  insert into public.user_capabilities (user_id, capability)
  values
    (retained_admin_id, 'administer_system'::public.user_capability),
    (retained_admin_id, 'create_annual_plan'::public.user_capability),
    (retained_admin_id, 'view_approved_plan'::public.user_capability),
    (retained_admin_id, 'create_purchase_proposal'::public.user_capability),
    (retained_admin_id, 'manage_master_data'::public.user_capability)
  on conflict do nothing;

  -- The controlled runner must perform backup/restore rehearsal first. These
  -- drops deliberately omit CASCADE so an unexpected dependency aborts safely.
  execute 'drop table if exists public.import_issues';
  execute 'drop table if exists public.import_staging_rows';
  execute 'drop table if exists public.sales_demand';
  execute 'drop table if exists public.inventory_snapshots';
  execute 'drop table if exists public.purchased_receipts';
  execute 'drop table if exists public.product_prices';
  execute 'drop table if exists public.source_snapshots';
  execute 'drop table if exists public.version_diffs';
  execute 'drop table if exists public.purchase_lines';
  execute 'drop table if exists public.purchase_batches';
  execute 'drop table if exists public.plan_monthly_demand';
  execute 'drop table if exists public.plan_lines';
  execute 'drop table if exists public.approval_steps';
  execute 'drop table if exists public.approval_requests';
  execute 'drop table if exists public.approval_policy_brands';
  execute 'drop table if exists public.approval_policies';
  execute 'drop table if exists public.plan_versions';
  execute 'drop table if exists public.planning_cycles';
  execute 'drop table if exists public.import_batches';
  execute 'drop table if exists public.suppliers';
  execute 'drop table if exists public.planning_settings';
  execute 'drop table if exists public.user_brand_access';
  execute 'drop table if exists public.user_roles';
  execute 'drop table if exists public.roles';

  execute 'drop function if exists public.set_user_access(uuid, public.app_role[], uuid[], boolean, uuid)';
  execute 'drop function if exists public.list_manageable_user_access()';
  execute 'drop function if exists public.can_administer_user(uuid)';
  execute 'drop function if exists public.can_plan_brand(uuid)';
  execute 'drop function if exists public.can_access_plan_version(uuid)';
  execute 'drop function if exists public.can_edit_plan_version(uuid)';
  execute 'drop function if exists public.plan_version_brand_id(uuid)';
  execute 'drop function if exists public.submit_plan(uuid, uuid, jsonb)';
  execute 'drop function if exists public.approve_step(uuid, uuid, text)';
  execute 'drop function if exists public.request_changes(uuid, uuid, text)';

  -- Remove every remaining legacy helper whose PL/pgSQL body mentions a
  -- retired table.  This runs after table/trigger removal so trigger-owned
  -- functions can be dropped without CASCADE.  Unexpected dependencies still
  -- abort the transaction, preserving the no-partial-cutover guarantee.
  for legacy_function in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.oid <> 'public.perform_v2_legacy_cutover()'::regprocedure
      and p.prosrc ~* '(import_issues|import_staging_rows|import_batches|sales_demand|inventory_snapshots|purchased_receipts|source_snapshots|version_diffs|purchase_lines|purchase_batches|plan_monthly_demand|plan_lines|plan_versions|planning_cycles|approval_steps|approval_requests|(^|[^a-z_])approval_policy_brands([^a-z_]|$)|(^|[^a-z_])approval_policies([^a-z_]|$)|suppliers|product_prices|planning_settings|user_brand_access|user_roles|public\.roles)'
  loop
    execute 'drop function if exists ' || legacy_function;
  end loop;

  execute 'drop type if exists public.import_issue_severity';
  execute 'drop type if exists public.import_batch_status';
  execute 'drop type if exists public.approval_step_status';
  execute 'drop type if exists public.approval_request_status';
  execute 'drop type if exists public.approval_mode';
  execute 'drop type if exists public.app_role';
  execute 'drop type if exists public.plan_status';
  execute 'drop type if exists public.purchase_batch_status';
end;
$$;

revoke all on function public.perform_v2_legacy_cutover() from public, anon, authenticated;

-- Keep the retained Sagen administrator but remove all old brand scope and
-- preserve a clean V2 capability baseline. The controlled script sets the
-- session actor and may apply the final admin identity update separately.
