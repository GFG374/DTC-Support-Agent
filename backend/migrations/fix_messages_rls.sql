-- ============================================================
-- 完整的 messages 表 RLS 策略
-- 解决：1) 用户消息入库失败  2) S端 Realtime 收不到消息
-- 在 Supabase Dashboard -> SQL Editor 执行
-- ============================================================

-- 1) 开启 RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2) 先删除可能存在的旧策略（避免冲突）
DROP POLICY IF EXISTS "messages_select_own_conversation" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_own_conversation" ON public.messages;
DROP POLICY IF EXISTS "messages_select_admin_agent" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_admin_agent" ON public.messages;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.messages;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.messages;

-- 3) 普通用户：可以读取自己会话内的所有消息
CREATE POLICY "messages_select_own_conversation" ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- 4) 普通用户：可以插入自己会话内的消息
CREATE POLICY "messages_insert_own_conversation" ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- 5) 管理端：admin/agent 可以读取所有消息
CREATE POLICY "messages_select_admin_agent" ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'agent')
    )
  );

-- 6) 管理端：admin/agent 可以插入任何消息（客服回复）
CREATE POLICY "messages_insert_admin_agent" ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'agent')
    )
  );

-- 7) 验证策略
SELECT 
  polname as policy_name, 
  CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE '*' END as command
FROM pg_policy
WHERE polrelid = 'public.messages'::regclass;
