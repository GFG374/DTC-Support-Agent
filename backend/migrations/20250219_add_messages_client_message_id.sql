-- Add client_message_id for idempotent inserts from clients.
alter table public.messages
  add column if not exists client_message_id uuid;

create unique index if not exists messages_client_message_id_unique
  on public.messages (client_message_id)
  where client_message_id is not null;
