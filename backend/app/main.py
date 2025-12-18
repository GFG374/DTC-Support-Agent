from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from .api import approvals, chat, conversations, orders, admin_invites, invites, register, account, admin_conversations, transcribe, users, admin_returns
from .core.auth import User, get_current_user
from .core.config import settings
from .core.supabase import get_supabase_admin_client

app = FastAPI(title="DTC Customer Service Agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # We authenticate via Authorization header (Bearer token), not cookies.
    # Using allow_credentials=False keeps wildcard origin valid and avoids CORS blocking in browsers.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(invites.router)
app.include_router(register.router)
app.include_router(admin_invites.router)
app.include_router(account.router)
app.include_router(admin_conversations.router, prefix="/api")
app.include_router(admin_returns.router, prefix="/api")
app.include_router(transcribe.router)
app.include_router(users.router, prefix="/api")


@app.get("/api/health")
async def healthcheck():
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/me")
async def read_me(user: User = Depends(get_current_user)):
    client = get_supabase_admin_client()
    profile_res = (
        client.table("user_profiles")
        .select("role, display_name, avatar_url")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    data = profile_res.data or []
    profile = data[0] if data else {}
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": profile.get("role", "customer"),
        "display_name": profile.get("display_name"),
        "avatar_url": profile.get("avatar_url"),
    }
