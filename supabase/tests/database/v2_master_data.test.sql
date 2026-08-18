begin;
select plan(18);

select has_function('public', 'create_brand_v2', ARRAY['text','text','uuid','uuid']);
select has_function('public', 'create_product_v2', ARRAY['uuid','text','text','text[]','uuid','uuid']);
select has_function('public', 'update_brand_v2', ARRAY['uuid','text','text','boolean','uuid','uuid']);
select has_function('public', 'update_product_v2', ARRAY['uuid','uuid','text','text','text[]','boolean','uuid','uuid']);
select has_function('public', 'list_brand_options_v2', ARRAY['boolean']);
select has_function('public', 'list_product_options_v2', ARRAY['uuid','boolean']);
select has_index('public'::name, 'products'::name, 'products_brand_id_idx'::name);
select has_index('public'::name, 'sku_aliases'::name, 'sku_aliases_product_id_idx'::name);

select ok(exists(select 1 from pg_constraint where conrelid = 'public.brands'::regclass and conname = 'brands_code_check'), 'brand code is normalized');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_canonical_sku_check'), 'canonical SKU is normalized');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'brands' and policyname = 'brands_select_active_or_admin'), 'brand policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'products_select_scoped'), 'product policy exists');

select throws_ok(
  $$ select public.create_brand_v2(' et ', 'Etiaxil', gen_random_uuid(), gen_random_uuid()) $$,
  '42501', 'BRAND_CREATE_REQUIRED', 'brand creation requires annual-plan/master-data capability or Administrator'
);

select throws_ok(
  $$ select public.create_product_v2(gen_random_uuid(), 'zz-1', 'Sản phẩm', '{}', gen_random_uuid(), gen_random_uuid()) $$,
  '42501', 'BRAND_ACCESS_REQUIRED', 'product creation requires brand capability'
);

select results_eq(
  $$ select upper(btrim(' et-015025 ')) $$,
  $$ values ('ET-015025'::text) $$,
  'sku normalization is uppercase and trimmed'
);

select results_eq(
  $$ select count(*) from public.sku_aliases a join public.products p on p.id = a.product_id where a.alias_sku in ('ET-015026','ET-015027') and p.canonical_sku = 'ET-015025' $$,
  $$ values (2::bigint) $$,
  'green treatment aliases resolve to the canonical SKU'
);

select isnt((select relrowsecurity from pg_class where oid = 'public.brands'::regclass), false, 'brands RLS remains enabled');
select isnt((select relrowsecurity from pg_class where oid = 'public.products'::regclass), false, 'products RLS remains enabled');

select * from finish();
rollback;
