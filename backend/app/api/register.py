from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from ..core.config import settings
from ..core.invite_utils import hash_invite_code
from ..core.supabase import get_supabase_admin_client

router = APIRouter(tags=["auth"])


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    display_name: str | None = None
    invite_code: str | None = None


@router.post("/auth/register")
async def register_user(payload: RegisterPayload):
    if not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=500, detail="Supabase service role key is not configured"
        )

    admin_client = get_supabase_admin_client()
    try:
        sign_res = admin_client.auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {"data": {"name": payload.display_name}}
                if payload.display_name
                else None,
            }
        )
    except Exception as exc:  # supabase raises on conflicts/validation
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = getattr(sign_res, "user", None) or {}
    user_id = getattr(user, "id", None) or user.get("id")
    if not user_id:
        raise HTTPException(status_code=500, detail="User creation failed")

    # Ensure profile record exists (upsert)
    profile_data = {
        "user_id": user_id,
        "role": "customer",  # 默认为 customer，如果有邀请码会后面更新
        "display_name": payload.display_name or "用户",
        "email": payload.email,  # 存储邮箱，方便后续查询
    }
    admin_client.table("user_profiles").upsert(
        profile_data, on_conflict="user_id"
    ).execute()

    role = "customer"
    if payload.invite_code:
        try:
            code_hash = hash_invite_code(payload.invite_code.strip())
            redeem_res = (
                admin_client.rpc(
                    "redeem_invite_code",
                    {
                        "p_user_id": user_id,
                        "p_email": payload.email,
                        "p_code_hash": code_hash,
                    },
                )
                .execute()
                .data
                or {}
            )
            if redeem_res.get("ok"):
                role = redeem_res.get("role", "admin")
        except Exception:
            # If invite redeem fails, keep user as customer and move on
            role = "customer"

    return {"ok": True, "user_id": user_id, "role": role}
