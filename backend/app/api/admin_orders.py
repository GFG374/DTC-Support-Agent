from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime

from ..core.auth import User, require_admin
from ..core.supabase import get_supabase_admin_client
from ..integrations.order import get_order_api
from .admin_returns import _auto_refund_threshold

router = APIRouter(tags=["admin_orders"])


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/admin/orders")
async def admin_list_orders(
    user: User = Depends(require_admin),
    limit: int = Query(default=200, ge=1, le=500),
    include_returns: bool = Query(default=True),
):
    client = get_supabase_admin_client()
    orders_res = (
        client.table("orders")
        .select("order_id, user_id, created_at, paid_amount, currency, status, shipping_status, tracking_no, payment_status, alipay_trade_no, paid_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    orders = orders_res.data or []
    returns_map = {}

    if include_returns and orders:
        order_ids = list({row.get("order_id") for row in orders if row.get("order_id")})
        if order_ids:
            returns_res = (
                client.table("returns")
                .select("order_id, status, refund_status, refund_amount, requested_amount, created_at, updated_at")
                .in_("order_id", order_ids)
                .order("created_at", desc=True)
                .limit(500)
                .execute()
            )
            for row in returns_res.data or []:
                order_id = row.get("order_id")
                if not order_id:
                    continue
                existing = returns_map.get(order_id)
                if not existing:
                    returns_map[order_id] = row
                    continue
                existing_time = _parse_iso(existing.get("updated_at") or existing.get("created_at"))
                incoming_time = _parse_iso(row.get("updated_at") or row.get("created_at"))
                if not existing_time or (incoming_time and incoming_time >= existing_time):
                    returns_map[order_id] = row

    return {
        "items": orders,
        "returns": returns_map,
        "meta": {"auto_refund_threshold": _auto_refund_threshold()},
    }


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
