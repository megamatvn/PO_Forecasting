create function public.guard_plan_submission_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.purchase_batches
    join public.purchase_lines
      on purchase_lines.purchase_batch_id = purchase_batches.id
    where purchase_batches.plan_version_id = new.plan_version_id
      and purchase_batches.status <> 'cancelled'
      and purchase_lines.qty > 0
      and purchase_lines.ex_price <= 0
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'missing_ex_price';
  end if;
  return new;
end;
$$;

create trigger approval_request_price_guard
before insert on public.approval_requests
for each row execute function public.guard_plan_submission_price();

revoke all on function public.guard_plan_submission_price() from public, anon, authenticated;

comment on function public.guard_plan_submission_price() is
  'Blocks Submit when a non-zero PO Qty has no usable Ex Price; Amount remains canonical.';
