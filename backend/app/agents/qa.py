from typing import Dict, List


def render_missing_fields(missing: List[str]) -> str:
    formatted = ", ".join(missing)
    return (
        f"I can help with your return. Please share the following details: {formatted}. "
        "Once I have them, I will check the order and our policy for you."
    )


def render_return_result(decision: str, approval_task_id: str = "") -> str:
    if decision == "auto_refund":
        return (
            "Thanks for the info. Your return meets the policy and I have initiated a refund. "
            "You will see it in your account shortly."
        )
    if decision == "awaiting_approval":
        detail = (
            f" I've created approval task {approval_task_id}. Our team will review it soon."
            if approval_task_id
            else ""
        )
        return (
            "Your request needs a quick manual review because of the amount or risk flags."
            + detail
        )
    if decision == "rejected":
        return (
            "I cannot approve this return based on the current policy (outside window or "
            "item condition). Do you want me to escalate to a human agent?"
        )
    return "I have recorded your request. Let me know if you want to adjust anything."


def render_wismo_reply() -> str:
    return "I can help track your shipment. Please share your order number and I will check its latest status."


def render_faq_reply() -> str:
    return "Thanks for reaching out. Ask me about orders, returns, exchanges, or shipping and I will help."


def render_human_handoff(route: Dict[str, object]) -> str:
    reason = route.get("escalate_reason") or "You asked to speak with a person."
    return f"I am transferring you to a human agent. Reason: {reason}"
