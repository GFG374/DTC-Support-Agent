-- 允许 C 端（普通登录用户）读取客服(admin)的公开信息：display_name/avatar_url
-- 目的：让 C 端能展示客服真实头像
-- 在 Supabase Dashboard -> SQL Editor 执行

-- 仅对已登录用户开放（authenticated），且只开放 role=admin 的行
DROP POLICY IF EXISTS "Authenticated can view admin profiles" ON public.user_profiles;
CREATE POLICY "Authenticated can view admin profiles"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (role = 'admin');

-- 保留原有：用户读自己/更新自己、admin 读全量等策略不变

-- 验证（可选）：用客户账号应该能查到 admin 的头像
-- select user_id, role, display_name, avatar_url from public.user_profiles where role='admin';
