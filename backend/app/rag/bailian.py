from typing import List, Dict

# Placeholder for Bailian retrieval. Integrate the real API later.
MOCK_KB = [
    {
        "title": "Return window",
        "content": "Customers can request a return within 30 days of delivery.",
        "source_id": "policy-001",
        "score": 0.92,
    },
    {
        "title": "Refund threshold",
        "content": "Orders under 50 CNY are auto-refunded; higher amounts require approval.",
        "source_id": "policy-002",
        "score": 0.88,
    },
    {
        "title": "Item condition",
        "content": "Returned items must be in good condition and include all tags.",
        "source_id": "policy-003",
        "score": 0.85,
    },
]


def search_policies(query: str, top_k: int = 3) -> List[Dict[str, object]]:
    return MOCK_KB[:top_k]
