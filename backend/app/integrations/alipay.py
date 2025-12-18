"""Alipay sandbox integration for refunds."""
from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Dict, Optional

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from ..core.config import settings


class AlipayClient:
    def __init__(self, app_id: str, private_key: str, alipay_public_key: str, sandbox: bool = True):
        self.app_id = app_id
        self.private_key = private_key
        self.alipay_public_key = alipay_public_key
        self.gateway = (
            "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
            if sandbox
            else "https://openapi.alipay.com/gateway.do"
        )

    async def refund(
        self,
        order_id: str,
        amount: float,
        reason: str = "user_requested",
        refund_id: Optional[str] = None,
    ) -> Dict:
        method = "alipay.trade.refund"
        biz_content = {
            "out_trade_no": order_id,
            "refund_amount": f"{amount:.2f}",
            "refund_reason": reason,
        }
        if refund_id:
            biz_content["out_request_no"] = refund_id

        try:
            response = await self._execute(method, biz_content)
            if response.get("code") == "10000":
                return {
                    "success": True,
                    "refund_id": response.get("trade_no", refund_id or f"REFUND_{order_id}"),
                    "status": "processing",
                    "message": "refund accepted",
                    "fund_change": response.get("fund_change", "Y"),
                    "gmt_refund_pay": response.get("gmt_refund_pay"),
                }
            return {
                "success": False,
                "error": response.get("sub_msg", response.get("msg", "unknown")),
                "code": response.get("code"),
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def query_refund(self, order_id: str, refund_id: str) -> Dict:
        method = "alipay.trade.fastpay.refund.query"
        biz_content = {
            "out_trade_no": order_id,
            "out_request_no": refund_id,
        }
        try:
            response = await self._execute(method, biz_content)
            if response.get("code") == "10000":
                return {
                    "success": True,
                    "status": response.get("refund_status", "completed"),
                    "refund_amount": response.get("refund_amount"),
                    "gmt_refund_pay": response.get("gmt_refund_pay"),
                }
            return {"success": False, "error": response.get("sub_msg", "query_failed")}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def _execute(self, method: str, biz_content: Dict) -> Dict:
        params = {
            "app_id": self.app_id,
            "method": method,
            "format": "JSON",
            "charset": "utf-8",
            "sign_type": "RSA2",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "version": "1.0",
            "biz_content": json.dumps(biz_content, separators=(",", ":"), ensure_ascii=False),
        }

        params["sign"] = self._sign(params)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.gateway, data=params)
            result = response.json()
            response_key = method.replace(".", "_") + "_response"
            return result.get(response_key, {})

    def _sign(self, params: Dict) -> str:
        sign_str = "&".join(
            f"{k}={v}" for k, v in sorted(params.items()) if v is not None and v != "" and k != "sign"
        )
        key_bytes = self._normalize_key(self.private_key)
        private_key = serialization.load_pem_private_key(key_bytes, password=None)
        signature = private_key.sign(
            sign_str.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("utf-8")

    @staticmethod
    def _normalize_key(value: str) -> bytes:
        if not value:
            raise ValueError("missing alipay private key")
        key = value.replace("\\n", "\n").strip()
        if "BEGIN" not in key:
            key = "-----BEGIN PRIVATE KEY-----\n" + key + "\n-----END PRIVATE KEY-----"
        return key.encode("utf-8")


class MockAlipayClient:
    async def refund(self, order_id: str, amount: float, reason: str = "user_requested") -> Dict:
        refund_id = f"ALIPAY_REFUND_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return {
            "success": True,
            "refund_id": refund_id,
            "status": "processing",
            "message": "mock refund",
            "fund_change": "Y",
            "gmt_refund_pay": datetime.now().isoformat(),
        }

    async def query_refund(self, order_id: str, refund_id: str) -> Dict:
        return {
            "success": True,
            "status": "completed",
            "refund_amount": "0.00",
            "gmt_refund_pay": datetime.now().isoformat(),
        }


def get_alipay_client(use_mock: bool = True) -> AlipayClient | MockAlipayClient:
    if use_mock:
        return MockAlipayClient()
    return AlipayClient(
        app_id=settings.alipay_app_id,
        private_key=settings.alipay_private_key,
        alipay_public_key=settings.alipay_public_key,
        sandbox=settings.alipay_sandbox,
    )
