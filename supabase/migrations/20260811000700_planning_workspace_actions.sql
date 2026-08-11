create function public.save_planning_workspace(
  p_plan_version_id uuid,
  p_expected_lock_version integer,
  p_changes jsonb,
  p_idempotency_key uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_lock_version integer;
  proposal jsonb;
  proposal_batch_id uuid;
  proposal_batch_number integer;
  proposal_currency text;
  proposal_product_id uuid;
begin
  if p_changes ? 'purchaseProposals'
    and jsonb_typeof(p_changes -> 'purchaseProposals') <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'draft_change_collections_must_be_arrays';
  end if;

  new_lock_version := public.save_draft_changes(
    p_plan_version_id,
    p_expected_lock_version,
    p_changes,
    p_idempotency_key
  );

  if jsonb_array_length(
    coalesce(p_changes -> 'purchaseProposals', '[]'::jsonb)
  ) = 0 then
    return new_lock_version;
  end if;

  select purchase_batches.id into proposal_batch_id
  from public.purchase_batches
  where purchase_batches.plan_version_id = p_plan_version_id
    and purchase_batches.status = 'planned'
  order by purchase_batches.batch_number
  limit 1;

  if proposal_batch_id is null then
    select
      planning_cycles.currency_code,
      coalesce(max(existing_batches.batch_number), 0) + 1
    into proposal_currency, proposal_batch_number
    from public.plan_versions
    join public.planning_cycles
      on planning_cycles.id = plan_versions.planning_cycle_id
    left join public.purchase_batches existing_batches
      on existing_batches.plan_version_id = plan_versions.id
    where plan_versions.id = p_plan_version_id
    group by planning_cycles.currency_code;

    if proposal_currency is null then
      raise exception using
        errcode = 'P0001',
        message = 'plan_version_not_found';
    end if;

    insert into public.purchase_batches (
      plan_version_id,
      batch_number,
      name,
      order_date,
      eta_date,
      status,
      currency_code
    )
    values (
      p_plan_version_id,
      proposal_batch_number,
      'PO đề xuất #' || proposal_batch_number,
      current_date,
      current_date,
      'planned',
      proposal_currency
    )
    returning id into proposal_batch_id;
  end if;

  for proposal in
    select value
    from jsonb_array_elements(
      coalesce(p_changes -> 'purchaseProposals', '[]'::jsonb)
    )
  loop
    proposal_product_id := (proposal ->> 'productId')::uuid;

    if not exists (
      select 1
      from public.plan_lines
      where plan_lines.plan_version_id = p_plan_version_id
        and plan_lines.product_id = proposal_product_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'draft_change_target_not_found';
    end if;

    insert into public.purchase_lines (
      purchase_batch_id,
      product_id,
      qty,
      foc_qty,
      ex_price
    )
    values (
      proposal_batch_id,
      proposal_product_id,
      (proposal ->> 'qty')::integer,
      (proposal ->> 'focQty')::integer,
      (proposal ->> 'exPrice')::numeric
    )
    on conflict (purchase_batch_id, product_id) do update
    set qty = excluded.qty,
        foc_qty = excluded.foc_qty,
        ex_price = excluded.ex_price,
        updated_at = now();
  end loop;

  return new_lock_version;
end;
$$;

revoke all on function public.save_planning_workspace(uuid, integer, jsonb, uuid)
  from public, anon;
grant execute on function public.save_planning_workspace(uuid, integer, jsonb, uuid)
  to authenticated, service_role;

comment on function public.save_planning_workspace(uuid, integer, jsonb, uuid) is
  'CAS and idempotent Draft save that also upserts a first planned PO proposal for products without future purchase lines.';
