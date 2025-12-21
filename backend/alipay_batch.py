"""
Utility script to bulk-generate Alipay sandbox pay URLs and sync paid status for Supabase orders.

Usage examples (from backend/):
  python alipay_batch.py gen          # generate pay URLs for pending orders (prints list, updates pay_url)
  python alipay_batch.py sync         # query trade status and mark paid orders
  python alipay_batch.py refund --order-id ORD123 --amount-cents 100  # refund a single order (amount in cents)
"""
from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Optional

from app.core.supabase import get_supabase_admin_client
from app.integrations.alipay import get_alipay_client


supabase = get_supabase_admin_client()
alipay = get_alipay_client(use_mock=False)


def cents_to_yuan(cents: int) -> float:
    return float(Decimal(int(cents)) / Decimal("100"))


def fetch_orders(filter_statuses: List[str], limit: int = 200) -> List[Dict]:
    query = (
        supabase.table("orders")
        .select("*")
        .in_("payment_status", filter_statuses)
        .order("created_at", desc=True)
        .limit(limit)
    )
    res = query.execute()
    return res.data or []


def update_order(order_id: str, updates: Dict) -> None:
    supabase.table("orders").update(updates).eq("order_id", order_id).execute()


def generate_pay_urls(limit: int = 200) -> List[Dict]:
    pending_orders = fetch_orders(["pending"], limit=limit)
    results = []
    for order in pending_orders:
        order_id = order.get("order_id")
        amount_cents = order.get("paid_amount") or order.get("pay_amount") or 0
        if not order_id or amount_cents <= 0:
            continue
        pay = alipay.create_page_pay_url(
            out_trade_no=order_id,
            total_amount=cents_to_yuan(amount_cents),
            subject=f"Order {order_id}",
        )
        update_order(
            order_id,
            {
                "payment_provider": "alipay",
                "payment_status": "pending",
                "alipay_out_trade_no": order_id,
                "pay_amount": amount_cents,
                "pay_url": pay.get("pay_url"),
            },
        )
        results.append(
            {
                "order_id": order_id,
                "amount_cents": amount_cents,
                "amount_yuan": cents_to_yuan(amount_cents),
                "pay_url": pay.get("pay_url"),
            }
        )
    return results


async def sync_paid(limit: int = 200) -> List[Dict]:
    orders = fetch_orders(["pending", "processing"], limit=limit)
    updates = []
    for order in orders:
        order_id = order.get("order_id")
        out_trade_no = order.get("alipay_out_trade_no") or order_id
        if not out_trade_no:
            continue
        query_res = await alipay.query_trade(out_trade_no=out_trade_no, trade_no=order.get("alipay_trade_no"))
        trade_status = query_res.get("trade_status")
        if query_res.get("success") and trade_status in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
            pay_amount_cents = order.get("pay_amount") or order.get("paid_amount") or 0
            update_order(
                order_id,
                {
                    "payment_status": "paid",
                    "alipay_trade_no": query_res.get("trade_no") or order.get("alipay_trade_no"),
                    "alipay_out_trade_no": query_res.get("out_trade_no") or out_trade_no,
                    "pay_amount": pay_amount_cents,
                    "paid_at": datetime.utcnow().isoformat() + "Z",
                },
            )
            updates.append({"order_id": order_id, "status": trade_status, "trade_no": query_res.get("trade_no")})
        else:
            updates.append(
                {
                    "order_id": order_id,
                    "status": trade_status or "unknown",
                    "error": query_res.get("error"),
                }
            )
    return updates


async def refund_order(order_id: str, amount_cents: Optional[int], reason: str = "sandbox-refund") -> Dict:
    order = (
        supabase.table("orders")
        .select("*")
        .eq("order_id", order_id)
        .limit(1)
        .single()
        .execute()
        .data
    )
    if not order:
        return {"success": False, "error": "order_not_found"}
    cents = amount_cents if amount_cents is not None else order.get("pay_amount") or order.get("paid_amount") or 0
    result = await alipay.refund(order_id=order_id, amount=cents_to_yuan(cents), reason=reason, refund_id=None)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Alipay sandbox batch helper for Supabase orders.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_gen = sub.add_parser("gen", help="Generate pay URLs for pending orders and store to pay_url.")
    p_gen.add_argument("--limit", type=int, default=200)

    p_sync = sub.add_parser("sync", help="Query trade status for pending/processing orders and mark paid.")
    p_sync.add_argument("--limit", type=int, default=200)

    p_refund = sub.add_parser("refund", help="Refund a single order.")
    p_refund.add_argument("--order-id", required=True)
    p_refund.add_argument("--amount-cents", type=int, help="Override refund amount in cents.")
    p_refund.add_argument("--reason", default="sandbox-refund")

    args = parser.parse_args()

    if args.cmd == "gen":
        results = generate_pay_urls(limit=args.limit)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    elif args.cmd == "sync":
        out = asyncio.run(sync_paid(limit=args.limit))
        print(json.dumps(out, ensure_ascii=False, indent=2))
    elif args.cmd == "refund":
        res = asyncio.run(refund_order(order_id=args.order_id, amount_cents=args.amount_cents, reason=args.reason))
        print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
