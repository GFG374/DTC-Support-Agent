-- 启用 conversations 表的 Realtime 功能
-- 在 Supabase Dashboard 的 SQL Editor 中执行此脚本

-- =========================================
-- 🚨 重要：这是 "需人工" 徽章能正常工作的关键！
-- =========================================

-- 方法1: 通过 Supabase Dashboard UI
-- 1. 进入 Supabase Dashboard -> Database -> Replication
-- 2. 在 "supabase_realtime" publication 中
-- 3. 确保 conversations 表被勾选 ✅

-- 方法2: 通过 SQL 命令
-- 添加 conversations 表到 realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- 如果报错 "relation already exists"，说明已启用，可以忽略
-- 或者先移除再添加：
-- ALTER PUBLICATION supabase_realtime DROP TABLE conversations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- 验证是否成功启用
SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 预期输出应包含：
-- public | messages
-- public | conversations
