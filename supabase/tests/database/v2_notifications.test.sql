begin;
select plan(15);

select has_table('public'::name, 'notification_outbox'::name, 'notification outbox exists');
select has_table('public'::name, 'notifications'::name, 'notifications exists');
select has_column('public'::name, 'notification_outbox'::name, 'recipient_id'::name, 'outbox recipient exists');
select has_column('public'::name, 'notification_outbox'::name, 'dedupe_key'::name, 'outbox dedupe exists');
select has_column('public'::name, 'notifications'::name, 'read_at'::name, 'notification read state exists');
select has_index('public'::name, 'notifications'::name, 'notifications_recipient_unread_idx'::name, 'unread index exists');
select has_function('public', 'enqueue_notification_v2', array['uuid','uuid','text','text','text','text'], 'enqueue function exists');
select has_function('public', 'dispatch_notification_outbox_v2', array['uuid'], 'dispatch function exists');
select has_function('public', 'mark_notification_read_v2', array['uuid'], 'read function exists');
select policies_are('public', 'notifications', array['notifications_recipient_select','notifications_recipient_update'], 'recipient policies exist');
select policies_are('public', 'notification_outbox', array[]::text[], 'outbox has no client policy');
select is((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), true, 'notifications RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass), true, 'outbox RLS enabled');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.notification_outbox'::regclass and conname = 'notification_outbox_kind_check'), 'kind format checked');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check'), 'notification kind check exists');

select * from finish();
rollback;
