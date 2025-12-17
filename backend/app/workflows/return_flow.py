import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from ..agents import qa
from ..db.repo import Repository
from ..rag import bailian
from ..rules import returns as return_rules


@dataclass
class ReturnContext:
    user_id: str
    conversation_id: str
    user_message: str
    trace_id: str
    order_id: Optional[str] = None
    sku: Optional[str] = None
    reason: Optional[str] = None
    condition_ok: Optional[bool] = None
    requested_amount: Optional[int] = None
    policy_hits: List[Dict[str, object]] = field(default_factory=list)
    approval_task_id: Optional[str] = None
    decision: str = ""
    return_id: Optional[str] = None


class ReturnFlow:
    def __init__(self, repo: Repository, rag_client=bailian):
        self.repo = repo
        self.rag = rag_client

    async def handle(
        self,
        user_id: str,
        conversation_id: str,
        user_message: str,
        trace_id: str,
    ) -> Tuple[str, Dict[str, object]]:
        ctx = ReturnContext(
            user_id=user_id,
            conversation_id=conversation_id,
            user_message=user_message,
            trace_id=trace_id,
        )
        self._extract_basic_info(ctx)
        missing = self._missing_fields(ctx)
        if missing:
            reply = qa.render_missing_fields(missing)
            return reply, {"state": "CollectInfo", "missing": missing}

        order = self.repo.get_order(user_id, ctx.order_id)
        if not order:
            reply = "I could not find that order. Please confirm the order number."
            return reply, {"state": "FetchOrder", "order_found": False}

        ctx.policy_hits = self.rag.search_policies("return policy, refund threshold")
        self.repo.log_event(
            trace_id=trace_id,
            event_type="POLICY_HIT",
            payload={"hits": ctx.policy_hits},
            conversation_id=conversation_id,
            user_id=user_id,
        )
        rules = return_rules.evaluate(
            days_since_purchase=return_rules.days_since(order.get("created_at")),
            condition_ok=bool(ctx.condition_ok),
            requested_amount=ctx.requested_amount or 0,
            auto_threshold=return_rules.approval_threshold(),
        )

        if not rules["within_window"] or not rules["condition_ok"]:
            ctx.decision = "rejected"
            reply = qa.render_return_result("rejected")
            return reply, {"state": "RuleCheck", "decision": ctx.decision, "rules": rules}

        ctx.decision = (
            "awaiting_approval"
            if rules["needs_approval"]
            else "auto_refund"
        )
        return_record = self.repo.create_return(
            user_id=user_id,
            order_id=ctx.order_id,
            sku=ctx.sku or "",
            reason=ctx.reason or "unspecified",
            condition_ok=ctx.condition_ok is not False,
            requested_amount=ctx.requested_amount or 0,
            status="awaiting_approval" if rules["needs_approval"] else "refunded",
        )
        ctx.return_id = return_record.get("id")

        if rules["needs_approval"]:
            approval = self.repo.create_approval_task(
                user_id=user_id,
                return_id=ctx.return_id or "",
                reason="Amount exceeds auto-approval threshold",
            )
            ctx.approval_task_id = approval.get("id")
            self.repo.log_event(
                trace_id=trace_id,
                event_type="APPROVAL_CREATED",
                payload={"approval_task_id": ctx.approval_task_id},
                conversation_id=conversation_id,
                user_id=user_id,
            )

        reply = qa.render_return_result(ctx.decision, ctx.approval_task_id or "")
        return reply, {
            "state": "Notify",
            "decision": ctx.decision,
            "return_id": ctx.return_id,
            "approval_task_id": ctx.approval_task_id,
            "policy_hits": ctx.policy_hits,
            "rules": rules,
        }

    @staticmethod
    def _extract_basic_info(ctx: ReturnContext) -> None:
        text = ctx.user_message
        id_match = re.search(r"(ord[\-\s]*\d+|\d{6,})", text, flags=re.IGNORECASE)
        amount_match = re.search(r"(\d+)(?:\.?(\d{1,2}))?", text)
        ctx.order_id = id_match.group(0) if id_match else None
        if amount_match:
            # interpret as currency in cents to keep deterministic math
            integer_part = amount_match.group(1)
            decimal_part = amount_match.group(2) or "00"
            ctx.requested_amount = int(integer_part) * 100 + int(decimal_part[:2].ljust(2, "0"))
        ctx.reason = "return request"
        condition_text = text.lower()
        if "broken" in condition_text or "damaged" in condition_text:
            ctx.condition_ok = False
        elif "good condition" in condition_text or "unused" in condition_text:
            ctx.condition_ok = True
        else:
            ctx.condition_ok = None
        ctx.sku = None

    @staticmethod
    def _missing_fields(ctx: ReturnContext) -> List[str]:
        missing = []
        if not ctx.order_id:
            missing.append("order_id")
        if ctx.condition_ok is None:
            missing.append("condition_ok")
        if ctx.requested_amount is None:
            missing.append("requested_amount (in cents)")
        if not ctx.sku:
            missing.append("sku")
        return missing
