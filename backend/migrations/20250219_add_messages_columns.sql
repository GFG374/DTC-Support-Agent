-- Add missing columns to messages table
alter table public.messages 
add column if not exists metadata jsonb,
add column if not exists audio_url text,
add column if not exists transcript text;

-- Ensure client_message_id exists (in case previous migration wasn't run)
alter table public.messages
add column if not exists client_message_id uuid;

create unique index if not exists messages_client_message_id_unique
  on public.messages (client_message_id)
  where client_message_id is not null;
