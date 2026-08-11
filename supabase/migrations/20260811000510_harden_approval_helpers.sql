create or replace function public.guard_default_approval_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_default then
    raise exception using
      errcode = 'P0001',
      message = 'default_approval_policy_required';
  end if;

  if tg_op = 'UPDATE'
    and old.is_default
    and (
      not new.is_default
      or not new.is_active
      or new.mode <> 'fixed_two_level'
      or new.threshold_amount is not null
      or new.currency_code is distinct from old.currency_code
      or new.version is distinct from old.version
      or new.effective_from is distinct from old.effective_from
      or new.effective_to is distinct from old.effective_to
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'default_approval_policy_required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.approval_request_brand_id(uuid)
  from authenticated;
