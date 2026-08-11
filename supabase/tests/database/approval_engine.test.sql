begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

select has_table('public', 'approval_policies', 'approval policies exist');
select has_table('public', 'approval_policy_brands', 'brand policy assignments exist');
select has_table('public', 'approval_requests', 'approval requests exist');
select has_table('public', 'approval_steps', 'approval steps exist');

select is(
  (
    select mode::text
    from public.approval_policies
    where is_default and is_active
  ),
  'fixed_two_level',
  'system default policy is active fixed two-level'
);

insert into public.planning_cycles (
  id,
  brand_id,
  code,
  name,
  planning_year
)
values (
  '40000000-0000-0000-0000-000000000070',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2070-APPROVAL-TEST',
  'ETX approval routing test',
  2070
);

insert into public.plan_versions (
  id,
  planning_cycle_id,
  version_number,
  status
)
values
  ('41000000-0000-0000-0000-000000000070', '40000000-0000-0000-0000-000000000070', 1, 'draft'),
  ('41000000-0000-0000-0000-000000000071', '40000000-0000-0000-0000-000000000070', 2, 'draft'),
  ('41000000-0000-0000-0000-000000000072', '40000000-0000-0000-0000-000000000070', 3, 'draft'),
  ('41000000-0000-0000-0000-000000000073', '40000000-0000-0000-0000-000000000070', 4, 'draft');

insert into public.purchase_batches (
  id,
  plan_version_id,
  batch_number,
  name,
  order_date,
  eta_date,
  status
)
values
  ('43000000-0000-0000-0000-000000000070', '41000000-0000-0000-0000-000000000070', 1, 'Default route', '2069-10-01', '2070-01-01', 'planned'),
  ('43000000-0000-0000-0000-000000000071', '41000000-0000-0000-0000-000000000071', 1, 'Under threshold', '2069-10-01', '2070-01-01', 'planned'),
  ('43000000-0000-0000-0000-000000000072', '41000000-0000-0000-0000-000000000072', 1, 'At threshold', '2069-10-01', '2070-01-01', 'planned'),
  ('43000000-0000-0000-0000-000000000073', '41000000-0000-0000-0000-000000000073', 1, 'Exception route', '2069-10-01', '2070-01-01', 'planned');

insert into public.purchase_lines (
  purchase_batch_id,
  product_id,
  qty,
  foc_qty,
  ex_price
)
values
  ('43000000-0000-0000-0000-000000000070', '20000000-0000-0000-0000-000000000150', 1, 0, 10),
  ('43000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000150', 1, 0, 999),
  ('43000000-0000-0000-0000-000000000072', '20000000-0000-0000-0000-000000000150', 1, 0, 1000),
  ('43000000-0000-0000-0000-000000000073', '20000000-0000-0000-0000-000000000150', 1, 0, 1);

select lives_ok(
  $$
    select public.submit_plan(
      '41000000-0000-0000-0000-000000000070'::uuid,
      '70000000-0000-0000-0000-000000000070'::uuid,
      '{}'::jsonb
    )
  $$,
  'a Draft can be submitted under the default policy'
);

select is(
  (
    select required_levels
    from public.approval_requests
    where plan_version_id = '41000000-0000-0000-0000-000000000070'
  ),
  2::smallint,
  'default policy snapshot requires two levels'
);

insert into public.approval_policies (
  id,
  name,
  mode,
  threshold_amount,
  currency_code,
  effective_from,
  is_active
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    'ETX threshold 1,000',
    'threshold',
    1000,
    'EUR',
    current_date,
    true
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    'Overlapping test policy',
    'threshold',
    2000,
    'EUR',
    current_date,
    true
  );

insert into public.approval_policy_brands (
  policy_id,
  brand_id,
  effective_from
)
values (
  '71000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  current_date
);

select throws_ok(
  $$
    insert into public.approval_policy_brands (
      policy_id,
      brand_id,
      effective_from
    )
    values (
      '71000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      current_date
    )
  $$,
  'P0001',
  'approval_policy_period_overlap',
  'one brand cannot have overlapping policy periods'
);

select public.submit_plan(
  '41000000-0000-0000-0000-000000000071'::uuid,
  '70000000-0000-0000-0000-000000000071'::uuid,
  '{}'::jsonb
);
select public.submit_plan(
  '41000000-0000-0000-0000-000000000072'::uuid,
  '70000000-0000-0000-0000-000000000072'::uuid,
  '{}'::jsonb
);
select public.submit_plan(
  '41000000-0000-0000-0000-000000000073'::uuid,
  '70000000-0000-0000-0000-000000000073'::uuid,
  '{"budgetExceeded":true}'::jsonb
);

select is(
  (select required_levels from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000071'),
  1::smallint,
  'amount below threshold routes to one level'
);

select is(
  (select required_levels from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000072'),
  2::smallint,
  'amount at threshold routes to two levels'
);

select is(
  (select routing_reason from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000073'),
  'exception',
  'an escalation exception always routes to two levels'
);

select public.approve_step(
  (select id from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000070'),
  '72000000-0000-0000-0000-000000000070'::uuid,
  'L1 approved'
);

select is(
  (select status::text from public.plan_versions where id = '41000000-0000-0000-0000-000000000070'),
  'review_l2',
  'first approval advances a two-level request to L2'
);

select public.approve_step(
  (select id from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000070'),
  '72000000-0000-0000-0000-000000000071'::uuid,
  'L2 approved'
);

select is(
  (select status::text from public.plan_versions where id = '41000000-0000-0000-0000-000000000070'),
  'approved',
  'second approval finalizes a two-level request'
);

select public.approve_step(
  (select id from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000071'),
  '72000000-0000-0000-0000-000000000072'::uuid,
  'One-level approved'
);

select is(
  (select status::text from public.plan_versions where id = '41000000-0000-0000-0000-000000000071'),
  'approved',
  'one-level threshold branch finalizes after L1'
);

select public.request_changes(
  (select id from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000072'),
  '73000000-0000-0000-0000-000000000072'::uuid,
  'Please revise Qty'
);

select is(
  (select status::text from public.plan_versions where id = '41000000-0000-0000-0000-000000000072'),
  'changes_requested',
  'request changes closes review without editing snapshot rows'
);

insert into auth.users (id)
values ('90000000-0000-0000-0000-000000000097');
update public.profiles
set display_name = 'Planner cannot approve'
where id = '90000000-0000-0000-0000-000000000097';
insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000097', 'planner');
insert into public.user_brand_access (user_id, brand_id)
values (
  '90000000-0000-0000-0000-000000000097',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000097',
  true
);

select throws_ok(
  $$
    select public.approve_step(
      (select id from public.approval_requests where plan_version_id = '41000000-0000-0000-0000-000000000073'),
      '72000000-0000-0000-0000-000000000073'::uuid,
      'Unauthorized approval'
    )
  $$,
  '42501',
  'approval_role_required',
  'a planner cannot execute an approval step'
);

reset role;

select throws_ok(
  $$
    update public.approval_policies
    set effective_to = current_date - 1
    where is_default
  $$,
  'P0001',
  'default_approval_policy_required',
  'the system default policy cannot be expired'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.approval_request_brand_id(uuid)',
    'EXECUTE'
  ),
  'internal request-to-brand helper is not directly exposed'
);

select * from finish();

rollback;
