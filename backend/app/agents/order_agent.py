from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.integrations.order import get_order_api


class OrderAgent:
    """Order department helper."""

    def __init__(self, user_id: Optional[str] = None):
        self.user_id = user_id
        self.order_api = get_order_api()

    def get_order_details(self, order_id: str) -> dict:
        order = self.order_api.get_order(order_id, user_id=self.user_id)
        if not order:
            return {
                "success": False,
                "error": f"Order {order_id} not found",
            }

        items = order.get("items", order.get("order_items", [])) or []
        paid_cents = order.get("paid_amount")
        amount = (paid_cents or 0) / 100 if paid_cents is not None else None
        created_at = order.get("created_at")
        shipping_status = order.get("shipping_status")

        return {
            "success": True,
            "order_id": order.get("order_id"),
            "status": order.get("status"),
            "shipping_status": shipping_status,
            "status_cn": self._translate_status(order.get("status")),
            "amount": amount,
            "currency": order.get("currency"),
            "order_date": created_at,
            "products": [
                {
                    "name": item.get("name"),
                    "quantity": item.get("qty"),
                    "price": (item.get("unit_price") or 0) / 100 if item.get("unit_price") is not None else None,
                    "sku": item.get("sku"),
                }
                for item in items
            ],
            "can_return": self._can_return(order),
        }

    def get_logistics_info(self, order_id: str) -> dict:
        logistics = self.order_api.get_logistics(order_id, user_id=self.user_id)
        if not logistics:
            return {
                "success": False,
                "error": f"Order {order_id} logistics not found",
            }

        status = logistics.get("status")
        return {
            "success": True,
            "status": status,
            "status_cn": self._translate_logistics_status(status),
            "carrier": None,
            "tracking_number": logistics.get("tracking_number"),
            "timeline": [],
        }

    def _can_return(self, order: dict) -> bool:
        created_at = order.get("created_at")
        if not created_at:
            return False
        created_dt = self._parse_dt(created_at)
        if not created_dt:
            return False
        days = (datetime.now(timezone.utc) - created_dt).days
        if days > 30:
            return False
        status = (order.get("status") or order.get("shipping_status") or "").lower()
        return status not in {"cancelled", "refunded"}

    @staticmethod
    def _parse_dt(value: str) -> Optional[datetime]:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _translate_status(status: Optional[str]) -> str:
        if not status:
            return "unknown"
        status_map = {
            "delivered": "已签收",
            "shipping": "运输中",
            "processing": "处理中",
            "pending": "待发货",
            "cancelled": "已取消",
            "refunded": "已退款",
        }
        key = status.lower()
        return status_map.get(key, status)

    @staticmethod
    def _translate_logistics_status(status: Optional[str]) -> str:
        if not status:
            return "unknown"
        status_map = {
            "delivered": "已签收",
            "in_transit": "运输中",
            "picked_up": "已揽收",
            "pending": "待发货",
        }
        key = status.lower()
        return status_map.get(key, status)
