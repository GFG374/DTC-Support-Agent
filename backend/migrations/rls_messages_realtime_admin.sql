-- 让 S 端（admin/agent）可以通过 Supabase Realtime 订阅到 messages
-- 说明：S 端浏览器使用 anon key + 用户 JWT 直连 realtime，受 RLS 影响。
--      你现在“刷新才能看到”，是因为刷新走后端 service-role 查询；realtime 走前端被 RLS 拦了。
-- 在 Supabase Dashboard -> SQL Editor 执行本文件。

-- 1) 确保 messages 开启 RLS（如已开启可重复执行）
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2) 普通用户：可以读取自己会话内的所有消息（不是只读自己发的）
DO $$
BEGIN
  CREATE POLICY "messages_select_own_conversation" ON public.messages
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND c.user_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- 3) 管理端：admin/agent 可以读取所有消息（用于 S 端 inbox realtime）
--    依赖 user_profiles.role 字段（你们已在 user_profiles 表里用 role 标记权限）
DO $$
BEGIN
  CREATE POLICY "messages_select_admin_agent" ON public.messages
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.user_profiles p
        WHERE p.user_id = auth.uid()
          AND p.role IN ('admin', 'agent')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- 可选：如果你们希望“接管对话”的客服也能看该对话（即便不是 admin），可加这个 policy
-- DO $$
-- BEGIN
--   CREATE POLICY "messages_select_assigned_agent" ON public.messages
--     FOR SELECT
--     TO authenticated
--     USING (
--       EXISTS (
--         SELECT 1
--         FROM public.conversations c
--         WHERE c.id = messages.conversation_id
--           AND c.assigned_agent_id = auth.uid()
--       )
--     );
-- EXCEPTION
--   WHEN duplicate_object THEN
--     NULL;
-- END
-- $$;

-- 4) 验证：看看 messages 上有哪些 SELECT policy
-- SELECT polname, polcmd, polroles, polqual
-- FROM pg_policy
-- WHERE polrelid = 'public.messages'::regclass;
