# DTC 电商客服 AI Agent

这是一个面向 DTC 电商的智能客服系统，包含 FastAPI 后端与 Next.js 管理端（S 端），支持 AI 优先处理、人工接管、退款/售后决策与订单信息展示。Supabase 提供认证、数据存储和实时订阅能力。

## 主要功能
- **AI 与人工接管**
  - AI 先接待，触发策略后转人工。
  - 人工接管/解除接管流程，并向客户发送系统提示。
- **退款与售后流程**
  - 基于策略的自动退款与人工审批。
  - 管理端退款接口，会校验支付平台交易状态。
  - 退款状态与原因记录完整。
- **订单与用户画像**
  - 管理端右侧展示订单详情与售后进度。
  - 从对话文本中提取订单号并拉取订单信息。
- **S 端客服工作台**
  - 会话列表展示 AI/人工/需人工状态。
  - 消息实时订阅 + 轮询兜底。
  - 退款测试数据面板（AI 可退款 / 客服退款 / 不可退款）。
- **C 端聊天体验**
  - SSE 流式回复。
  - 语音消息与转写支持。
- **审批与邀请**
  - 邀请码机制，用于提升客服权限。
  - 任务审批与事件日志。

## 主要技术
- **后端**
  - FastAPI（Python 3.10+）
  - Supabase Auth + JWKS JWT 验证
  - Supabase Postgres + RLS
  - 支付宝沙箱接口（支付查询/退款）
  - SSE 实时流式聊天
- **前端**
  - Next.js App Router
  - Supabase JS（会话与鉴权）
  - Tailwind CSS
  - Supabase Realtime + 轮询兜底
- **数据与策略**
  - RAG 策略查询（当前为 stub，可替换真实服务）
  - 退款阈值与退货窗口控制逻辑

## 目录结构
- `backend/` — FastAPI 服务（聊天、订单、退款、管理端 API）
- `frontend/` — Next.js 管理端页面与 API 代理
- `backend/migrations/` — RLS 与表结构迁移
- `backend/sql/` — SQL 脚本（Realtime、策略、权限）
- `项目.md` — 需求文档

## 快速开始

### 前置条件
- Python 3.10+
- Node.js 18+
- Supabase 项目（开启 Email 登录）

### 后端
1) 复制 `backend/.env.example` 为 `backend/.env` 并填写：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWKS_URL`
   - 支付宝沙箱配置（`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`）
2) 在 Supabase SQL Editor 执行：
   - `backend/sql/01_init_roles_and_rls.sql`
   - `backend/sql/02_invites.sql`
   - （可选）`backend/sql/03_realtime_and_admin_rls.sql`
3) 启动：
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

常用接口：
- `POST /api/chat` — SSE 聊天流（AI）
- `POST /api/chat/agent` — AI + 工具调用
- `GET /api/admin/conversations` — 管理端会话列表
- `GET /api/admin/conversations/{id}/messages`
- `GET /api/admin/orders`
- `POST /api/admin/orders/{order_id}/refund`
- `GET /api/admin/returns`

### 前端
1) 复制 `frontend/.env.local.example` 为 `frontend/.env.local` 并填写：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_BACKEND_URL`
2) 启动：
```bash
cd frontend
npm install
npm run dev
```

主要页面：
- `/login` — 管理端登录
- `/admin/inbox` — 客服工作台
- `/approvals` — 审批任务
- `/redeem` — 邀请码兑换

## 说明
- 退款判断基于策略阈值与退货窗口。
- 管理端消息采用实时订阅 + 轮询兜底。
- RAG 当前为 stub，可替换为真实服务。
