-- ========================================
-- 清理多余会话 & 添加唯一约束
-- Run this in Supabase SQL Editor
-- ========================================

-- 1. 先查看每个用户有多少个会话
SELECT user_id, COUNT(*) as conv_count 
FROM conversations 
GROUP BY user_id 
ORDER BY conv_count DESC;

-- 2. 删除每个用户的多余会话（只保留最早创建的那个）
-- 先查看哪些会话会被删除
SELECT * FROM conversations 
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id 
  FROM conversations 
  ORDER BY user_id, created_at ASC
);

-- 3. 执行删除（先删除多余会话的消息，再删除会话）
-- 删除多余会话的消息
DELETE FROM messages 
WHERE conversation_id IN (
  SELECT id FROM conversations 
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id 
    FROM conversations 
    ORDER BY user_id, created_at ASC
  )
);

-- 删除多余的会话
DELETE FROM conversations 
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id 
  FROM conversations 
  ORDER BY user_id, created_at ASC
);

-- 4. 添加唯一约束：每个用户只能有一个会话
-- 先检查是否已存在约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_user_id_unique'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 5. 验证：现在每个用户应该只有一个会话
SELECT user_id, COUNT(*) as conv_count 
FROM conversations 
GROUP BY user_id;
