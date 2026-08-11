drop policy if exists po_forecast_imports_select_admin on storage.objects;
drop policy if exists po_forecast_imports_insert_admin on storage.objects;
drop policy if exists po_forecast_imports_delete_admin on storage.objects;

create policy po_forecast_imports_select_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'po-forecast-imports'
  and coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.can_administer_brand(((storage.foldername(name))[1])::uuid)
);

create policy po_forecast_imports_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'po-forecast-imports'
  and coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.can_administer_brand(((storage.foldername(name))[1])::uuid)
);

create policy po_forecast_imports_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'po-forecast-imports'
  and coalesce((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.can_administer_brand(((storage.foldername(name))[1])::uuid)
);
