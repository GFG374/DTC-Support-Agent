from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from datetime import datetime, timezone

from ..core.auth import User, require_admin
from ..core.supabase import get_supabase_admin_client
from ..db.repo import Repository
from ..rag import bailian
from ..agents.return_planner import ReturnPlannerAgent
from ..integrations.alipay import get_alipay_client
import asyncio

router = APIRouter(tags=["admin_returns"])


def _days_since(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - dt).days


def _auto_refund_threshold() -> float:
    hits = bailian.search_policies("return policy, refund threshold")
    threshold = ReturnPlannerAgent._extract_auto_refund_threshold(hits) or 200.0
    return threshold


def _enforce_refund_policy(order: dict, amount_cents: int) -> None:
    days_since = _days_since(order.get("created_at"))
    if days_since is None:
        raise HTTPException(status_code=400, detail="Order date missing")
    if days_since > 30:
        raise HTTPException(status_code=400, detail="Return window expired (>30 days)")
    threshold = _auto_refund_threshold()
    amount_major = amount_cents / 100 if amount_cents else 0
    if amount_major <= threshold:
        raise HTTPException(status_code=400, detail="Auto-refund amount; admin action not required")


@router.get("/admin/returns")
async def admin_list_returns(
    user: User = Depends(require_admin),
    user_id: Optional[str] = Query(default=None),
    order_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
):
    client = get_supabase_admin_client()
    base_query = client.table("returns").select("*").order("created_at", desc=True).limit(limit)
    if order_id:
        base_query = base_query.eq("order_id", order_id)

    items = []
    try:
        if user_id:
            res = base_query.eq("user_id", user_id).execute()
        else:
            res = base_query.execute()
        items = res.data or []
    except Exception as exc:
        msg = str(exc).lower()
        if user_id and "column" in msg and "user_id" in msg:
            fallback = client.table("returns").select("*").order("created_at", desc=True).limit(limit)
            if order_id:
                fallback = fallback.eq("order_id", order_id)
            try:
                res = fallback.eq("usr_id", user_id).execute()
                items = res.data or []
            except Exception:
                pass
        else:
            raise HTTPException(status_code=500, detail=str(exc))

    order_ids = list({item.get("order_id") for item in items if item.get("order_id")})
    if order_ids:
        orders_res = (
            client.table("orders")
            .select("order_id, paid_amount, created_at")
            .in_("order_id", order_ids)
            .execute()
        )
        order_map = {row["order_id"]: row for row in (orders_res.data or [])}
        for item in items:
            order_id_val = item.get("order_id")
            if order_id_val in order_map:
                item["order_paid_amount"] = order_map[order_id_val].get("paid_amount")
                item["order_created_at"] = order_map[order_id_val].get("created_at")
    return {
        "items": items,
        "meta": {"auto_refund_threshold": _auto_refund_threshold()},
    }


@router.post("/admin/returns/{return_id}/refund")
async def admin_refund_return(
    return_id: str,
    user: User = Depends(require_admin),
):
    print(f"[admin_refund_return] user={user.user_id} return_id={return_id}")
    client = get_supabase_admin_client()
    return_row = None
    for column in ("id", "rma_id"):
        try:
            res = client.table("returns").select("*").eq(column, return_id).limit(1).execute()
            if res.data:
                return_row = res.data[0]
                break
        except Exception:
            continue

    if not return_row:
        print(f"[admin_refund_return] return not found return_id={return_id}")
        raise HTTPException(status_code=404, detail="Return not found")

    order_id = return_row.get("order_id")
    if not order_id:
        print(f"[admin_refund_return] missing order_id return_id={return_id}")
        raise HTTPException(status_code=400, detail="Missing order_id for return")

    order_res = client.table("orders").select("*").eq("order_id", order_id).limit(1).execute()
    order = order_res.data[0] if order_res.data else None
    if not order:
        print(f"[admin_refund_return] order not found order_id={order_id}")
        raise HTTPException(status_code=404, detail="Order not found")

    amount_cents = (
        return_row.get("refund_amount")
        or return_row.get("requested_amount")
        or order.get("paid_amount")
        or 0
    )
    if not amount_cents or amount_cents <= 0:
        print(f"[admin_refund_return] invalid amount order_id={order_id} amount={amount_cents}")
        raise HTTPException(status_code=400, detail="Invalid refund amount")

    _enforce_refund_policy(order, amount_cents)

    refund_id = return_row.get("refund_id") or return_id
    alipay = get_alipay_client(use_mock=False)
    trade_check = await alipay.query_trade(out_trade_no=order_id, trade_no=order.get("alipay_trade_no"))
    trade_status = trade_check.get("trade_status")
    if not trade_check.get("success") or trade_status not in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
        raise HTTPException(status_code=400, detail=f"Trade not refundable: {trade_status or trade_check.get('error')}")
    result = None
    for attempt in range(3):
        result = await alipay.refund(
            order_id=order_id,
            amount=amount_cents / 100,
            reason=return_row.get("reason") or "admin_refund",
            refund_id=refund_id,
        )
        if result.get("success"):
            break
        if attempt < 2:
            await asyncio.sleep(1.5)
    print(f"[admin_refund_return] refund_result order_id={order_id} result={result}")

    updates = {
        "refund_id": result.get("refund_id", refund_id),
        "refund_status": "success" if result.get("success") else "failed",
        "refund_amount": amount_cents,
        "status": "refunded" if result.get("success") else "refund_failed",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    if result.get("success"):
        updates["refund_completed_at"] = result.get("gmt_refund_pay")
    else:
        updates["refund_error"] = result.get("error")

    updated = False
    for column in ("id", "rma_id"):
        try:
            client.table("returns").update(updates).eq(column, return_id).execute()
            updated = True
            break
        except Exception:
            continue
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update return status")

    return {"ok": True, "refund": result, "order_id": order_id, "amount_cents": amount_cents}


@router.post("/admin/orders/{order_id}/refund")
async def admin_refund_order(
    order_id: str,
    user: User = Depends(require_admin),
):
    print(f"[admin_refund_order] user={user.user_id} order_id={order_id}")
    client = get_supabase_admin_client()
    order_res = client.table("orders").select("*").eq("order_id", order_id).limit(1).execute()
    order = order_res.data[0] if order_res.data else None
    if not order:
        print(f"[admin_refund_order] order not found order_id={order_id}")
        raise HTTPException(status_code=404, detail="Order not found")

    amount_cents = order.get("paid_amount") or 0
    if not amount_cents or amount_cents <= 0:
        print(f"[admin_refund_order] invalid amount order_id={order_id} amount={amount_cents}")
        raise HTTPException(status_code=400, detail="Invalid order amount")

    _enforce_refund_policy(order, amount_cents)

    repo = Repository.from_env()
    return_row = None
    try:
        res = (
            client.table("returns")
            .select("*")
            .eq("order_id", order_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return_row = repo._normalize_return_row(res.data[0])
    except Exception:
        return_row = None

    if return_row:
        return_id = return_row.get("id") or return_row.get("rma_id")
    else:
        return_row = repo.create_return(
            user_id=order.get("user_id"),
            order_id=order_id,
            sku="",
            reason="admin_refund",
            condition_ok=True,
            requested_amount=amount_cents,
            status="refund_processing",
            refund_status="processing",
            refund_amount=amount_cents,
        )
        return_id = return_row.get("id") or return_row.get("rma_id")

    refund_id = return_row.get("refund_id") or return_id
    alipay = get_alipay_client(use_mock=False)
    trade_check = await alipay.query_trade(out_trade_no=order_id, trade_no=order.get("alipay_trade_no"))
    trade_status = trade_check.get("trade_status")
    if not trade_check.get("success") or trade_status not in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
        raise HTTPException(status_code=400, detail=f"Trade not refundable: {trade_status or trade_check.get('error')}")
    result = None
    for attempt in range(3):
        result = await alipay.refund(
            order_id=order_id,
            amount=amount_cents / 100,
            reason=return_row.get("reason") or "admin_refund",
            refund_id=refund_id,
        )
        if result.get("success"):
            break
        if attempt < 2:
            await asyncio.sleep(1.5)
    print(f"[admin_refund_order] refund_result order_id={order_id} result={result}")

    updates = {
        "refund_id": result.get("refund_id", refund_id),
        "refund_status": "success" if result.get("success") else "failed",
        "refund_amount": amount_cents,
        "status": "refunded" if result.get("success") else "refund_failed",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    if result.get("success"):
        updates["refund_completed_at"] = result.get("gmt_refund_pay")
    else:
        updates["refund_error"] = result.get("error")

    try:
        if return_id and order.get("user_id"):
            repo.update_return(user_id=order.get("user_id"), return_id=return_id, updates=updates)
    except Exception:
        pass

    return {"ok": True, "refund": result, "order_id": order_id, "amount_cents": amount_cents}


@router.delete("/admin/returns/{return_id}")
async def admin_delete_return(
    return_id: str,
    user: User = Depends(require_admin),
):
    client = get_supabase_admin_client()
    return_row = None
    matched_by = None
    for column in ("id", "rma_id"):
        try:
            res = client.table("returns").select("*").eq(column, return_id).limit(1).execute()
            if res.data:
                return_row = res.data[0]
                matched_by = column
                break
        except Exception:
            continue
    if not return_row:
        try:
            res = client.table("returns").select("*").eq("order_id", return_id).limit(1).execute()
            if res.data:
                return_row = res.data[0]
                matched_by = "order_id"
        except Exception:
            pass
    if not return_row:
        return {"ok": True, "deleted": None, "order_id": None, "already_deleted": True, "return_id": return_id}

    order_id = return_row.get("order_id") or (return_id if matched_by == "order_id" else None)
    if order_id:
        client.table("returns").delete().eq("order_id", order_id).execute()
    else:
        for column in ("id", "rma_id"):
            try:
                client.table("returns").delete().eq(column, return_id).execute()
                break
            except Exception:
                continue

    return {"ok": True, "deleted": return_id, "order_id": order_id}
