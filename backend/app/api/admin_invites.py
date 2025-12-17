import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, conint, validator

from ..core.auth import User, require_admin
from ..core.config import settings
from ..core.invite_utils import hash_invite_code
from ..core.supabase import get_supabase_admin_client

router = APIRouter(tags=["admin-invites"])


class GenerateInvitesRequest(BaseModel):
    count: conint(ge=1, le=50) = 1
    email: Optional[str] = None
    expires_in_hours: Optional[int] = None

    @validator("email")
    def normalize_email(cls, v: Optional[str]) -> Optional[str]:
        return v.lower() if v else v


class InvitePayload(BaseModel):
    code: str
    expires_at: Optional[str] = None
    email: Optional[str] = None


@router.post("/admin/invites")
async def generate_invites(
    payload: GenerateInvitesRequest,
    user: User = Depends(require_admin),
) -> dict:
    admin_client = get_supabase_admin_client()
    expires_hours = (
        payload.expires_in_hours
        if payload.expires_in_hours is not None
        else settings.invite_default_expires_hours
    )
    expires_at = datetime.now(tz=timezone.utc) + timedelta(hours=expires_hours)

    invites: List[InvitePayload] = []
    for _ in range(payload.count):
        code = secrets.token_urlsafe(16)
        code_hash = hash_invite_code(code)
        record = {
            "code_hash": code_hash,
            "email": payload.email,
            "status": "unused",
            "expires_at": expires_at.isoformat(),
            "created_by": user.user_id,
        }
        try:
            admin_client.table("admin_invites").insert(record).execute()
        except Exception as e:
            # Catch Supabase/Postgrest errors (e.g. permission denied, table not found)
            print(f"Error generating invite: {e}")
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

        invites.append(
            InvitePayload(
                code=code, expires_at=expires_at.isoformat(), email=payload.email
            )
        )

    return {"invites": [invite.dict() for invite in invites]}
