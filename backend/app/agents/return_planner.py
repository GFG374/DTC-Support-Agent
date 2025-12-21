from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
import re
import random
import time

from app.db.repo import Repository
from app.integrations.alipay import get_alipay_client
from app.rag import bailian
from app.integrations.order import get_order_api


class ReturnPlannerAgent:
    """Return policy helper."""

    def __init__(
        self,
        user_id: Optional[str] = None,
        repo: Optional[Repository] = None,
        rag_client=bailian,
    ):
        self.user_id = user_id
        self.order_api = get_order_api()
        self.repo = repo or Repository.from_env()
        self.alipay_client = get_alipay_client(use_mock=False)
        self.rag = rag_client

    def check_return_policy(self, order_id: str) -> dict:
        policy_hits = self.rag.search_policies("return policy, refund threshold")
        if not policy_hits:
            return {
                "eligible": False,
                "need_human": True,
                "reason": "Return policy knowledge base is unavailable",
                "order": None,
                "policy_hits": [],
            }

        order = self.order_api.get_order(order_id, user_id=self.user_id)
        if not order:
            return {
                "eligible": False,
                "reason": f"Order {order_id} not found",
                "order": None,
                "policy_hits": policy_hits,
            }

        effective_user_id = self.user_id or order.get("user_id")
        if effective_user_id:
            latest_return = self.repo.get_latest_return(effective_user_id, order_id)
            if latest_return:
                refund_status = (latest_return.get("refund_status") or "").lower()
                status = (latest_return.get("status") or "").lower()
                if refund_status == "success" or status == "refunded":
                    return {
                        "eligible": False,
                        "already_refunded": True,
                        "reason": "Order has already been refunded",
                        "order": order,
                        "policy_hits": policy_hits,
                    }

        status = (order.get("status") or "").lower()
        shipping_status = (order.get("shipping_status") or "").lower()
        if status not in {"delivered", "completed"} and shipping_status != "delivered":
            return {
                "eligible": False,
                "reason": f"Order status is {status or shipping_status}",
                "order": order,
                "policy_hits": policy_hits,
            }

        created_at = order.get("created_at")
        created_dt = self._parse_dt(created_at)
        if not created_dt:
            return {
                "eligible": False,
                "reason": "Order date missing",
                "order": order,
                "policy_hits": policy_hits,
            }

        days_since = (datetime.now(timezone.utc) - created_dt).days
        if days_since > 30:
            return {
                "eligible": False,
                "reason": f"Return window expired ({days_since} days)",
                "order": order,
                "suggestion": "Contact support for exceptions",
                "policy_hits": policy_hits,
            }

        amount_cents = order.get("paid_amount") or 0
        amount_major = amount_cents / 100 if amount_cents else 0
        threshold = self._extract_auto_refund_threshold(policy_hits) or 200.0
        if amount_major > threshold:
            return {
                "eligible": True,
                "need_approval": True,
                "reason": f"Amount {amount_major:.2f} exceeds approval threshold {threshold:.2f}",
                "order": order,
                "policy_hits": policy_hits,
            }

        return {
            "eligible": True,
            "need_approval": False,
            "reason": "Return policy eligible",
            "order": order,
            "policy_hits": policy_hits,
        }

    async def process_refund(self, order_id: str, amount: float, reason: str, refund_id: str) -> dict:
        return await self.alipay_client.refund(
            order_id=order_id,
            amount=amount,
            reason=reason,
            refund_id=refund_id,
        )

    def generate_rma_number(self) -> str:
        today = datetime.now().strftime("%Y%m%d")
        return f"RMA{today}{random.randint(100, 999)}"

    async def handle_return_request(self, order_id: str, reason: str = "user_requested") -> dict:
        policy_check = self.check_return_policy(order_id)
        print(f"[return_planner] policy_hits={policy_check.get('policy_hits', [])}")
        if not policy_check.get("eligible"):
            if policy_check.get("already_refunded"):
                return {
                    "approved": False,
                    "action": "already_refunded",
                    "need_human": False,
                    "reason": policy_check.get("reason"),
                    "policy_hits": policy_check.get("policy_hits", []),
                }
            order = policy_check.get("order") or {}
            effective_user_id = self.user_id or order.get("user_id")
            amount_cents = order.get("paid_amount") or 0
            reason = policy_check.get("reason") or ""
            if effective_user_id:
                self.repo.create_return(
                    user_id=effective_user_id,
                    order_id=order_id,
                    sku="",
                    reason=reason,
                    condition_ok=False,
                    requested_amount=amount_cents,
                    status="rejected",
                )
            if "return window expired" in str(reason).lower():
                return {
                    "approved": False,
                    "action": "not_eligible",
                    "need_human": False,
                    "reason": reason,
                    "policy_hits": policy_check.get("policy_hits", []),
                }
            return {
                "approved": False,
                "action": "transfer_to_human",
                "need_human": True,
                "reason": reason,
                "suggestion": policy_check.get("suggestion", "Contact support"),
                "policy_hits": policy_check.get("policy_hits", []),
            }

        order = policy_check.get("order") or {}
        effective_user_id = self.user_id or order.get("user_id")
        amount_cents = order.get("paid_amount") or 0
        amount_major = amount_cents / 100 if amount_cents else 0

        if policy_check.get("need_approval"):
            if effective_user_id:
                self.repo.create_return(
                    user_id=effective_user_id,
                    order_id=order_id,
                    sku="",
                    reason=reason,
                    condition_ok=True,
                    requested_amount=amount_cents,
                    status="awaiting_approval",
                )
            return {
                "approved": False,
                "action": "need_approval",
                "need_human": True,
                "reason": policy_check.get("reason"),
                "order_id": order_id,
                "amount": amount_major,
                "next_step": "Approval required",
            }

        return_record = None
        if effective_user_id:
            return_record = self.repo.create_return(
                user_id=effective_user_id,
                order_id=order_id,
                sku="",
                reason=reason,
                condition_ok=True,
                requested_amount=amount_cents,
                status="refund_processing",
                refund_status="processing",
                refund_amount=amount_cents,
            )

        refund_id = (
            return_record.get("id") or return_record.get("rma_id")
            if return_record
            else f"REFUND_{int(time.time())}"
        )
        trade_check = await self.alipay_client.query_trade(out_trade_no=order_id)
        trade_status = trade_check.get("trade_status")
        if trade_check.get("success") and trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
            refund_result = await self.process_refund(
                order_id=order_id,
                amount=amount_major,
                reason=reason,
                refund_id=refund_id,
            )
        else:
            refund_result = {
                "success": False,
                "error": f"Trade not refundable: {trade_status or trade_check.get('error')}",
                "trade_status": trade_status,
            }

        if effective_user_id and return_record:
            if refund_result.get("success"):
                self.repo.update_return(
                    user_id=effective_user_id,
                    return_id=return_record.get("id") or return_record.get("rma_id"),
                    updates={
                        "refund_id": refund_result.get("refund_id", refund_id),
                        "refund_status": "success",
                        "status": "refunded",
                        "refund_completed_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            else:
                self.repo.update_return(
                    user_id=effective_user_id,
                    return_id=return_record.get("id") or return_record.get("rma_id"),
                    updates={
                        "refund_id": refund_id,
                        "refund_status": "failed",
                        "status": "refund_failed",
                        "refund_error": refund_result.get("error"),
                    },
                )

        rma_number = self.generate_rma_number()
        action = "auto_refund"
        need_human = not refund_result.get("success", False)
        if refund_result.get("trade_status") and not refund_result.get("success"):
            action = "payment_not_ready"
            need_human = False

        return {
            "approved": refund_result.get("success", False),
            "action": action,
            "need_human": need_human,
            "order_id": order_id,
            "refund_amount": amount_major,
            "refund_id": refund_result.get("refund_id", refund_id),
            "rma_number": rma_number,
            "days": "3-5",
            "message": "Refund submitted" if refund_result.get("success") else "Refund failed",
            "return_address": "Return Center",
            "refund_status": "success" if refund_result.get("success") else "failed",
        }

    @staticmethod
    def _parse_dt(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _extract_auto_refund_threshold(policy_hits: list[dict]) -> Optional[float]:
        for hit in policy_hits:
            content = str(hit.get("content", "")).lower()
            match = re.search(r"under\s+(\d+(?:\.\d+)?)\s*cny", content)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    continue
        return None
