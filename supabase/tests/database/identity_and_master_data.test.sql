begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_table('public', 'brands', 'brands exists');
select has_table('public', 'sku_aliases', 'sku aliases exist');
select col_is_unique('public', 'sku_aliases', 'alias_sku', 'alias is unique');
select policies_are(
  'public',
  'brands',
  array['brands_select_by_access', 'brands_manage_by_access'],
  'brand RLS policies exist'
);
select is(
  (select canonical_sku from public.products where canonical_sku = 'ET-015025'),
  'ET-015025',
  'Đặc trị xanh canonical product exists'
);
select is(
  (select count(distinct product_id) from public.sku_aliases where alias_sku in ('ET-015025', 'ET-015026', 'ET-015027')),
  1::bigint,
  'all three Đặc trị xanh aliases map to one product'
);
select is(
  (select is_active from public.products where canonical_sku = 'ET-015150'),
  true,
  'ET-015150 remains active'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*) from public.brands),
  0::bigint,
  'a user without brand membership cannot select brands'
);
reset role;

select * from finish();

rollback;
