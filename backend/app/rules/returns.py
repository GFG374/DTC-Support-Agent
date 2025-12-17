from datetime import datetime, timezone
from typing import Dict

from ..core.config import settings


def days_since(created_at: str) -> int:
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except Exception:
        return 0
    delta = datetime.now(timezone.utc) - dt
    return delta.days


def approval_threshold() -> int:
    return int(settings.return_auto_approval_threshold or 5000)


def evaluate(
    days_since_purchase: int,
    condition_ok: bool,
    requested_amount: int,
    auto_threshold: int,
) -> Dict[str, object]:
    within_window = days_since_purchase < 30
    needs_approval = requested_amount >= auto_threshold
    return {
        "within_window": within_window,
        "condition_ok": condition_ok,
        "needs_approval": needs_approval,
    }
