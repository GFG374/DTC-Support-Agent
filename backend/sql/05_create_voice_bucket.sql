-- ========================================
-- 创建语音消息存储 Bucket
-- Run this in Supabase SQL Editor or Dashboard
-- ========================================

-- 注意：Bucket 创建通常在 Supabase Dashboard 的 Storage 界面完成
-- 但如果需要通过 SQL 创建，可以使用以下语句：

-- 1. 创建 voice-messages bucket（公开访问）
insert into storage.buckets (id, name, public)
values ('voice-messages', 'voice-messages', true)
on conflict (id) do nothing;

-- 2. 设置存储策略：允许认证用户上传
create policy "Authenticated users can upload voice messages"
on storage.objects for insert
to authenticated
with check (bucket_id = 'voice-messages');

-- 3. 设置存储策略：所有人可以查看（因为 bucket 是 public）
create policy "Anyone can view voice messages"
on storage.objects for select
to public
using (bucket_id = 'voice-messages');

-- 4. 设置存储策略：用户可以删除自己的语音消息
create policy "Users can delete their own voice messages"
on storage.objects for delete
to authenticated
using (bucket_id = 'voice-messages' and owner = auth.uid());
