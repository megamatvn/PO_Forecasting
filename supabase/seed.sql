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
