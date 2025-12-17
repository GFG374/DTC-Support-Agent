"""
Return Planner Agent - 退货处理部门
负责检查退货政策、处理退款、生成 RMA
"""

from datetime import datetime, timedelta
from app.integrations.order import MockOrderAPI
from app.integrations.alipay import MockAlipayClient
import random


class ReturnPlannerAgent:
    """退货部门 - 处理退货退款请求"""
    
    def __init__(self):
        self.order_api = MockOrderAPI()
        self.alipay_client = MockAlipayClient()
        
    def check_return_policy(self, order_id: str) -> dict:
        """
        检查订单是否符合退货政策
        
        规则：
        - 30天内可退（从签收日期算）
        - 金额 > 200 需要主管审批
        
        Returns:
            {
                "eligible": bool,  # 是否符合政策
                "reason": str,     # 原因
                "order": dict      # 订单信息
            }
        """
        # 获取订单信息
        order = self.order_api.get_order(order_id)
        
        if not order:
            return {
                "eligible": False,
                "reason": f"订单 {order_id} 不存在",
                "order": None
            }
        
        # 检查订单状态（只有已签收的才能退）
        if order["status"] != "delivered":
            return {
                "eligible": False,
                "reason": f"订单状态为 {order['status']}，只有已签收的订单才能退货",
                "order": order
            }
        
        # 检查退货时间窗口（30天）
        order_date = datetime.strptime(order["order_date"], "%Y-%m-%d")
        days_since_order = (datetime.now() - order_date).days
        
        if days_since_order > 30:
            return {
                "eligible": False,
                "reason": f"订单已超过30天退货期限（已过{days_since_order}天）",
                "order": order,
                "suggestion": "如有特殊情况，建议联系人工客服"
            }
        
        # 检查金额（>200 需要审批）
        if order["amount"] > 200:
            return {
                "eligible": True,
                "need_approval": True,
                "reason": f"订单金额 {order['amount']} 元超过200元，需要主管审批",
                "order": order
            }
        
        # 符合退货政策
        return {
            "eligible": True,
            "need_approval": False,
            "reason": "符合30天退货政策",
            "order": order
        }
    
    def process_refund(self, order_id: str, amount: float, reason: str = "用户申请退款") -> dict:
        """
        处理退款（调用支付宝 API）
        
        Args:
            order_id: 订单号
            amount: 退款金额
            reason: 退款原因
            
        Returns:
            退款结果
        """
        # 调用支付宝退款 API
        refund_result = self.alipay_client.refund(
            out_trade_no=order_id,
            refund_amount=amount,
            refund_reason=reason
        )
        
        return refund_result
    
    def generate_rma_number(self) -> str:
        """
        生成退货授权码（RMA）
        
        Returns:
            RMA 号码（格式：RMA + 日期 + 随机数）
        """
        today = datetime.now().strftime("%Y%m%d")
        random_num = random.randint(100, 999)
        return f"RMA{today}{random_num}"
    
    def handle_return_request(self, order_id: str, reason: str = "用户申请退货") -> dict:
        """
        完整处理退货请求（供 Q&A Agent 调用）
        
        工作流程：
        1. 检查退货政策
        2. 如果符合 + 不需要审批 → 自动退款 + 生成 RMA
        3. 如果符合 + 需要审批 → 提交审批流程
        4. 如果不符合 → 返回拒绝理由
        
        Returns:
            完整的处理结果（格式化后直接给前台）
        """
        # Step 1: 检查政策
        policy_check = self.check_return_policy(order_id)
        
        # 不符合退货政策
        if not policy_check["eligible"]:
            return {
                "approved": False,
                "reason": policy_check["reason"],
                "suggestion": policy_check.get("suggestion", "请联系人工客服")
            }
        
        order = policy_check["order"]
        
        # 需要主管审批
        if policy_check.get("need_approval"):
            return {
                "approved": False,
                "action": "need_approval",
                "reason": policy_check["reason"],
                "order_id": order_id,
                "amount": order["amount"],
                "next_step": "已提交审批流程，预计1个工作日内回复"
            }
        
        # Step 2: 符合政策，自动退款
        refund_result = self.process_refund(
            order_id=order_id,
            amount=order["amount"],
            reason=reason
        )
        
        # Step 3: 生成 RMA
        rma_number = self.generate_rma_number()
        
        # Step 4: 返回成功结果
        return {
            "approved": True,
            "action": "auto_refund",
            "order_id": order_id,
            "refund_amount": order["amount"],
            "refund_id": refund_result.get("trade_no", "MOCK_REFUND_ID"),
            "rma_number": rma_number,
            "days": "3-5",
            "message": f"退款 {order['amount']} 元已提交，3-5个工作日内到账",
            "return_address": "北京市朝阳区 DSW 退货中心（邮编：100020）",
            "next_steps": [
                f"请在包裹上标注 RMA 号码：{rma_number}",
                "将商品寄回退货中心",
                "退款将在收到商品后3-5个工作日内原路退回"
            ]
        }
