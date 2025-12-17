-- ========================================
-- Enable Realtime & Admin RLS Policies
-- Run this in Supabase SQL Editor
-- ========================================

-- 1. Enable Realtime for messages table
alter publication supabase_realtime add table messages;

-- 2. Enable Realtime for conversations table  
alter publication supabase_realtime add table conversations;

-- 3. Admin can SELECT all conversations
drop policy if exists "Admin can select all conversations" on conversations;
create policy "Admin can select all conversations" on conversations for select
using (
  exists (
    select 1 from user_profiles 
    where user_profiles.user_id = auth.uid() 
    and user_profiles.role = 'admin'
  )
);

-- 4. Admin can SELECT all messages
drop policy if exists "Admin can select all messages" on messages;
create policy "Admin can select all messages" on messages for select
using (
  exists (
    select 1 from user_profiles 
    where user_profiles.user_id = auth.uid() 
    and user_profiles.role = 'admin'
  )
);

-- 5. Admin can INSERT messages (for replying to users)
drop policy if exists "Admin can insert messages" on messages;
create policy "Admin can insert messages" on messages for insert
with check (
  exists (
    select 1 from user_profiles 
    where user_profiles.user_id = auth.uid() 
    and user_profiles.role = 'admin'
  )
);

-- 6. Admin can view all user profiles (to see customer names)
drop policy if exists "Admin can view all profiles" on user_profiles;
create policy "Admin can view all profiles" on user_profiles for select
using (
  auth.uid() = user_id  -- own profile
  or exists (
    select 1 from user_profiles up
    where up.user_id = auth.uid()
    and up.role = 'admin'
  )
);

-- 7. Grant Realtime access for authenticated users
grant select on messages to authenticated;
grant select on conversations to authenticated;
