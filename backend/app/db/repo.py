import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..core.config import settings
from ..core.supabase import get_supabase_client, get_supabase_admin_client


class Repository:
    """Data access helper. Uses Supabase when configured, otherwise falls back to memory."""

    def __init__(self, supabase_client=None):
        self.client = supabase_client
        self.memory = {
            "conversations": {},
            "messages": {},
            "agent_events": [],
            "returns": {},
            "approval_tasks": {},
            "orders": {},
            "order_items": {},
        }

    @classmethod
    def from_env(cls) -> "Repository":
        # Prefer admin client to bypass RLS when running server-side logic.
        try:
            client = get_supabase_admin_client()
        except Exception:
            try:
                client = get_supabase_client()
            except Exception:
                client = None
        return cls(client)

    @staticmethod
    def _now() -> str:
        return datetime.utcnow().isoformat() + "Z"

    @staticmethod
    def _return_id_columns() -> List[str]:
        return ["rma_id", "id"]

    @staticmethod
    def _return_user_columns() -> List[str]:
        return ["usr_id", "user_id"]

    @staticmethod
    def _is_column_error(error: object) -> bool:
        msg = str(error).lower()
        return "column" in msg and "does not exist" in msg

    @staticmethod
    def _normalize_return_row(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not row:
            return row
        normalized = dict(row)
        if "id" not in normalized and "rma_id" in normalized:
            normalized["id"] = normalized["rma_id"]
        if "user_id" not in normalized and "usr_id" in normalized:
            normalized["user_id"] = normalized["usr_id"]
        return normalized

    @staticmethod
    def _extract_missing_column(error: object) -> Optional[str]:
        match = re.search(r'column "?([a-zA-Z0-9_]+)"? does not exist', str(error))
        if match:
            return match.group(1)
        return None

    # Conversations -----------------------------------------------------------------
    def create_conversation(self, user_id: str, title: str = "Conversation") -> str:
        record = {"user_id": user_id, "title": title, "status": "ai"}  # 默认 AI 接管
        if self.client:
            res = self.client.table("conversations").insert(record).execute()
            return res.data[0]["id"]
        conversation_id = str(uuid.uuid4())
        self.memory["conversations"][conversation_id] = {
            "id": conversation_id,
            "user_id": user_id,
            "title": title,
            "status": "ai",
            "created_at": self._now(),
        }
        self.memory["messages"][conversation_id] = []
        return conversation_id

    def list_conversations(self, user_id: str) -> List[Dict[str, Any]]:
        if self.client:
            res = (
                self.client.table("conversations")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return res.data or []
        return [
            convo
            for convo in self.memory["conversations"].values()
            if convo["user_id"] == user_id
        ]

    def add_message(
        self, conversation_id: str, user_id: str, role: str, content: str
    ) -> Dict[str, Any]:
        record = {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "role": role,
            "content": content,
            "created_at": self._now(),
        }
        if self.client:
            res = self.client.table("messages").insert(record).execute()
            return res.data[0]
        record["id"] = str(uuid.uuid4())
        self.memory["messages"].setdefault(conversation_id, []).append(record)
        return record

    def list_messages(self, conversation_id: str, user_id: str) -> List[Dict[str, Any]]:
        if self.client:
            res = (
                self.client.table("messages")
                .select("*")
                .eq("conversation_id", conversation_id)
                .eq("user_id", user_id)
                .order("created_at", desc=False)
                .execute()
            )
            return res.data or []
        return [
            msg
            for msg in self.memory["messages"].get(conversation_id, [])
            if msg["user_id"] == user_id
        ]

    # Events ------------------------------------------------------------------------
    def log_event(
        self,
        trace_id: str,
        event_type: str,
        payload: Dict[str, Any],
        conversation_id: Optional[str],
        user_id: str,
    ) -> Dict[str, Any]:
        record = {
            "trace_id": trace_id,
            "event_type": event_type,
            "payload": payload,
            "conversation_id": conversation_id,
            "user_id": user_id,
            "created_at": self._now(),
        }
        if self.client:
            res = self.client.table("agent_events").insert(record).execute()
            return res.data[0]
        record["id"] = str(uuid.uuid4())
        self.memory["agent_events"].append(record)
        return record

    # Orders ------------------------------------------------------------------------
    def get_order(self, user_id: str, order_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            order_res = (
                self.client.table("orders")
                .select("*")
                .eq("user_id", user_id)
                .eq("order_id", order_id)
                .single()
                .execute()
            )
            if not order_res.data:
                return None
            items_res = (
                self.client.table("order_items")
                .select("*")
                .eq("user_id", user_id)
                .eq("order_id", order_id)
                .execute()
            )
            order = order_res.data
            order["order_items"] = items_res.data or []
            return order
        order = self.memory["orders"].get(order_id)
        if order and order["user_id"] == user_id:
            order["order_items"] = [
                item for item in self.memory["order_items"].values() if item["order_id"] == order_id
            ]
            return order
        return None

    def seed_mock_order(self, user_id: str) -> Dict[str, Any]:
        order_id = f"ORD-{str(uuid.uuid4())[:8]}"
        order = {
            "order_id": order_id,
            "user_id": user_id,
            "status": "delivered",
            "shipping_status": "delivered",
            "paid_amount": 4900,
            "currency": "CNY",
            "tracking_no": None,
            "created_at": self._now(),
        }
        item_id = str(uuid.uuid4())
        item = {
            "id": item_id,
            "order_id": order_id,
            "user_id": user_id,
            "sku": "SKU-001",
            "name": "Sample T-Shirt",
            "category": "apparel",
            "unit_price": 4900,
            "qty": 1,
        }
        if self.client:
            order_res = self.client.table("orders").insert(order).execute()
            self.client.table("order_items").insert(item).execute()
            return {"order": order_res.data[0], "order_items": [item]}
        self.memory["orders"][order_id] = order
        self.memory["order_items"][item_id] = item
        return {"order": order, "order_items": [item]}

    # Returns and approvals ---------------------------------------------------------
    def create_return(
        self,
        user_id: str,
        order_id: str,
        sku: str,
        reason: str,
        condition_ok: bool,
        requested_amount: int,
        status: str,
        refund_id: Optional[str] = None,
        refund_status: Optional[str] = None,
        refund_amount: Optional[int] = None,
        refund_error: Optional[str] = None,
        refund_completed_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        record = {
            "order_id": order_id,
            "sku": sku,
            "reason": reason,
            "condition_ok": condition_ok,
            "requested_amount": requested_amount,
            "status": status,
            "created_at": self._now(),
        }
        if refund_id is not None:
            record["refund_id"] = refund_id
        if refund_status is not None:
            record["refund_status"] = refund_status
        if refund_amount is not None:
            record["refund_amount"] = refund_amount
        if refund_error is not None:
            record["refund_error"] = refund_error
        if refund_completed_at is not None:
            record["refund_completed_at"] = refund_completed_at
        if self.client:
            return_id = str(uuid.uuid4())
            last_error = None
            for user_col in self._return_user_columns():
                for id_col in self._return_id_columns():
                    payload = dict(record)
                    payload[user_col] = user_id
                    payload[id_col] = return_id
                    removed_columns = set()
                    while True:
                        res = self.client.table("returns").insert(payload).execute()
                        if res.error:
                            last_error = res.error
                            missing = self._extract_missing_column(res.error)
                            if self._is_column_error(res.error) and missing:
                                if missing in (user_col, id_col):
                                    break
                                if missing in payload and missing not in removed_columns:
                                    payload.pop(missing, None)
                                    removed_columns.add(missing)
                                    continue
                            raise RuntimeError(str(res.error))
                        return self._normalize_return_row(res.data[0]) or res.data[0]
            if last_error:
                raise RuntimeError(str(last_error))
            raise RuntimeError("Failed to create return record")
        return_id = str(uuid.uuid4())
        record["id"] = return_id
        record["user_id"] = user_id
        self.memory["returns"][return_id] = record
        return record

    def update_return(
        self, user_id: str, return_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        updates = dict(updates)
        updates["updated_at"] = self._now()
        if self.client:
            last_error = None
            for user_col in self._return_user_columns():
                for id_col in self._return_id_columns():
                    payload = dict(updates)
                    removed_columns = set()
                    while True:
                        res = (
                            self.client.table("returns")
                            .update(payload)
                            .eq(id_col, return_id)
                            .eq(user_col, user_id)
                            .execute()
                        )
                        if res.error:
                            last_error = res.error
                            missing = self._extract_missing_column(res.error)
                            if self._is_column_error(res.error) and missing:
                                if missing in (user_col, id_col):
                                    break
                                if missing in payload and missing not in removed_columns:
                                    payload.pop(missing, None)
                                    removed_columns.add(missing)
                                    continue
                            raise RuntimeError(str(res.error))
                        if res.data:
                            return self._normalize_return_row(res.data[0]) or res.data[0]
                        break
            if last_error:
                raise RuntimeError(str(last_error))
            raise ValueError("Return record not found or not owned by user")
        record = self.memory["returns"].get(return_id)
        if not record or record["user_id"] != user_id:
            raise ValueError("Return record not found or not owned by user")
        record.update(updates)
        return record

    def create_approval_task(
        self, user_id: str, return_id: str, reason: str
    ) -> Dict[str, Any]:
        record = {
            "user_id": user_id,
            "return_id": return_id,
            "status": "pending",
            "reason": reason,
            "created_at": self._now(),
        }
        if self.client:
            res = self.client.table("approval_tasks").insert(record).execute()
            return res.data[0]
        approval_id = str(uuid.uuid4())
        record["id"] = approval_id
        self.memory["approval_tasks"][approval_id] = record
        return record

    def update_approval_status(
        self, user_id: str, task_id: str, status: str, reason: Optional[str] = None
    ) -> Dict[str, Any]:
        if self.client:
            res = (
                self.client.table("approval_tasks")
                .update({"status": status, "reason": reason})
                .eq("id", task_id)
                .eq("user_id", user_id)
                .execute()
            )
            if not res.data:
                raise ValueError("Approval task not found or not owned by user")
            return res.data[0]
        task = self.memory["approval_tasks"].get(task_id)
        if not task or task["user_id"] != user_id:
            raise ValueError("Approval task not found or not owned by user")
        task["status"] = status
        if reason:
            task["reason"] = reason
        task["updated_at"] = self._now()
        return task

    def list_approvals(self, user_id: str) -> List[Dict[str, Any]]:
        if self.client:
            res = (
                self.client.table("approval_tasks")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            return res.data or []
        return [
            task for task in self.memory["approval_tasks"].values() if task["user_id"] == user_id
        ]


def get_repo() -> Repository:
    return Repository.from_env()
