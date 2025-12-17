import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.auth import User, get_current_user
from ..core.config import settings
from ..core.invite_utils import hash_invite_code
from ..core.supabase import get_supabase_admin_client

router = APIRouter(tags=["invites"])

# Simple in-memory rate limiter: user_id -> timestamps (seconds)
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


def _check_rate_limit(user_id: str) -> None:
    limit = settings.rate_limit_redeem_per_min
    window_seconds = 60
    now = time.time()
    bucket = _rate_buckets[user_id]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts, please try again later",
        )
    bucket.append(now)


class RedeemRequest(BaseModel):
    code: str


@router.post("/api/invites/redeem")
async def redeem_invite(
    payload: RedeemRequest, user: User = Depends(get_current_user)
):
    _check_rate_limit(user.user_id)
    if not payload.code:
        raise HTTPException(status_code=400, detail="Invite code is required")

    code_hash = hash_invite_code(payload.code.strip())
    client = get_supabase_admin_client()

    res = client.rpc(
        "redeem_invite_code",
        {
            "p_user_id": user.user_id,
            "p_email": user.email or "",
            "p_code_hash": code_hash,
        },
    ).execute()
    result = res.data or {}
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code is invalid or expired",
        )
    return {"ok": True, "role": result.get("role", "admin")}
