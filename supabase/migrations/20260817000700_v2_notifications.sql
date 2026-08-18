-- Transactional notification outbox. Commands write an outbox row in the
-- same transaction as their business state; a dispatcher materializes the
-- recipient-facing notification without making business writes depend on a
-- browser request succeeding.

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  source_id uuid not null,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{2,80}$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 1000),
  href text,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (recipient_id, dedupe_key)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  outbox_id uuid not null unique references public.notification_outbox(id),
  source_id uuid not null,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{2,80}$'),
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_outbox_pending_idx on public.notification_outbox(status, created_at) where status = 'pending';
create index if not exists notifications_recipient_unread_idx on public.notifications(recipient_id, created_at desc) where read_at is null;
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);

alter table public.notification_outbox enable row level security;
alter table public.notifications enable row level security;

drop policy if exists notifications_recipient_select on public.notifications;
drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_select on public.notifications for select to authenticated using (
  public.current_profile_is_active() and recipient_id = (select auth.uid())
);
create policy notifications_recipient_update on public.notifications for update to authenticated using (
  public.current_profile_is_active() and recipient_id = (select auth.uid())
) with check (recipient_id = (select auth.uid()));

revoke all on table public.notification_outbox, public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create or replace function public.enqueue_notification_v2(
  p_recipient_id uuid,
  p_source_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare outbox_id uuid;
begin
  if not public.current_profile_is_active() or p_recipient_id is null or p_source_id is null or btrim(coalesce(p_kind, '')) = '' then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_INPUT_INVALID';
  end if;
  insert into public.notification_outbox(recipient_id, source_id, kind, title, body, href, dedupe_key)
  values (p_recipient_id, p_source_id, btrim(p_kind), btrim(p_title), btrim(p_body), nullif(btrim(p_href), ''), p_source_id::text || ':' || btrim(p_kind))
  on conflict (recipient_id, dedupe_key) do update set title = excluded.title, body = excluded.body, href = excluded.href
  returning id into outbox_id;
  -- Materialize immediately so the bell is useful without depending on a
  -- separate worker. The outbox row remains the durable retry/audit record and
  -- dispatch_notification_outbox_v2 is idempotent for later worker retries.
  perform public.dispatch_notification_outbox_v2(outbox_id);
  return outbox_id;
end;
$$;

create or replace function public.dispatch_notification_outbox_v2(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare outbox_row public.notification_outbox%rowtype; notification_id uuid;
begin
  select * into outbox_row from public.notification_outbox where id = p_outbox_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOTIFICATION_OUTBOX_NOT_FOUND'; end if;
  if outbox_row.status = 'processed' then
    select id into notification_id from public.notifications where outbox_id = p_outbox_id;
    return jsonb_build_object('outboxId', p_outbox_id, 'notificationId', notification_id, 'status', 'processed');
  end if;
  insert into public.notifications(recipient_id, outbox_id, source_id, kind, title, body, href)
  values (outbox_row.recipient_id, outbox_row.id, outbox_row.source_id, outbox_row.kind, outbox_row.title, outbox_row.body, outbox_row.href)
  on conflict (outbox_id) do update set title = excluded.title, body = excluded.body, href = excluded.href
  returning id into notification_id;
  update public.notification_outbox set status = 'processed', attempts = attempts + 1, processed_at = now(), last_error = null where id = p_outbox_id;
  return jsonb_build_object('outboxId', p_outbox_id, 'notificationId', notification_id, 'status', 'processed');
exception when others then
  update public.notification_outbox set status = 'failed', attempts = attempts + 1, last_error = sqlerrm where id = p_outbox_id;
  raise;
end;
$$;

create or replace function public.mark_notification_read_v2(p_notification_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.notifications set read_at = coalesce(read_at, now()) where id = p_notification_id and recipient_id = (select auth.uid()) and public.current_profile_is_active();
  return found;
end;
$$;

revoke all on function public.enqueue_notification_v2(uuid, uuid, text, text, text, text), public.dispatch_notification_outbox_v2(uuid), public.mark_notification_read_v2(uuid) from public, anon;
grant execute on function public.mark_notification_read_v2(uuid) to authenticated, service_role;
grant execute on function public.enqueue_notification_v2(uuid, uuid, text, text, text, text), public.dispatch_notification_outbox_v2(uuid) to service_role;
