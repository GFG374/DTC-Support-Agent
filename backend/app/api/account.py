from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import User, get_current_user
from ..core.supabase import get_supabase_admin_client

router = APIRouter(tags=["account"])

COOL_OFF_DAYS = 30


@router.post("/api/account/deactivate")
async def deactivate_account(user: User = Depends(get_current_user)):
    admin = get_supabase_admin_client()
    now = datetime.now(tz=timezone.utc)
    purge_after = now + timedelta(days=COOL_OFF_DAYS)
    res = (
        admin.table("user_profiles")
        .update({"deleted_at": now.isoformat(), "purge_after": purge_after.isoformat()})
        .eq("user_id", user.user_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise HTTPException(status_code=500, detail=str(res.error))
    return {"ok": True, "purge_after": purge_after.isoformat()}


@router.post("/api/account/restore")
async def restore_account(user: User = Depends(get_current_user)):
    admin = get_supabase_admin_client()
    now = datetime.now(tz=timezone.utc)
    profile = (
        admin.table("user_profiles")
        .select("deleted_at, purge_after")
        .eq("user_id", user.user_id)
        .single()
        .execute()
    )
    data = getattr(profile, "data", None) or {}
    deleted_at = data.get("deleted_at")
    purge_after = data.get("purge_after")

    if not deleted_at:
        return {"ok": True, "restored": True}  # already active

    if purge_after and datetime.fromisoformat(purge_after) < now:
        raise HTTPException(status_code=410, detail="Account purge period expired")

    res = (
        admin.table("user_profiles")
        .update({"deleted_at": None, "purge_after": None})
        .eq("user_id", user.user_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise HTTPException(status_code=500, detail=str(res.error))

    return {"ok": True, "restored": True}

