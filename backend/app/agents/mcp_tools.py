"""
MCP Tools Definition for Multi-Agent System
定义各个 Agent 可以调用的工具（通过 Kimi Function Calling）
按照 Kimi 官方文档格式优化 - description 详细说明工具作用和使用场景
"""

# ===== Q&A Agent 的工具（前台可用）====
QA_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "call_order_department",
            "description": """
                查询用户的订单信息。
                
                当用户询问订单相关问题时，调用此工具。例如：
                - 用户说"查订单"、"我的订单"、"订单状态"
                - 用户问"我买了什么"、"看看订单"
                - 用户想知道订单详情、订单金额、下单时间等
                
                你无法从自己的知识中获取用户的订单数据，必须通过此工具查询真实订单信息。
                调用后会返回订单号、状态、金额、商品列表、是否可退等信息。
            """,
            "parameters": {
                "type": "object",
                "required": [],
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号。如果用户提供了具体订单号（如ORD开头的编号）则填写，否则留空"
                    },
                    "keyword": {
                        "type": "string",
                        "description": "商品关键词。请提取商品的核心词汇，避免使用过于具体的修饰词。例如用户说'鞋子'请搜索'鞋'，用户说'红色的裙子'请搜索'裙'。关键词越短匹配概率越高。"
                    },
                    "list_all": {
                        "type": "boolean",
                        "description": "是否列出全部订单。当用户没有提供订单号、也没有描述商品时，设为 true 列出用户的全部订单"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "call_logistics_department",
            "description": """
                查询订单的物流配送信息。
                
                当用户询问物流、快递、配送相关问题时，调用此工具。例如：
                - 用户问"物流到哪了"、"快递进度"、"发货了吗"
                - 用户问"什么时候能到"、"配送状态"
                
                你无法猜测物流状态，必须通过此工具获取真实的物流跟踪信息。
                调用后会返回物流公司、运单号、配送状态、物流轨迹等信息。
            """,
            "parameters": {
                "type": "object",
                "required": ["order_id"],
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号。必须提供订单号才能查询物流信息"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "call_return_department",
            "description": """
                处理用户的退货退款请求。
                
                当用户表达退货、退款意图时，调用此工具。例如：
                - 用户说"要退货"、"申请退款"、"不想要了"
                - 用户说"这个商品有问题，要退"、"退掉这个订单"
                
                你不能自行处理退货，必须通过此工具提交退货申请。
                调用后会检查退货政策（30天内可退等），并返回处理结果。
            """,
            "parameters": {
                "type": "object",
                "required": ["order_id"],
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "订单号。必须提供订单号才能处理退货"
                    },
                    "reason": {
                        "type": "string",
                        "description": "退货原因。用户说明的退货理由，如'尺码不合适'、'质量问题'等"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transfer_to_human",
            "description": """
                转接人工客服。
                
                当出现以下情况时，调用此工具：
                - 用户明确要求人工客服，如"转人工"、"找真人"、"人工服务"
                - 用户情绪非常激动、愤怒、威胁投诉
                - 问题超出AI能力范围，如法律问题、大额赔偿等
                
                调用此工具后会将用户转接给人工客服处理。
            """,
            "parameters": {
                "type": "object",
                "required": ["reason"],
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "转接原因。说明为什么需要转人工，如'用户要求'、'情绪激动'、'问题复杂'等"
                    }
                }
            }
        }
    }
]


# ===== Return Planner Agent 的工具（退货部门内部）====
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
            "description": "处理退款（调用支付宝/支付API）",
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


# ===== Order Agent 的工具（订单部门内部）====
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
