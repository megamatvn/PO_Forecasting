begin;
select plan(8);

select has_index('public'::name, 'capacity_reservations'::name, 'capacity_reservations_wave_product_idx'::name);
select has_index('public'::name, 'capacity_reservations'::name, 'capacity_reservations_one_active_idx'::name);
select has_column('public'::name, 'proposal_route_snapshots'::name, 'planned_capacity'::name, 'planned capacity column exists');
select has_column('public'::name, 'proposal_route_snapshots'::name, 'remaining_capacity'::name, 'remaining capacity column exists');
select has_column('public'::name, 'proposal_route_snapshots'::name, 'route_kind'::name, 'route kind column exists');
select has_column('public'::name, 'proposal_route_snapshots'::name, 'route_reason'::name, 'route reason column exists');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.capacity_reservations'::regclass and conname = 'capacity_reservations_reserved_qty_check'), 'reserved quantity is validated');
select isnt((select relrowsecurity from pg_class where oid = 'public.capacity_reservations'::regclass), false, 'capacity rows remain RLS protected');

select * from finish();
rollback;
