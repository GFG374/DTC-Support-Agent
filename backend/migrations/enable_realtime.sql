-- 启用 messages 表的 Realtime 功能
-- 在 Supabase Dashboard 的 SQL Editor 中执行

-- 方法1: 通过 Supabase Dashboard
-- 1. 进入 Supabase Dashboard
-- 2. 点击 Database -> Replication
-- 3. 在 "supabase_realtime" 中，确保 messages 表被勾选

-- 方法2: 通过 SQL
-- 添加 messages 表到 realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 如果上面报错说已存在，可以先移除再添加：
-- ALTER PUBLICATION supabase_realtime DROP TABLE messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 验证是否成功
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
