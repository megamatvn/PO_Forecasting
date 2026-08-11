create function public.ensure_brand_planning_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.planning_settings (brand_id)
  values (new.id)
  on conflict (brand_id) do nothing;
  return new;
end;
$$;

create trigger brand_planning_settings_default
after insert on public.brands
for each row execute function public.ensure_brand_planning_settings();

insert into public.planning_settings (brand_id)
select brands.id
from public.brands
on conflict (brand_id) do nothing;

revoke all on function public.ensure_brand_planning_settings() from public, anon, authenticated;
