"""Alipay sandbox integration for refunds."""
from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Dict, Optional
from urllib.parse import urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from ..core.config import settings


class AlipayClient:
    def __init__(
        self,
        app_id: str,
        private_key: str,
        alipay_public_key: str,
        sandbox: bool = True,
        verify_ssl: bool = True,
    ):
        self.app_id = app_id
        self.private_key = private_key
        self.alipay_public_key = alipay_public_key
        self.sandbox = sandbox
        self.verify_ssl = verify_ssl
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
                    "sandbox": self.sandbox,
                    "gateway": self.gateway,
                    "fund_change": response.get("fund_change", "Y"),
                    "gmt_refund_pay": response.get("gmt_refund_pay"),
                }
            return {
                "success": False,
                "error": response.get("sub_msg", response.get("msg", "unknown")),
                "code": response.get("code"),
                "sandbox": self.sandbox,
                "gateway": self.gateway,
                "raw": response.get("raw"),
            }
        except Exception as exc:
            return {"success": False, "error": str(exc), "sandbox": self.sandbox, "gateway": self.gateway}

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
                    "sandbox": self.sandbox,
                    "gateway": self.gateway,
                }
            return {
                "success": False,
                "error": response.get("sub_msg", "query_failed"),
                "sandbox": self.sandbox,
                "gateway": self.gateway,
                "raw": response.get("raw"),
            }
        except Exception as exc:
            return {"success": False, "error": str(exc), "sandbox": self.sandbox, "gateway": self.gateway}

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

        async with httpx.AsyncClient(timeout=30.0, verify=self.verify_ssl) as client:
            response = await client.post(self.gateway, data=params)
            response_key = method.replace(".", "_") + "_response"
            
            # Alipay sandbox may return GBK-encoded responses despite charset=utf-8 in request.
            # Try to decode with multiple encodings.
            raw_content = response.content
            text = None
            
            # Try UTF-8 first, then GBK (common for Chinese payment gateways)
            for encoding in ["utf-8", "gbk", "gb2312", "gb18030"]:
                try:
                    text = raw_content.decode(encoding)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            
            if text is None:
                # Fallback: decode with errors ignored
                text = raw_content.decode("utf-8", errors="ignore")
            
            try:
                result = json.loads(text)
                inner = result.get(response_key, {})
                # Attach raw response for debugging
                inner["raw"] = text[:1000] if len(text) > 1000 else text
                return inner
            except json.JSONDecodeError as exc:
                return {
                    "code": None,
                    "msg": "invalid_json",
                    "sub_msg": f"JSON parse error: {exc}",
                    "raw": text[:500] if text else raw_content[:500].decode(errors="ignore"),
                }

    def _sign(self, params: Dict) -> str:
        sign_str = "&".join(
            f"{k}={v}" for k, v in sorted(params.items()) if v is not None and v != "" and k != "sign"
        )
        private_key = self._load_private_key(self.private_key)
        signature = private_key.sign(
            sign_str.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("utf-8")

    @staticmethod
    def _load_private_key(value: str):
        """
        Load RSA private key accepting both PKCS8 ("BEGIN PRIVATE KEY") and PKCS1 ("BEGIN RSA PRIVATE KEY") forms.
        """
        if not value:
            raise ValueError("missing alipay private key")
        normalized = value.replace("\\n", "\n").strip()
        candidates = []
        if "BEGIN" in normalized:
            candidates.append(normalized)
        else:
            candidates.append(f"-----BEGIN PRIVATE KEY-----\n{normalized}\n-----END PRIVATE KEY-----")
            candidates.append(f"-----BEGIN RSA PRIVATE KEY-----\n{normalized}\n-----END RSA PRIVATE KEY-----")

        last_exc = None
        for pem in candidates:
            try:
                return serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
            except Exception as exc:
                last_exc = exc
        raise ValueError(f"invalid alipay private key: {last_exc}")

    def create_page_pay_url(
        self,
        out_trade_no: str,
        total_amount: float,
        subject: str,
        return_url: Optional[str] = None,
        notify_url: Optional[str] = None,
        product_code: str = "FAST_INSTANT_TRADE_PAY",
    ) -> Dict:
        """
        Build a PC web payment URL (alipay.trade.page.pay) for sandbox/production.

        Returns a dict with the ready-to-open `pay_url`, the `out_trade_no`,
        and metadata for debugging.
        """
        method = "alipay.trade.page.pay"
        biz_content = {
            "out_trade_no": out_trade_no,
            "total_amount": f"{total_amount:.2f}",
            "subject": subject,
            "product_code": product_code,
        }
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
        if return_url:
            params["return_url"] = return_url
        if notify_url:
            params["notify_url"] = notify_url

        params["sign"] = self._sign(params)
        pay_url = f"{self.gateway}?{urlencode(params)}"
        return {
            "pay_url": pay_url,
            "out_trade_no": out_trade_no,
            "sandbox": self.sandbox,
            "gateway": self.gateway,
        }

    async def query_trade(self, out_trade_no: str, trade_no: Optional[str] = None) -> Dict:
        """
        Query a trade to confirm pay status.
        """
        method = "alipay.trade.query"
        biz_content = {
            "out_trade_no": out_trade_no,
        }
        if trade_no:
            biz_content["trade_no"] = trade_no
        try:
            response = await self._execute(method, biz_content)
            return {
                "success": response.get("code") == "10000",
                "trade_status": response.get("trade_status"),
                "total_amount": response.get("total_amount"),
                "buyer_logon_id": response.get("buyer_logon_id"),
                "trade_no": response.get("trade_no"),
                "out_trade_no": response.get("out_trade_no"),
                "sandbox": self.sandbox,
                "gateway": self.gateway,
                "raw": response,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc), "sandbox": self.sandbox, "gateway": self.gateway}


class MockAlipayClient:
    async def refund(
        self,
        order_id: str,
        amount: float,
        reason: str = "user_requested",
        refund_id: Optional[str] = None,
    ) -> Dict:
        refund_id = f"ALIPAY_REFUND_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        return {
            "success": True,
            "refund_id": refund_id,
            "status": "processing",
            "message": "mock refund",
            "sandbox": True,
            "gateway": "mock",
            "fund_change": "Y",
            "gmt_refund_pay": datetime.now().isoformat(),
        }

    async def query_refund(self, order_id: str, refund_id: str) -> Dict:
        return {
            "success": True,
            "status": "completed",
            "refund_amount": "0.00",
            "gmt_refund_pay": datetime.now().isoformat(),
            "sandbox": True,
            "gateway": "mock",
        }


def get_alipay_client(use_mock: bool = True) -> AlipayClient | MockAlipayClient:
    if use_mock:
        return MockAlipayClient()
    return AlipayClient(
        app_id=settings.alipay_app_id,
        private_key=settings.alipay_private_key,
        alipay_public_key=settings.alipay_public_key,
        sandbox=settings.alipay_sandbox,
        verify_ssl=settings.alipay_verify_ssl,
    )
