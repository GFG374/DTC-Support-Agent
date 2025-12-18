from __future__ import annotations

from typing import Dict, List, Optional

from ..core.supabase import get_supabase_admin_client


class SupabaseOrderAPI:
    """Supabase-backed order access."""

    def __init__(self, client=None):
        self.client = client or get_supabase_admin_client()

    def get_order(self, order_id: str, user_id: Optional[str] = None) -> Optional[Dict]:
        query = self.client.table("orders").select("*").eq("order_id", order_id)
        if user_id:
            query = query.eq("user_id", user_id)
        order_res = query.single().execute()
        order = getattr(order_res, "data", None)
        if not order:
            return None

        items_query = self.client.table("order_items").select("*").eq("order_id", order_id)
        if user_id:
            items_query = items_query.eq("user_id", user_id)
        items_res = items_query.execute()
        items = getattr(items_res, "data", None) or []
        order["order_items"] = items
        order["items"] = items
        return order

    def list_user_orders(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict]:
        query = (
            self.client.table("orders")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status:
            query = query.eq("status", status)
        res = query.execute()
        return res.data or []

    def get_logistics(self, order_id: str, user_id: Optional[str] = None) -> Optional[Dict]:
        order = self.get_order(order_id, user_id=user_id)
        if not order:
            return None
        return {
            "order_id": order.get("order_id"),
            "status": order.get("shipping_status") or order.get("status"),
            "tracking_number": order.get("tracking_no"),
        }

    def get_order_logistics(self, order_id: str, user_id: Optional[str] = None) -> Optional[Dict]:
        return self.get_logistics(order_id, user_id=user_id)


def get_order_api() -> SupabaseOrderAPI:
    return SupabaseOrderAPI()
