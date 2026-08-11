begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_table('public', 'audit_events', 'append-only audit events exist');
select has_table('public', 'version_diffs', 'persisted version diffs exist');
select has_table('public', 'action_idempotency', 'action idempotency receipts exist');
select has_function(
  'public',
  'create_plan_revision',
  array['uuid', 'uuid'],
  'revision RPC exists'
);
select has_function(
  'public',
  'save_draft_changes',
  array['uuid', 'integer', 'jsonb', 'uuid'],
  'compare-and-swap Draft save RPC exists'
);
select has_column(
  'public',
  'approval_requests',
  'submit_request',
  'Submit idempotency stores a canonical request payload'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year
)
values (
  '40000000-0000-0000-0000-000000000080',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2080-REVISION-TEST',
  'ETX revision and concurrency test',
  2080
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status,
  approved_at
)
values (
  '41000000-0000-0000-0000-000000000080',
  '40000000-0000-0000-0000-000000000080',
  1,
  'approved',
  now()
);

select set_config('app.allow_plan_version_mutation', 'on', true);

insert into public.plan_lines (
  id,
  plan_version_id,
  product_id,
  opening_stock,
  target_stock,
  notes
)
values (
  '42000000-0000-0000-0000-000000000080',
  '41000000-0000-0000-0000-000000000080',
  '20000000-0000-0000-0000-000000000150',
  32,
  0,
  'Approved source snapshot'
);

insert into public.plan_monthly_demand (
  id,
  plan_line_id,
  demand_month,
  demand_qty
)
values (
  '44000000-0000-0000-0000-000000000080',
  '42000000-0000-0000-0000-000000000080',
  '2080-01-01',
  2400
);

insert into public.purchase_batches (
  id,
  plan_version_id,
  batch_number,
  name,
  order_date,
  eta_date,
  status,
  currency_code
)
values (
  '43000000-0000-0000-0000-000000000080',
  '41000000-0000-0000-0000-000000000080',
  1,
  'PO proposal',
  '2079-10-01',
  '2080-01-01',
  'planned',
  'EUR'
);

insert into public.purchase_lines (
  id,
  purchase_batch_id,
  product_id,
  qty,
  foc_qty,
  ex_price
)
values (
  '45000000-0000-0000-0000-000000000080',
  '43000000-0000-0000-0000-000000000080',
  '20000000-0000-0000-0000-000000000150',
  0,
  0,
  2.71
);

select set_config('app.allow_plan_version_mutation', 'off', true);

select lives_ok(
  $$
    select public.create_plan_revision(
      '41000000-0000-0000-0000-000000000080'::uuid,
      '80000000-0000-0000-0000-000000000080'::uuid
    )
  $$,
  'an Approved snapshot can create a Draft revision'
);

select results_eq(
  $$
    select parent_version_id, version_number, status::text, lock_version
    from public.plan_versions
    where parent_version_id = '41000000-0000-0000-0000-000000000080'
  $$,
  $$
    values (
      '41000000-0000-0000-0000-000000000080'::uuid,
      2,
      'draft'::text,
      0
    )
  $$,
  'revision preserves lineage and starts as unlocked Draft version 2'
);

select results_eq(
  $$
    select
      (select count(*) from public.plan_lines where plan_version_id = revision.id),
      (
        select count(*)
        from public.plan_monthly_demand
        join public.plan_lines on plan_lines.id = plan_monthly_demand.plan_line_id
        where plan_lines.plan_version_id = revision.id
      ),
      (select count(*) from public.purchase_batches where plan_version_id = revision.id),
      (
        select count(*)
        from public.purchase_lines
        join public.purchase_batches on purchase_batches.id = purchase_lines.purchase_batch_id
        where purchase_batches.plan_version_id = revision.id
      )
    from public.plan_versions revision
    where revision.parent_version_id = '41000000-0000-0000-0000-000000000080'
  $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'revision copies plan lines, demand, PO batches and PO lines'
);

select is(
  (select status::text from public.plan_versions where id = '41000000-0000-0000-0000-000000000080'),
  'approved',
  'source Approved version remains unchanged while revision is Draft'
);

select public.create_plan_revision(
  '41000000-0000-0000-0000-000000000080'::uuid,
  '80000000-0000-0000-0000-000000000080'::uuid
);

select is(
  (
    select count(*)
    from public.plan_versions
    where parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  1::bigint,
  'retrying revision creation does not create a duplicate'
);

select is(
  (
    select count(*)
    from public.audit_events
    where event_type = 'plan_revision_created'
      and idempotency_key = '80000000-0000-0000-0000-000000000080'
  ),
  1::bigint,
  'revision creation writes exactly one audit event'
);

select is(
  (
    select diff_data
    from public.version_diffs
    where from_version_id = '41000000-0000-0000-0000-000000000080'
      and to_version_id = (
        select id
        from public.plan_versions
        where parent_version_id = '41000000-0000-0000-0000-000000000080'
      )
  ),
  '[]'::jsonb,
  'a copied revision starts with an empty persisted diff'
);

select is(
  public.save_draft_changes(
    (
      select id
      from public.plan_versions
      where parent_version_id = '41000000-0000-0000-0000-000000000080'
    ),
    0,
    jsonb_build_object(
      'planLines',
      jsonb_build_array(
        jsonb_build_object(
          'id',
          (
            select plan_lines.id
            from public.plan_lines
            join public.plan_versions on plan_versions.id = plan_lines.plan_version_id
            where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
          ),
          'openingStock',
          33
        )
      ),
      'purchaseLines',
      jsonb_build_array(
        jsonb_build_object(
          'id',
          (
            select purchase_lines.id
            from public.purchase_lines
            join public.purchase_batches on purchase_batches.id = purchase_lines.purchase_batch_id
            join public.plan_versions on plan_versions.id = purchase_batches.plan_version_id
            where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
          ),
          'qty',
          2368
        )
      )
    ),
    '81000000-0000-0000-0000-000000000080'::uuid
  ),
  1,
  'first Draft save increments lock_version to 1'
);

select results_eq(
  $$
    select
      plan_versions.lock_version,
      plan_lines.opening_stock,
      purchase_lines.qty,
      purchase_lines.amount
    from public.plan_versions
    join public.plan_lines on plan_lines.plan_version_id = plan_versions.id
    join public.purchase_batches on purchase_batches.plan_version_id = plan_versions.id
    join public.purchase_lines on purchase_lines.purchase_batch_id = purchase_batches.id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  $$,
  $$ values (1, 33, 2368, 6417.28::numeric) $$,
  'CAS save applies canonical changes and recalculates Amount from Qty × Ex Price'
);

select is(
  (
    select count(*)
    from public.version_diffs,
         jsonb_array_elements(version_diffs.diff_data) as diff
    where version_diffs.to_version_id = (
      select id
      from public.plan_versions
      where parent_version_id = '41000000-0000-0000-0000-000000000080'
    )
      and diff ->> 'path' like 'planLines.%openingStock'
  ),
  1::bigint,
  'Draft edits refresh the persisted version diff'
);

select throws_ok(
  $$
    select public.save_draft_changes(
      (
        select id
        from public.plan_versions
        where parent_version_id = '41000000-0000-0000-0000-000000000080'
      ),
      0,
      jsonb_build_object(
        'purchaseLines',
        jsonb_build_array(
          jsonb_build_object(
            'id',
            (
              select purchase_lines.id
              from public.purchase_lines
              join public.purchase_batches on purchase_batches.id = purchase_lines.purchase_batch_id
              join public.plan_versions on plan_versions.id = purchase_batches.plan_version_id
              where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
            ),
            'qty',
            9999
          )
        )
      ),
      '81000000-0000-0000-0000-000000000081'::uuid
    )
  $$,
  'P0001',
  'PLAN_VERSION_CONFLICT',
  'stale Draft save returns a conflict instead of overwriting'
);

select is(
  (
    select purchase_lines.qty
    from public.purchase_lines
    join public.purchase_batches on purchase_batches.id = purchase_lines.purchase_batch_id
    join public.plan_versions on plan_versions.id = purchase_batches.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  2368,
  'conflicting save leaves the accepted value unchanged'
);

select is(
  public.save_draft_changes(
    (
      select id
      from public.plan_versions
      where parent_version_id = '41000000-0000-0000-0000-000000000080'
    ),
    0,
    '{}'::jsonb,
    '81000000-0000-0000-0000-000000000080'::uuid
  ),
  1,
  'retrying an accepted save returns its original lock version'
);

select is(
  (
    select count(*)
    from public.audit_events
    where event_type = 'draft_saved'
      and idempotency_key = '81000000-0000-0000-0000-000000000080'
  ),
  1::bigint,
  'idempotent Draft save writes one audit event'
);

select throws_ok(
  $$
    update public.audit_events
    set event_type = 'tampered'
    where idempotency_key = '81000000-0000-0000-0000-000000000080'
  $$,
  'P0001',
  'audit_events_append_only',
  'audit events cannot be updated'
);

select public.submit_plan(
  (
    select id
    from public.plan_versions
    where parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  '82000000-0000-0000-0000-000000000080'::uuid,
  '{}'::jsonb
);
select public.submit_plan(
  (
    select id
    from public.plan_versions
    where parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  '82000000-0000-0000-0000-000000000080'::uuid,
  '{}'::jsonb
);

select is(
  (
    select count(*)
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  1::bigint,
  'retrying Submit creates one approval request'
);

select is(
  (
    select submit_request
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  jsonb_build_object(
    'planVersionId',
    (
      select id
      from public.plan_versions
      where parent_version_id = '41000000-0000-0000-0000-000000000080'
    ),
    'exceptionFlags', '{}'::jsonb
  ),
  'Submit stores the canonical version and exception payload'
);

select throws_ok(
  $$
    select public.submit_plan(
      '41000000-0000-0000-0000-000000000080'::uuid,
      '82000000-0000-0000-0000-000000000080'::uuid,
      '{"criticalShortage": true}'::jsonb
    )
  $$,
  'P0001',
  'idempotency_key_reused',
  'reusing Submit key with a different payload is rejected'
);

select throws_ok(
  $$
    select public.submit_plan(
      '41000000-0000-0000-0000-000000000080'::uuid,
      '82000000-0000-0000-0000-000000000080'::uuid,
      '{}'::jsonb
    )
  $$,
  'P0001',
  'idempotency_key_reused',
  'reusing Submit key for a different plan version is rejected'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000005',
  true
);

select throws_ok(
  $$
    select public.submit_plan(
      '41000000-0000-0000-0000-000000000080'::uuid,
      '82000000-0000-0000-0000-000000000080'::uuid,
      '{}'::jsonb
    )
  $$,
  '42501',
  'plan_submit_forbidden',
  'an unauthorized viewer cannot replay another users Submit key'
);
reset role;
reset request.jwt.claim.sub;

select public.approve_step(
  (
    select approval_requests.id
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  '83000000-0000-0000-0000-000000000080'::uuid,
  'L1 approved'
);
select public.approve_step(
  (
    select approval_requests.id
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  '83000000-0000-0000-0000-000000000080'::uuid,
  'L1 retry'
);

select results_eq(
  $$
    select approval_requests.status::text, count(*) filter (where approval_steps.status = 'approved')
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    join public.approval_steps on approval_steps.approval_request_id = approval_requests.id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
    group by approval_requests.status
  $$,
  $$ values ('pending_l2'::text, 1::bigint) $$,
  'retrying L1 approval does not advance or act twice'
);

select public.approve_step(
  (
    select approval_requests.id
    from public.approval_requests
    join public.plan_versions on plan_versions.id = approval_requests.plan_version_id
    where plan_versions.parent_version_id = '41000000-0000-0000-0000-000000000080'
  ),
  '83000000-0000-0000-0000-000000000081'::uuid,
  'L2 approved'
);

select results_eq(
  $$
    select source.status::text, revision.status::text
    from public.plan_versions source
    join public.plan_versions revision on revision.parent_version_id = source.id
    where source.id = '41000000-0000-0000-0000-000000000080'
  $$,
  $$ values ('superseded'::text, 'approved'::text) $$,
  'approving a revision supersedes its previously Approved parent'
);

select ok(
  not has_function_privilege('anon', 'public.commit_import_batch(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_plan(uuid,uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_step(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.request_changes(uuid,uuid,text)', 'EXECUTE'),
  'anonymous users cannot execute protected action RPC wrappers'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000096',
  true
);

select is(
  (select count(*) from public.audit_events),
  0::bigint,
  'audit RLS hides events from users outside the brand'
);

reset role;

select * from finish();

rollback;
