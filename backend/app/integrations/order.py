"""
Mock 订单 API
模拟电商平台的订单系统，用于演示
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import random


class MockOrderAPI:
    """
    模拟订单 API
    返回测试订单数据
    """
    
    def __init__(self):
        # 预置测试订单
        self.orders = {
            "ORD20250101001": {
                "order_id": "ORD20250101001",
                "user_id": "user_001",
                "status": "delivered",  # 已签收
                "amount": 89.00,
                "products": [
                    {
                        "name": "Nike Air Max 270",
                        "quantity": 1,
                        "price": 89.00,
                        "sku": "NIKE-AM270-BLK-42"
                    }
                ],
                "order_date": (datetime.now() - timedelta(days=10)).isoformat(),
                "delivery_date": (datetime.now() - timedelta(days=3)).isoformat(),
                "can_return": True,
                "shipping_address": "北京市朝阳区建国路88号",
                "payment_method": "alipay"
            },
            "ORD20250102002": {
                "order_id": "ORD20250102002",
                "user_id": "user_002",
                "status": "delivered",
                "amount": 299.00,
                "products": [
                    {
                        "name": "Adidas Ultra Boost",
                        "quantity": 1,
                        "price": 299.00,
                        "sku": "ADIDAS-UB-WHT-40"
                    }
                ],
                "order_date": (datetime.now() - timedelta(days=5)).isoformat(),
                "delivery_date": (datetime.now() - timedelta(days=1)).isoformat(),
                "can_return": True,
                "shipping_address": "上海市浦东新区世纪大道100号",
                "payment_method": "alipay"
            },
            "ORD20241201003": {
                "order_id": "ORD20241201003",
                "user_id": "user_003",
                "status": "delivered",
                "amount": 599.00,
                "products": [
                    {
                        "name": "Jordan 1 Retro High",
                        "quantity": 1,
                        "price": 599.00,
                        "sku": "JORDAN-1-RED-43"
                    }
                ],
                "order_date": (datetime.now() - timedelta(days=40)).isoformat(),  # 超过30天
                "delivery_date": (datetime.now() - timedelta(days=35)).isoformat(),
                "can_return": False,  # 超过退货期
                "shipping_address": "深圳市南山区科技园南路",
                "payment_method": "alipay"
            },
            "ORD20250110004": {
                "order_id": "ORD20250110004",
                "user_id": "user_004",
                "status": "shipped",  # 运输中
                "amount": 129.00,
                "products": [
                    {
                        "name": "New Balance 574",
                        "quantity": 1,
                        "price": 129.00,
                        "sku": "NB-574-GRY-41"
                    }
                ],
                "order_date": (datetime.now() - timedelta(days=2)).isoformat(),
                "delivery_date": None,
                "can_return": False,  # 未签收不能退货
                "shipping_address": "广州市天河区珠江新城",
                "payment_method": "alipay"
            },
        }
    
    async def get_order(self, order_id: str) -> Optional[Dict]:
        """
        获取订单信息
        
        Args:
            order_id: 订单号
        
        Returns:
            订单详情，不存在则返回 None
        """
        order = self.orders.get(order_id)
        
        if order:
            print(f"[Mock Order API] 查询订单: {order_id}")
            return order.copy()
        else:
            print(f"[Mock Order API] 订单不存在: {order_id}")
            return None
    
    async def list_user_orders(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict]:
        """
        查询用户订单列表
        
        Args:
            user_id: 用户 ID
            status: 订单状态过滤（可选）
            limit: 返回数量限制
        
        Returns:
            订单列表
        """
        user_orders = [
            order for order in self.orders.values()
            if order["user_id"] == user_id
        ]
        
        if status:
            user_orders = [o for o in user_orders if o["status"] == status]
        
        # 按时间倒序
        user_orders.sort(key=lambda x: x["order_date"], reverse=True)
        
        return user_orders[:limit]
    
    async def update_order_status(self, order_id: str, status: str) -> bool:
        """
        更新订单状态
        
        Args:
            order_id: 订单号
            status: 新状态
        
        Returns:
            是否成功
        """
        if order_id in self.orders:
            self.orders[order_id]["status"] = status
            print(f"[Mock Order API] 订单状态更新: {order_id} -> {status}")
            return True
        return False
    
    async def create_order(
        self,
        user_id: str,
        products: List[Dict],
        shipping_address: str,
        payment_method: str = "alipay"
    ) -> Dict:
        """
        创建新订单（用于测试）
        
        Args:
            user_id: 用户 ID
            products: 商品列表
            shipping_address: 收货地址
            payment_method: 支付方式
        
        Returns:
            新订单信息
        """
        order_id = f"ORD{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        total_amount = sum(p["price"] * p.get("quantity", 1) for p in products)
        
        order = {
            "order_id": order_id,
            "user_id": user_id,
            "status": "pending",  # 待支付
            "amount": total_amount,
            "products": products,
            "order_date": datetime.now().isoformat(),
            "delivery_date": None,
            "can_return": False,  # 未完成不能退货
            "shipping_address": shipping_address,
            "payment_method": payment_method
        }
        
        self.orders[order_id] = order
        print(f"[Mock Order API] 创建订单: {order_id}, 金额: ¥{total_amount}")
        
        return order.copy()
    
    async def get_order_logistics(self, order_id: str) -> Optional[Dict]:
        """
        查询物流信息
        
        Args:
            order_id: 订单号
        
        Returns:
            物流信息
        """
        order = await self.get_order(order_id)
        
        if not order:
            return None
        
        # 模拟物流轨迹
        if order["status"] == "delivered":
            return {
                "order_id": order_id,
                "status": "已签收",
                "carrier": "顺丰速运",
                "tracking_number": f"SF{random.randint(100000000000, 999999999999)}",
                "timeline": [
                    {
                        "time": (datetime.now() - timedelta(days=3)).isoformat(),
                        "status": "已签收",
                        "location": order["shipping_address"]
                    },
                    {
                        "time": (datetime.now() - timedelta(days=4)).isoformat(),
                        "status": "派送中",
                        "location": "同城派送员已揽件"
                    },
                    {
                        "time": (datetime.now() - timedelta(days=5)).isoformat(),
                        "status": "运输中",
                        "location": "到达目的地网点"
                    },
                    {
                        "time": (datetime.now() - timedelta(days=6)).isoformat(),
                        "status": "已发货",
                        "location": "快件已发出"
                    }
                ]
            }
        elif order["status"] == "shipped":
            return {
                "order_id": order_id,
                "status": "运输中",
                "carrier": "中通快递",
                "tracking_number": f"ZT{random.randint(100000000000, 999999999999)}",
                "timeline": [
                    {
                        "time": (datetime.now() - timedelta(hours=6)).isoformat(),
                        "status": "运输中",
                        "location": "包裹正在运输途中"
                    },
                    {
                        "time": (datetime.now() - timedelta(days=1)).isoformat(),
                        "status": "已发货",
                        "location": "快件已发出"
                    }
                ]
            }
        else:
            return {
                "order_id": order_id,
                "status": order["status"],
                "message": "订单尚未发货"
            }


# ===== 工厂函数 =====

def get_order_api() -> MockOrderAPI:
    """
    获取订单 API 实例
    
    Returns:
        MockOrderAPI 实例
    """
    return MockOrderAPI()
