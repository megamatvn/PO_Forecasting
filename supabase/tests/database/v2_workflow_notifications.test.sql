begin;
select plan(5);

select has_function('public', 'notify_workflow_approval_case_v2', '{}');
select has_trigger('public'::name, 'workflow_approval_cases'::name, 'workflow_approval_case_notifications'::name);
select col_is_fk('public'::name, 'notification_outbox'::name, 'recipient_id'::name, 'outbox recipient references a user');
select col_is_fk('public'::name, 'notifications'::name, 'recipient_id'::name, 'notification recipient references a user');
select ok((select count(*) > 0 from pg_indexes where schemaname = 'public' and indexname = 'notification_outbox_pending_idx'), 'pending notification outbox index exists');

select * from finish();
rollback;
