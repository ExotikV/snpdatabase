-- Receipt attachments for expenses (photos, PDFs). Safe to re-run.

alter table expenses add column if not exists receipt_path text;
alter table expenses add column if not exists receipt_file_name text;
alter table expenses add column if not exists receipt_content_type text;

comment on column expenses.receipt_path is 'Supabase Storage object path in expense-receipts bucket';
comment on column expenses.receipt_file_name is 'Original uploaded file name';
comment on column expenses.receipt_content_type is 'MIME type of uploaded receipt';

-- Private bucket for receipt files (access via signed URLs from the dashboard API).
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;
