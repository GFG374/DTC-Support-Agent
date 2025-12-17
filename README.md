# DTC Customer Service AI Agent

FastAPI backend + Next.js frontend for a DTC customer-service agent that handles returns, exchanges, WISMO, and approvals. Supabase provides Auth and data storage with RLS.

## Structure
- `backend/` – FastAPI app with JWT verification (Supabase JWKS), chat SSE, ReturnFlow, approvals, and mock RAG.
- `frontend/` – Next.js (app router) with Supabase email auth, chat UI with streaming SSE, and approvals view.
- `项目.md` – Original requirement document.

## Prerequisites
- Python 3.10+ and Node.js 18+
- Supabase project with Email auth enabled and `SUPABASE_SCHEMA.sql` applied (per 项目.md).

## Backend
1) Copy `backend/.env.example` to `backend/.env` and fill Supabase keys and JWKS URL. New keys: `SUPABASE_SERVICE_ROLE_KEY`, `INVITE_CODE_PEPPER`, `INVITE_DEFAULT_EXPIRES_HOURS`, `RATE_LIMIT_REDEEM_PER_MIN`.  
2) Apply SQL: run `01_init_roles_and_rls.sql` and `02_invites.sql` in Supabase SQL Editor (creates RLS, admin_invites table, and redeem_invite_code RPC).  
3) Install deps and run:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Key endpoints (all require `Authorization: Bearer <access_token>`):
- `POST /api/chat` (SSE) – routes to ReturnFlow and logs agent_events.
- `GET /api/conversations`, `GET /api/conversations/{id}/messages`
- `POST /api/approvals/{id}/approve`, `/reject`, `GET /api/approvals`
- `GET /api/orders/{order_id}`, `POST /api/seed`
- `POST /auth/register` – backend registration with optional invite code (hash stored server-side, role upgraded in RPC)
- `POST /api/invites/redeem` – logged-in users redeem invite code (atomic RPC: mark used + role=admin)
- `POST /admin/invites` – admin-only to bulk generate invite codes (plaintext only returned once)
- `GET /api/health`, `GET /api/me` (returns role/display_name/avatar)

## Frontend
1) Copy `frontend/.env.local.example` to `frontend/.env.local` and set Supabase + backend URL.  
2) Install and run:
```bash
cd frontend
npm install
npm run dev
```
Pages:
- `/login` – email/password login; signup calls backend register (optional invite code).
- `/chat` – Chat with SSE streaming and mock ReturnFlow.
- `/approvals` – View/approve/reject approval tasks.
- `/redeem` – logged-in users输入邀请码升级客服。
- `/admin/invites` – 管理员生成邀请码。

## Notes
- ReturnFlow is deterministic and writes `agent_events` for ROUTE_DECISION, POLICY_HIT, TOOL_CALL/TOOL_RESULT, and APPROVAL_CREATED.
- RAG is stubbed in `backend/app/rag/bailian.py`; replace with a real Bailian client later.
- When Supabase env vars are missing, the backend falls back to an in-memory repo for local demos (no persistence).
