create type public.app_role as enum (
  'administrator',
  'planner',
  'approver_l1',
  'approver_l2',
  'viewer'
);

create table public.roles (
  key public.app_role primary key,
  name text not null unique,
  description text not null
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null references public.roles(key),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and code <> ''),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_brand_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  canonical_sku text not null unique
    check (canonical_sku = upper(btrim(canonical_sku)) and canonical_sku <> ''),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sku_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  alias_sku text not null unique
    check (alias_sku = upper(btrim(alias_sku)) and alias_sku <> ''),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_brand_access_user_id_brand_id_idx
  on public.user_brand_access (user_id, brand_id);
create index user_brand_access_brand_id_idx
  on public.user_brand_access (brand_id);
create index products_brand_id_idx on public.products (brand_id);
create index sku_aliases_product_id_idx on public.sku_aliases (product_id);

create function public.current_user_has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = p_role
  );
$$;

create function public.can_access_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_brand_access
    where user_id = (select auth.uid())
      and brand_id = p_brand_id
  );
$$;

create function public.can_administer_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_role('administrator'::public.app_role)
    and public.can_access_brand(p_brand_id);
$$;

create function public.can_access_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products
    where id = p_product_id
      and public.can_access_brand(brand_id)
  );
$$;

create function public.can_administer_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products
    where id = p_product_id
      and public.can_administer_brand(brand_id)
  );
$$;

revoke all on function public.current_user_has_role(public.app_role) from public, anon;
revoke all on function public.can_access_brand(uuid) from public, anon;
revoke all on function public.can_administer_brand(uuid) from public, anon;
revoke all on function public.can_access_product(uuid) from public, anon;
revoke all on function public.can_administer_product(uuid) from public, anon;

grant execute on function public.current_user_has_role(public.app_role) to authenticated;
grant execute on function public.can_access_brand(uuid) to authenticated;
grant execute on function public.can_administer_brand(uuid) to authenticated;
grant execute on function public.can_access_product(uuid) to authenticated;
grant execute on function public.can_administer_product(uuid) to authenticated;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.brands enable row level security;
alter table public.user_brand_access enable row level security;
alter table public.products enable row level security;
alter table public.sku_aliases enable row level security;

create policy roles_select_authenticated
on public.roles
for select
to authenticated
using (true);

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.current_user_has_role('administrator'::public.app_role)
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profiles_manage_admin
on public.profiles
for all
to authenticated
using (public.current_user_has_role('administrator'::public.app_role))
with check (public.current_user_has_role('administrator'::public.app_role));

create policy user_roles_select_own_or_admin
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_has_role('administrator'::public.app_role)
);

create policy user_roles_manage_admin
on public.user_roles
for all
to authenticated
using (public.current_user_has_role('administrator'::public.app_role))
with check (public.current_user_has_role('administrator'::public.app_role));

create policy user_brand_access_select_own_or_admin
on public.user_brand_access
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_has_role('administrator'::public.app_role)
);

create policy user_brand_access_manage_admin
on public.user_brand_access
for all
to authenticated
using (public.current_user_has_role('administrator'::public.app_role))
with check (public.current_user_has_role('administrator'::public.app_role));

create policy brands_select_by_access
on public.brands
for select
to authenticated
using (public.can_access_brand(id));

create policy brands_manage_by_access
on public.brands
for all
to authenticated
using (public.can_administer_brand(id))
with check (public.current_user_has_role('administrator'::public.app_role));

create policy products_select_by_access
on public.products
for select
to authenticated
using (public.can_access_brand(brand_id));

create policy products_manage_by_access
on public.products
for all
to authenticated
using (public.can_administer_brand(brand_id))
with check (public.can_administer_brand(brand_id));

create policy sku_aliases_select_by_access
on public.sku_aliases
for select
to authenticated
using (public.can_access_product(product_id));

create policy sku_aliases_manage_by_access
on public.sku_aliases
for all
to authenticated
using (public.can_administer_product(product_id))
with check (public.can_administer_product(product_id));

revoke all on table public.roles from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.brands from anon, authenticated;
revoke all on table public.user_brand_access from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.sku_aliases from anon, authenticated;

grant select on table public.roles to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;
grant select, insert, update, delete on table public.brands to authenticated;
grant select, insert, update, delete on table public.user_brand_access to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.sku_aliases to authenticated;

grant all on table public.roles to service_role;
grant all on table public.profiles to service_role;
grant all on table public.user_roles to service_role;
grant all on table public.brands to service_role;
grant all on table public.user_brand_access to service_role;
grant all on table public.products to service_role;
grant all on table public.sku_aliases to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

comment on function public.can_access_brand(uuid) is
  'RLS helper: the current authenticated user has explicit access to the brand.';
comment on table public.sku_aliases is
  'Source or historical SKU identifiers mapped to one canonical product.';
