"""
Order Agent - 订单查询部门
负责查询订单详情和物流信息
"""

from app.integrations.order import MockOrderAPI


class OrderAgent:
    """订单部门 - 处理订单查询和物流查询"""
    
    def __init__(self):
        self.order_api = MockOrderAPI()
    
    def get_order_details(self, order_id: str) -> dict:
        """
        获取订单详细信息
        
        Args:
            order_id: 订单号
            
        Returns:
            订单详情字典
        """
        order = self.order_api.get_order(order_id)
        
        if not order:
            return {
                "success": False,
                "error": f"订单 {order_id} 不存在"
            }
        
        return {
            "success": True,
            "order_id": order["order_id"],
            "status": order["status"],
            "status_cn": self._translate_status(order["status"]),
            "amount": order["amount"],
            "order_date": order["order_date"],
            "products": order["products"],
            "can_return": order["can_return"]
        }
    
    def get_logistics_info(self, order_id: str) -> dict:
        """
        获取物流跟踪信息
        
        Args:
            order_id: 订单号
            
        Returns:
            物流信息字典
        """
        logistics = self.order_api.get_logistics(order_id)
        
        if not logistics:
            return {
                "success": False,
                "error": f"订单 {order_id} 的物流信息不存在"
            }
        
        # 美化物流状态
        status_cn = self._translate_logistics_status(logistics["status"])
        
        return {
            "success": True,
            "status": logistics["status"],
            "status_cn": status_cn,
            "carrier": logistics["carrier"],
            "tracking_number": logistics["tracking_number"],
            "current_location": logistics.get("current_location", "未知"),
            "estimated_delivery": logistics.get("estimated_delivery", "查询中"),
            "timeline": logistics.get("timeline", [])
        }
    
    def _translate_status(self, status: str) -> str:
        """翻译订单状态"""
        status_map = {
            "delivered": "已签收",
            "shipping": "运输中",
            "processing": "处理中",
            "cancelled": "已取消"
        }
        return status_map.get(status, status)
    
    def _translate_logistics_status(self, status: str) -> str:
        """翻译物流状态"""
        status_map = {
            "delivered": "已签收",
            "in_transit": "运输中",
            "picked_up": "已揽收",
            "pending": "待发货"
        }
        return status_map.get(status, status)
