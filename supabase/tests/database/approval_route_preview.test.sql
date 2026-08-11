begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select has_function(
  'public',
  'preview_plan_approval_route',
  array['uuid', 'jsonb'],
  'approval route preview RPC exists'
);

insert into public.planning_cycles (
  id, brand_id, code, name, planning_year, currency_code
)
values (
  '40000000-0000-0000-0000-000000000084',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2084-PREVIEW-TEST',
  'ETX approval route preview test',
  2084,
  'EUR'
);

insert into public.plan_versions (
  id, planning_cycle_id, version_number, status
)
values (
  '41000000-0000-0000-0000-000000000084',
  '40000000-0000-0000-0000-000000000084',
  1,
  'draft'
);

insert into public.purchase_batches (
  id, plan_version_id, batch_number, name, order_date, eta_date, status
)
values (
  '43000000-0000-0000-0000-000000000084',
  '41000000-0000-0000-0000-000000000084',
  1,
  'Preview route',
  '2083-10-01',
  '2084-01-01',
  'planned'
);

insert into public.purchase_lines (
  purchase_batch_id, product_id, qty, foc_qty, ex_price
)
values (
  '43000000-0000-0000-0000-000000000084',
  '20000000-0000-0000-0000-000000000150',
  3,
  0,
  12.5
);

select is(
  public.preview_plan_approval_route(
    '41000000-0000-0000-0000-000000000084',
    '{}'::jsonb
  ) ->> 'reason',
  'fixed',
  'default preview uses fixed two-level policy'
);

select is(
  public.preview_plan_approval_route(
    '41000000-0000-0000-0000-000000000084',
    '{}'::jsonb
  ) ->> 'levels',
  '2',
  'default preview reports two levels'
);

select is(
  public.preview_plan_approval_route(
    '41000000-0000-0000-0000-000000000084',
    '{}'::jsonb
  ) ->> 'planAmount',
  '37.50',
  'preview amount is calculated from canonical purchase line amount'
);

select * from finish();

rollback;
