"""
支付宝沙箱环境 API 集成
用于退款处理演示
"""
import hashlib
import urllib.parse
from typing import Dict, Optional
from datetime import datetime
import httpx
from ..core.config import settings


class AlipayClient:
    """
    支付宝 SDK 客户端（沙箱环境）
    
    配置步骤：
    1. 访问 https://open.alipay.com/develop/sandbox/app
    2. 获取 AppID、应用私钥、支付宝公钥
    3. 在 .env 中配置相应参数
    """
    
    def __init__(
        self,
        app_id: str,
        private_key: str,
        alipay_public_key: str,
        sandbox: bool = True
    ):
        self.app_id = app_id
        self.private_key = private_key
        self.alipay_public_key = alipay_public_key
        
        # 沙箱环境和正式环境网关
        if sandbox:
            self.gateway = "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
        else:
            self.gateway = "https://openapi.alipay.com/gateway.do"
    
    async def refund(
        self,
        order_id: str,
        amount: float,
        reason: str = "用户退货"
    ) -> Dict:
        """
        发起退款
        
        Args:
            order_id: 商户订单号
            amount: 退款金额（元）
            reason: 退款原因
        
        Returns:
            {
                "success": true,
                "refund_id": "支付宝退款单号",
                "status": "processing",
                "message": "退款处理中"
            }
        """
        # API 方法
        method = "alipay.trade.refund"
        
        # 业务参数
        biz_content = {
            "out_trade_no": order_id,  # 商户订单号
            "refund_amount": amount,  # 退款金额
            "refund_reason": reason,  # 退款原因
        }
        
        # 发起请求
        try:
            response = await self._execute(method, biz_content)
            
            # 解析响应
            if response.get("code") == "10000":
                # 退款成功
                return {
                    "success": True,
                    "refund_id": response.get("trade_no", f"REFUND_{order_id}"),
                    "status": "processing",
                    "message": "退款处理成功",
                    "fund_change": response.get("fund_change", "Y"),  # 资金是否变动
                    "gmt_refund_pay": response.get("gmt_refund_pay", datetime.now().isoformat())
                }
            else:
                # 退款失败
                return {
                    "success": False,
                    "error": response.get("sub_msg", response.get("msg", "未知错误")),
                    "code": response.get("code")
                }
        
        except Exception as e:
            print(f"[Alipay] 退款异常: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def query_refund(self, order_id: str, refund_id: str) -> Dict:
        """
        查询退款状态
        
        Args:
            order_id: 商户订单号
            refund_id: 退款请求号
        
        Returns:
            退款状态信息
        """
        method = "alipay.trade.fastpay.refund.query"
        
        biz_content = {
            "out_trade_no": order_id,
            "out_request_no": refund_id
        }
        
        try:
            response = await self._execute(method, biz_content)
            
            if response.get("code") == "10000":
                return {
                    "success": True,
                    "status": "completed",
                    "refund_amount": response.get("refund_amount"),
                    "gmt_refund_pay": response.get("gmt_refund_pay")
                }
            else:
                return {
                    "success": False,
                    "error": response.get("sub_msg", "查询失败")
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _execute(self, method: str, biz_content: Dict) -> Dict:
        """
        执行 API 调用
        
        Args:
            method: API 方法名
            biz_content: 业务参数
        
        Returns:
            API 响应
        """
        # 公共参数
        params = {
            "app_id": self.app_id,
            "method": method,
            "format": "JSON",
            "charset": "utf-8",
            "sign_type": "RSA2",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "version": "1.0",
            "biz_content": str(biz_content).replace("'", '"')  # 转为 JSON 字符串
        }
        
        # 生成签名
        params["sign"] = self._sign(params)
        
        # 发起 HTTP 请求
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.gateway,
                data=params,
                timeout=30.0
            )
            
            # 解析响应
            result = response.json()
            
            # 提取业务响应
            response_key = method.replace(".", "_") + "_response"
            return result.get(response_key, {})
    
    def _sign(self, params: Dict) -> str:
        """
        生成签名（RSA2）
        
        注意：实际使用时需要用 RSA 私钥签名
        这里简化为 MD5 演示（仅用于 Mock）
        """
        # 排序参数
        sorted_params = sorted(params.items())
        
        # 拼接字符串
        sign_str = "&".join([f"{k}={v}" for k, v in sorted_params if k != "sign"])
        
        # 简化签名（实际应使用 RSA 私钥）
        # TODO: 使用 Crypto.PublicKey.RSA 进行真实签名
        signature = hashlib.md5(sign_str.encode("utf-8")).hexdigest()
        
        return signature


# ===== Mock 版本（无需真实配置即可运行）=====

class MockAlipayClient:
    """
    支付宝 Mock 客户端
    用于演示和测试，不调用真实 API
    """
    
    async def refund(
        self,
        order_id: str,
        amount: float,
        reason: str = "用户退货"
    ) -> Dict:
        """模拟退款成功"""
        refund_id = f"ALIPAY_REFUND_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        print(f"[Mock Alipay] 模拟退款：订单={order_id}, 金额=¥{amount}, 原因={reason}")
        
        return {
            "success": True,
            "refund_id": refund_id,
            "status": "processing",
            "message": "退款处理成功（模拟）",
            "fund_change": "Y",
            "gmt_refund_pay": datetime.now().isoformat()
        }
    
    async def query_refund(self, order_id: str, refund_id: str) -> Dict:
        """模拟查询退款状态"""
        return {
            "success": True,
            "status": "completed",
            "refund_amount": "0.00",
            "gmt_refund_pay": datetime.now().isoformat()
        }


# ===== 工厂函数 =====

def get_alipay_client(use_mock: bool = True) -> AlipayClient | MockAlipayClient:
    """
    获取支付宝客户端
    
    Args:
        use_mock: 是否使用 Mock 版本（默认 True，便于演示）
    
    Returns:
        AlipayClient 或 MockAlipayClient
    """
    if use_mock:
        return MockAlipayClient()
    else:
        # 从配置读取真实参数
        return AlipayClient(
            app_id=getattr(settings, "ALIPAY_APP_ID", ""),
            private_key=getattr(settings, "ALIPAY_PRIVATE_KEY", ""),
            alipay_public_key=getattr(settings, "ALIPAY_PUBLIC_KEY", ""),
            sandbox=getattr(settings, "ALIPAY_SANDBOX", True)
        )
