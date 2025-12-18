from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException

from ..core.auth import User, require_admin
from ..core.supabase import get_supabase_admin_client

router = APIRouter(tags=["admin_returns"])


@router.get("/admin/returns")
async def admin_list_returns(
    user: User = Depends(require_admin),
    user_id: Optional[str] = Query(default=None),
    order_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
):
    client = get_supabase_admin_client()
    base_query = client.table("returns").select("*").order("created_at", desc=True).limit(limit)
    if order_id:
        base_query = base_query.eq("order_id", order_id)

    try:
        if user_id:
            res = base_query.eq("user_id", user_id).execute()
        else:
            res = base_query.execute()
        return {"items": res.data or []}
    except Exception as exc:
        msg = str(exc).lower()
        if user_id and "column" in msg and "user_id" in msg:
            fallback = client.table("returns").select("*").order("created_at", desc=True).limit(limit)
            if order_id:
                fallback = fallback.eq("order_id", order_id)
            try:
                res = fallback.eq("usr_id", user_id).execute()
                return {"items": res.data or []}
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(exc))
