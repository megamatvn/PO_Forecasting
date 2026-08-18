-- V2 master-data commands. Direct table mutation is intentionally removed from
-- authenticated clients; brand/product ownership changes happen in commands.

create or replace function public.can_use_brand_capability(
  p_brand_id uuid,
  p_capability public.user_capability
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_profile_is_active()
    and (
      public.current_user_is_administrator_v2()
      or exists (
        select 1 from public.brands b
        join public.user_brand_permissions permission
          on permission.brand_id = b.id
         and permission.user_id = (select auth.uid())
         and permission.capability = p_capability
         and (permission.source_kind = 'direct' or public.has_active_reporting_path(permission.source_user_id, (select auth.uid())))
        where b.id = p_brand_id and b.is_active
      )
    );
$$;

create or replace function public.list_brand_options_v2(p_include_inactive boolean default false)
returns table (id uuid, code text, name text, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.code, b.name, b.is_active
  from public.brands b
  where (
    public.current_user_is_administrator_v2()
    or public.can_use_brand_capability(b.id, 'create_annual_plan'::public.user_capability)
    or public.can_use_brand_capability(b.id, 'view_approved_plan'::public.user_capability)
    or public.can_use_brand_capability(b.id, 'manage_master_data'::public.user_capability)
  )
    and (p_include_inactive or b.is_active)
  order by b.code;
$$;

create or replace function public.list_product_options_v2(p_brand_id uuid, p_include_inactive boolean default false)
returns table (id uuid, brand_id uuid, canonical_sku text, name text, is_active boolean, aliases text[])
language sql stable security definer set search_path = ''
as $$
  select p.id, p.brand_id, p.canonical_sku, p.name, p.is_active,
    coalesce((select array_agg(a.alias_sku order by a.alias_sku) from public.sku_aliases a where a.product_id = p.id), '{}'::text[])
  from public.products p
  where p.brand_id = p_brand_id
    and (
      public.current_user_is_administrator_v2()
      or public.can_use_brand_capability(p.brand_id, 'create_annual_plan'::public.user_capability)
      or public.can_use_brand_capability(p.brand_id, 'view_approved_plan'::public.user_capability)
      or public.can_use_brand_capability(p.brand_id, 'manage_master_data'::public.user_capability)
    )
    and (p_include_inactive or p.is_active)
  order by p.canonical_sku;
$$;

create or replace function public.create_brand_v2(
  p_code text,
  p_name text,
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_code text := upper(btrim(p_code));
  normalized_name text := btrim(p_name);
  brand_row public.brands%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
begin
  if not public.current_profile_is_active()
    or not (
      public.current_user_is_administrator_v2()
      or public.current_user_has_capability('create_annual_plan'::public.user_capability)
      or public.current_user_has_capability('manage_master_data'::public.user_capability)
    ) then
    raise exception using errcode = '42501', message = 'BRAND_CREATE_REQUIRED';
  end if;
  if p_correlation_id is null or p_idempotency_key is null or normalized_code = '' or normalized_name = '' then
    raise exception using errcode = 'P0001', message = 'BRAND_INPUT_INVALID';
  end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('code', normalized_code, 'name', normalized_name);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_brand_v2' or existing_action.result -> 'request' <> request_payload then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return existing_action.result -> 'data';
  end if;
  insert into public.brands(code, name, is_active) values (normalized_code, normalized_name, true) returning * into brand_row;
  insert into public.user_brand_permissions(user_id, brand_id, capability, source_kind, source_user_id)
  select actor_id, brand_row.id, capability, 'direct', actor_id
  from unnest(array[
    'create_annual_plan'::public.user_capability,
    'view_approved_plan'::public.user_capability,
    'create_purchase_proposal'::public.user_capability,
    'manage_master_data'::public.user_capability
  ]) capability
  where public.current_user_has_capability(capability)
     or (
       capability = 'view_approved_plan'::public.user_capability
       and (
         public.current_user_has_capability('create_annual_plan'::public.user_capability)
         or public.current_user_has_capability('manage_master_data'::public.user_capability)
       )
     )
  on conflict do nothing;
  perform public.write_audit_event(brand_row.id, 'brand_created', 'brand', brand_row.id, p_idempotency_key, null, jsonb_build_object('code', brand_row.code, 'name', brand_row.name), jsonb_build_object('correlationId', p_correlation_id, 'source', 'v2'));
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('id', brand_row.id, 'code', brand_row.code, 'name', brand_row.name, 'isActive', brand_row.is_active));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_brand_v2', brand_row.id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.update_brand_v2(
  p_brand_id uuid,
  p_code text,
  p_name text,
  p_is_active boolean,
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.brands%rowtype;
  after_row public.brands%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
begin
  if not public.current_profile_is_active() or not public.current_user_is_administrator_v2() then raise exception using errcode = '42501', message = 'BRAND_ADMIN_REQUIRED'; end if;
  if p_brand_id is null or p_correlation_id is null or p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'BRAND_INPUT_INVALID'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('brandId', p_brand_id, 'code', p_code, 'name', p_name, 'isActive', p_is_active);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'update_brand_v2' or existing_action.resource_id <> p_brand_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into before_row from public.brands where id = p_brand_id for update;
  if before_row.id is null then raise exception using errcode = 'P0001', message = 'BRAND_NOT_FOUND'; end if;
  if p_is_active = false and before_row.is_active and exists (select 1 from public.planning_cycles c where c.brand_id = p_brand_id and c.is_active) then raise exception using errcode = 'P0001', message = 'BRAND_HAS_DEPENDENTS'; end if;
  update public.brands set code = coalesce(nullif(upper(btrim(p_code)), ''), code), name = coalesce(nullif(btrim(p_name), ''), name), is_active = coalesce(p_is_active, is_active), updated_at = now() where id = p_brand_id returning * into after_row;
  perform public.write_audit_event(p_brand_id, 'brand_updated', 'brand', p_brand_id, p_idempotency_key, to_jsonb(before_row), to_jsonb(after_row), jsonb_build_object('correlationId', p_correlation_id, 'source', 'v2'));
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('id', after_row.id, 'code', after_row.code, 'name', after_row.name, 'isActive', after_row.is_active));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'update_brand_v2', p_brand_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.create_product_v2(
  p_brand_id uuid,
  p_sku text,
  p_name text,
  p_aliases text[],
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  brand_row public.brands%rowtype;
  product_row public.products%rowtype;
  normalized_sku text := upper(btrim(p_sku));
  normalized_name text := btrim(p_name);
  warning text := null;
  alias_value text;
  request_payload jsonb;
  existing_action public.action_idempotency%rowtype;
begin
  if not public.current_profile_is_active() or not (
    public.current_user_is_administrator_v2()
    or public.can_use_brand_capability(p_brand_id, 'create_annual_plan'::public.user_capability)
    or public.can_use_brand_capability(p_brand_id, 'manage_master_data'::public.user_capability)
  ) then raise exception using errcode = '42501', message = 'BRAND_ACCESS_REQUIRED'; end if;
  if p_brand_id is null or p_correlation_id is null or p_idempotency_key is null or normalized_sku = '' or normalized_name = '' then raise exception using errcode = 'P0001', message = 'PRODUCT_INPUT_INVALID'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('brandId', p_brand_id, 'sku', normalized_sku, 'name', normalized_name, 'aliases', to_jsonb(coalesce(p_aliases, '{}'::text[])));
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'create_product_v2' or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into brand_row from public.brands where id = p_brand_id and is_active;
  if brand_row.id is null then raise exception using errcode = 'P0001', message = 'BRAND_NOT_FOUND'; end if;
  if position('-' in normalized_sku) > 0 and split_part(normalized_sku, '-', 1) <> brand_row.code then warning := 'SKU không cùng tiền tố nhãn hàng.'; end if;
  insert into public.products(brand_id, canonical_sku, name, is_active) values (p_brand_id, normalized_sku, normalized_name, true) returning * into product_row;
  foreach alias_value in array coalesce(p_aliases, '{}'::text[]) loop
    insert into public.sku_aliases(product_id, alias_sku) values (product_row.id, upper(btrim(alias_value))) on conflict (alias_sku) do nothing;
  end loop;
  if normalized_sku = 'ET-015025' then
    insert into public.sku_aliases(product_id, alias_sku) values (product_row.id, 'ET-015026'), (product_row.id, 'ET-015027') on conflict (alias_sku) do nothing;
  end if;
  perform public.write_audit_event(p_brand_id, 'product_created', 'product', product_row.id, p_idempotency_key, null, jsonb_build_object('sku', product_row.canonical_sku, 'name', product_row.name), jsonb_build_object('correlationId', p_correlation_id, 'source', 'v2'));
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('id', product_row.id, 'brandId', product_row.brand_id, 'canonicalSku', product_row.canonical_sku, 'name', product_row.name, 'isActive', product_row.is_active, 'aliases', coalesce((select jsonb_agg(alias_sku order by alias_sku) from public.sku_aliases where product_id = product_row.id), '[]'::jsonb), 'warning', warning));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'create_product_v2', product_row.id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

create or replace function public.update_product_v2(
  p_product_id uuid,
  p_brand_id uuid,
  p_sku text,
  p_name text,
  p_aliases text[],
  p_is_active boolean,
  p_correlation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.products%rowtype;
  after_row public.products%rowtype;
  existing_action public.action_idempotency%rowtype;
  request_payload jsonb;
begin
  if not public.current_profile_is_active() or not (public.current_user_is_administrator_v2() or public.can_use_brand_capability(p_brand_id, 'manage_master_data'::public.user_capability)) then raise exception using errcode = '42501', message = 'BRAND_ACCESS_REQUIRED'; end if;
  perform public.lock_action_idempotency_key(p_idempotency_key);
  request_payload := jsonb_build_object('productId', p_product_id, 'brandId', p_brand_id, 'sku', p_sku, 'name', p_name, 'aliases', to_jsonb(coalesce(p_aliases, '{}'::text[])), 'isActive', p_is_active);
  select * into existing_action from public.action_idempotency where idempotency_key = p_idempotency_key;
  if found then
    if existing_action.action_type <> 'update_product_v2' or existing_action.resource_id <> p_product_id or existing_action.result -> 'request' <> request_payload then raise exception using errcode = 'P0001', message = 'idempotency_key_reused'; end if;
    return existing_action.result -> 'data';
  end if;
  select * into before_row from public.products where id = p_product_id for update;
  if before_row.id is null or before_row.brand_id <> p_brand_id then raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND'; end if;
  if p_is_active = false and before_row.is_active and exists (select 1 from public.plan_lines l where l.product_id = p_product_id) then raise exception using errcode = 'P0001', message = 'PRODUCT_HAS_DEPENDENTS'; end if;
  update public.products set canonical_sku = coalesce(nullif(upper(btrim(p_sku)), ''), canonical_sku), name = coalesce(nullif(btrim(p_name), ''), name), is_active = coalesce(p_is_active, is_active), updated_at = now() where id = p_product_id returning * into after_row;
  if p_aliases is not null then delete from public.sku_aliases where product_id = p_product_id; insert into public.sku_aliases(product_id, alias_sku) select p_product_id, upper(btrim(value)) from unnest(p_aliases) value on conflict (alias_sku) do nothing; end if;
  perform public.write_audit_event(p_brand_id, 'product_updated', 'product', p_product_id, p_idempotency_key, to_jsonb(before_row), to_jsonb(after_row), jsonb_build_object('correlationId', p_correlation_id, 'source', 'v2'));
  request_payload := jsonb_build_object('request', request_payload, 'data', jsonb_build_object('id', after_row.id, 'brandId', after_row.brand_id, 'canonicalSku', after_row.canonical_sku, 'name', after_row.name, 'isActive', after_row.is_active, 'aliases', coalesce((select jsonb_agg(alias_sku order by alias_sku) from public.sku_aliases where product_id = after_row.id), '[]'::jsonb)));
  insert into public.action_idempotency(idempotency_key, action_type, resource_id, result, created_by) values (p_idempotency_key, 'update_product_v2', p_product_id, request_payload, actor_id);
  return request_payload -> 'data';
end;
$$;

drop policy if exists brands_select_by_access on public.brands;
drop policy if exists brands_manage_by_access on public.brands;
drop policy if exists products_select_by_access on public.products;
drop policy if exists products_manage_by_access on public.products;
drop policy if exists sku_aliases_select_by_access on public.sku_aliases;
drop policy if exists sku_aliases_manage_by_access on public.sku_aliases;
create policy brands_select_active_or_admin on public.brands for select to authenticated using (
  (is_active and public.can_use_brand_capability(id, 'view_approved_plan'::public.user_capability))
  or public.current_user_is_administrator_v2()
);
create policy products_select_scoped on public.products for select to authenticated using (
  public.current_user_is_administrator_v2()
  or (is_active and public.can_use_brand_capability(brand_id, 'view_approved_plan'::public.user_capability))
);
create policy sku_aliases_select_scoped on public.sku_aliases for select to authenticated using (
  exists (select 1 from public.products p where p.id = product_id and (public.current_user_is_administrator_v2() or public.can_use_brand_capability(p.brand_id, 'view_approved_plan'::public.user_capability)))
);

revoke all on table public.brands, public.products, public.sku_aliases from authenticated;
grant select on table public.brands, public.products, public.sku_aliases to authenticated;
revoke all on function public.list_brand_options_v2(boolean), public.list_product_options_v2(uuid, boolean), public.create_brand_v2(text, text, uuid, uuid), public.update_brand_v2(uuid, text, text, boolean, uuid, uuid), public.create_product_v2(uuid, text, text, text[], uuid, uuid), public.update_product_v2(uuid, uuid, text, text, text[], boolean, uuid, uuid) from public, anon;
grant execute on function public.list_brand_options_v2(boolean), public.list_product_options_v2(uuid, boolean), public.create_brand_v2(text, text, uuid, uuid), public.update_brand_v2(uuid, text, text, boolean, uuid, uuid), public.create_product_v2(uuid, text, text, text[], uuid, uuid), public.update_product_v2(uuid, uuid, text, text, text[], boolean, uuid, uuid) to authenticated, service_role;
