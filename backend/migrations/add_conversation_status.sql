-- 为 conversations 表添加状态和分配客服字段
-- 执行此 SQL 前请确保已连接到正确的 Supabase 数据库

-- 1. 添加 status 字段（对话状态）
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ai' CHECK (status IN ('ai', 'pending_agent', 'agent', 'closed'));

-- 2. 添加 assigned_agent_id 字段（分配的客服 ID）
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. 为现有数据设置默认值
UPDATE conversations 
SET status = 'ai' 
WHERE status IS NULL;

-- 4. 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent ON conversations(assigned_agent_id);

-- 5. 添加注释
COMMENT ON COLUMN conversations.status IS '对话状态: ai=AI处理中, pending_agent=等待人工, agent=人工处理中, closed=已关闭';
COMMENT ON COLUMN conversations.assigned_agent_id IS '接管此对话的客服用户ID';
