from typing import Dict

ESCALATION_KEYWORDS = ["human", "agent", "complaint", "bad service", "angry"]
RETURN_KEYWORDS = ["return", "refund"]
EXCHANGE_KEYWORDS = ["exchange", "size", "color"]
WISMO_KEYWORDS = ["where", "track", "shipping", "deliver", "order"]


def _contains(text: str, keywords) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def detect_intent(message: str) -> Dict[str, object]:
    """Heuristic router used until Kimi is wired in."""
    if _contains(message, ESCALATION_KEYWORDS):
        return {
            "intent": "HUMAN",
            "confidence": 0.9,
            "should_escalate": True,
            "escalate_reason": "Escalation keyword detected",
        }
    if _contains(message, RETURN_KEYWORDS):
        return {
            "intent": "RETURN",
            "confidence": 0.7,
            "should_escalate": False,
            "escalate_reason": "",
        }
    if _contains(message, EXCHANGE_KEYWORDS):
        return {
            "intent": "EXCHANGE",
            "confidence": 0.6,
            "should_escalate": False,
            "escalate_reason": "",
        }
    if _contains(message, WISMO_KEYWORDS):
        return {
            "intent": "WISMO",
            "confidence": 0.65,
            "should_escalate": False,
            "escalate_reason": "",
        }
    return {
        "intent": "FAQ",
        "confidence": 0.5,
        "should_escalate": False,
        "escalate_reason": "",
    }
