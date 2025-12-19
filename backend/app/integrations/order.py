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
        orders = res.data or []
        return self._attach_items(orders, user_id=user_id)

    def search_orders_by_keyword(
        self,
        keyword: str,
        user_id: str,
        limit: int = 20,
    ) -> List[Dict]:
        # 找出包含关键词的订单行，再反查订单
        # 1. 尝试直接搜索
        item_rows = self._search_items(keyword, user_id)
        
        # 2. 如果没找到，且关键词以"子"结尾（如鞋子、裙子、帽子），尝试去掉"子"再搜
        if not item_rows and len(keyword) > 1 and keyword.endswith("子"):
            short_keyword = keyword[:-1]
            item_rows = self._search_items(short_keyword, user_id)

        order_ids = list({row.get("order_id") for row in item_rows if row.get("order_id")})
        if not order_ids:
            return []

        orders_res = (
            self.client.table("orders")
            .select("*")
            .in_("order_id", order_ids)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        orders = orders_res.data or []
        return self._attach_items(orders, user_id=user_id)

    def _search_items(self, keyword: str, user_id: str) -> List[Dict]:
        item_res = (
            self.client.table("order_items")
            .select("order_id")
            .eq("user_id", user_id)
            .ilike("name", f"%{keyword}%")
            .limit(200)
            .execute()
        )
        return item_res.data or []

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

    def _attach_items(self, orders: List[Dict], user_id: str) -> List[Dict]:
        if not orders:
            return orders
        order_ids = [o.get("order_id") for o in orders if o.get("order_id")]
        if not order_ids:
            return orders
        items_res = (
            self.client.table("order_items")
            .select("*")
            .eq("user_id", user_id)
            .in_("order_id", order_ids)
            .limit(500)
            .execute()
        )
        items = items_res.data or []
        items_by_order = {}
        for item in items:
            oid = item.get("order_id")
            items_by_order.setdefault(oid, []).append(item)
        for order in orders:
            oid = order.get("order_id")
            order_items = items_by_order.get(oid, [])
            order["order_items"] = order_items
            order["items"] = order_items
        return orders


def get_order_api() -> SupabaseOrderAPI:
    return SupabaseOrderAPI()
