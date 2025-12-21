from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import User, require_admin
from ..core.supabase import get_supabase_admin_client
from ..integrations.order import get_order_api

router = APIRouter(tags=["admin_orders"])


@router.get("/admin/orders/{order_id}")
async def admin_get_order(
    order_id: str,
    user: User = Depends(require_admin),
):
    order_api = get_order_api()
    order = order_api.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    client = get_supabase_admin_client()
    return_row = None
    try:
        res = (
            client.table("returns")
            .select("*")
            .eq("order_id", order_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return_row = res.data[0]
    except Exception:
        return_row = None

    return {"order": order, "return": return_row}
