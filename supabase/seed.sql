insert into public.roles (key, name, description)
values
  ('administrator', 'Quản trị viên', 'Quản trị người dùng, dữ liệu chủ và chính sách'),
  ('planner', 'Planner / Buyer', 'Lập và gửi kế hoạch mua hàng'),
  ('approver_l1', 'Người duyệt cấp 1', 'Duyệt nghiệp vụ cấp 1'),
  ('approver_l2', 'Người duyệt cấp 2', 'Phê duyệt cuối'),
  ('viewer', 'Viewer / Auditor', 'Xem, xuất và tra cứu lịch sử')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.brands (id, code, name, is_active)
values (
  '10000000-0000-0000-0000-000000000001',
  'ETX',
  'ETX',
  true
)
on conflict (code) do update
set name = excluded.name,
    is_active = excluded.is_active;

insert into public.products (id, brand_id, canonical_sku, name, is_active)
values
  (
    '20000000-0000-0000-0000-000000000025',
    '10000000-0000-0000-0000-000000000001',
    'ET-015025',
    'Đặc trị xanh',
    true
  ),
  (
    '20000000-0000-0000-0000-000000000150',
    '10000000-0000-0000-0000-000000000001',
    'ET-015150',
    'ET-015150',
    true
  )
on conflict (canonical_sku) do update
set brand_id = excluded.brand_id,
    name = excluded.name,
    is_active = excluded.is_active;

insert into public.sku_aliases (id, product_id, alias_sku)
values
  (
    '30000000-0000-0000-0000-000000000025',
    '20000000-0000-0000-0000-000000000025',
    'ET-015025'
  ),
  (
    '30000000-0000-0000-0000-000000000026',
    '20000000-0000-0000-0000-000000000025',
    'ET-015026'
  ),
  (
    '30000000-0000-0000-0000-000000000027',
    '20000000-0000-0000-0000-000000000025',
    'ET-015027'
  ),
  (
    '30000000-0000-0000-0000-000000000150',
    '20000000-0000-0000-0000-000000000150',
    'ET-015150'
  )
on conflict (alias_sku) do update
set product_id = excluded.product_id;

-- Local-only demo identities. These accounts are recreated by `supabase db reset`
-- and must never be copied to a production project.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  seed.id,
  'authenticated',
  'authenticated',
  seed.email,
  extensions.crypt('LocalDemo!2026', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', seed.display_name),
  now(),
  now(),
  false,
  false
from (
  values
    ('90000000-0000-0000-0000-000000000001'::uuid, 'admin@local.test', 'Local Administrator'),
    ('90000000-0000-0000-0000-000000000002'::uuid, 'planner@local.test', 'Local Planner'),
    ('90000000-0000-0000-0000-000000000003'::uuid, 'approver1@local.test', 'Local Approver L1'),
    ('90000000-0000-0000-0000-000000000004'::uuid, 'approver2@local.test', 'Local Approver L2'),
    ('90000000-0000-0000-0000-000000000005'::uuid, 'viewer@local.test', 'Local Viewer')
) as seed(id, email, display_name)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  seed.email,
  seed.id,
  jsonb_build_object(
    'sub', seed.id::text,
    'email', seed.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from (
  values
    ('90000000-0000-0000-0000-000000000001'::uuid, 'admin@local.test'),
    ('90000000-0000-0000-0000-000000000002'::uuid, 'planner@local.test'),
    ('90000000-0000-0000-0000-000000000003'::uuid, 'approver1@local.test'),
    ('90000000-0000-0000-0000-000000000004'::uuid, 'approver2@local.test'),
    ('90000000-0000-0000-0000-000000000005'::uuid, 'viewer@local.test')
) as seed(id, email)
on conflict (provider_id, provider) do update
set identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

insert into public.profiles (id, display_name)
values
  ('90000000-0000-0000-0000-000000000001', 'Local Administrator'),
  ('90000000-0000-0000-0000-000000000002', 'Local Planner'),
  ('90000000-0000-0000-0000-000000000003', 'Local Approver L1'),
  ('90000000-0000-0000-0000-000000000004', 'Local Approver L2'),
  ('90000000-0000-0000-0000-000000000005', 'Local Viewer')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.user_roles (user_id, role)
values
  ('90000000-0000-0000-0000-000000000001', 'administrator'),
  ('90000000-0000-0000-0000-000000000002', 'planner'),
  ('90000000-0000-0000-0000-000000000003', 'approver_l1'),
  ('90000000-0000-0000-0000-000000000004', 'approver_l2'),
  ('90000000-0000-0000-0000-000000000005', 'viewer')
on conflict do nothing;

insert into public.user_brand_access (user_id, brand_id)
select user_id, '10000000-0000-0000-0000-000000000001'::uuid
from unnest(array[
  '90000000-0000-0000-0000-000000000001'::uuid,
  '90000000-0000-0000-0000-000000000002'::uuid,
  '90000000-0000-0000-0000-000000000003'::uuid,
  '90000000-0000-0000-0000-000000000004'::uuid,
  '90000000-0000-0000-0000-000000000005'::uuid
]) as user_ids(user_id)
on conflict do nothing;

insert into public.planning_cycles (
  id, brand_id, code, name, planning_year, target_purchase_amount, currency_code
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ETX-2026',
  'ETX Forecast 2026',
  2026,
  100000,
  'EUR'
)
on conflict (id) do update
set name = excluded.name,
    target_purchase_amount = excluded.target_purchase_amount;

insert into public.plan_versions (
  id, planning_cycle_id, version_number, status, created_by
)
values (
  '41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  1,
  'draft',
  '90000000-0000-0000-0000-000000000002'
)
on conflict (id) do nothing;

insert into public.plan_lines (
  id, plan_version_id, product_id, opening_stock, target_stock, notes
)
values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000150',
  32,
  0,
  'Active; chưa có PO tương lai. Cảnh báo thiếu 2.368.'
)
on conflict (id) do nothing;

insert into public.plan_monthly_demand (
  plan_line_id, demand_month, demand_qty
)
values (
  '42000000-0000-0000-0000-000000000001',
  '2026-01-01',
  2400
)
on conflict (plan_line_id, demand_month) do update
set demand_qty = excluded.demand_qty;
