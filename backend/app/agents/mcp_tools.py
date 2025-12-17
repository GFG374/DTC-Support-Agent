"""
MCP Tools Definition for Multi-Agent System
定义各个 Agent 可以调用的工具（通过 Kimi Function Calling）
"""

# ===== Q&A Agent 的工具（前台可用）=====
QA_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "call_return_department",
            "description": "呼叫退货部门处理退货/退款请求。当用户想要退货、退款时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号（格式：ORD开头的11位数字）"
                    },
                    "reason": {
                        "type": "string",
                        "description": "退货原因（用户说明）"
                    }
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "call_order_department",
            "description": "呼叫订单部门查询订单状态、详情。当用户询问订单信息时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    }
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "call_logistics_department",
            "description": "呼叫物流部门查询物流信息、配送进度。当用户询问'在哪''什么时候到''物流'时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    }
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transfer_to_human",
            "description": "转接人工客服。当用户明确要求人工、或用户非常愤怒、或问题超出AI能力时使用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "转接原因（为什么需要人工）"
                    }
                },
                "required": ["reason"]
            }
        }
    }
]


# ===== Return Planner Agent 的工具（退货部门内部）=====
RETURN_PLANNER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_return_policy",
            "description": "检查订单是否符合退货政策（30天内、商品状态等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    }
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "process_refund",
            "description": "处理退款（调用支付宝API）",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    },
                    "amount": {
                        "type": "number",
                        "description": "退款金额"
                    },
                    "reason": {
                        "type": "string",
                        "description": "退款原因"
                    }
                },
                "required": ["order_id", "amount"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_rma_number",
            "description": "生成退货授权码（RMA）",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


# ===== Order Agent 的工具（订单部门内部）=====
ORDER_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_order_details",
            "description": "获取订单详细信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    }
                },
                "required": ["order_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_logistics_info",
            "description": "获取物流跟踪信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号"
                    }
                },
                "required": ["order_id"]
            }
        }
    }
]
