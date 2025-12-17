"""
Router Agent - 智能路由助手
负责意图识别、情绪检测、路由决策
"""
import json
from typing import Dict, List
from ..llm.kimi import chat_completion
from ..core.prompts import ROUTER_AGENT_PROMPT


class RouterAgent:
    """路由智能体 - 分析用户意图并决定处理路径"""
    
    def __init__(self):
        self.system_prompt = ROUTER_AGENT_PROMPT
    
    async def analyze_intent(
        self, 
        user_message: str, 
        conversation_history: List[Dict] = None
    ) -> Dict:
        """
        分析用户意图
        
        Args:
            user_message: 用户当前消息
            conversation_history: 对话历史（可选，用于上下文理解）
        
        Returns:
            {
                "intent": "return_request",  # 意图类型
                "confidence": 0.95,  # 置信度
                "emotion": "neutral",  # 情绪
                "need_human": false,  # 是否需要人工
                "reason": "原因说明"
            }
        """
        # 构建上下文
        context = ""
        if conversation_history:
            # 只取最近3轮对话作为上下文
            recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
            context = "\n".join([
                f"{'用户' if msg['role'] == 'user' else 'AI'}: {msg['content']}"
                for msg in recent_history
            ])
        
        # 构建分析请求
        analysis_prompt = f"""# 对话历史
{context if context else '（无历史对话）'}

# 用户当前消息
{user_message}

请分析用户意图并严格按照 JSON 格式返回结果。"""
        
        # 调用 Kimi API
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": analysis_prompt}
        ]
        
        try:
            response = await chat_completion(messages)
            
            # 解析 JSON 响应
            # Kimi 可能返回包含 ```json 代码块的格式，需要提取
            content = response.strip()
            if "```json" in content:
                # 提取 JSON 部分
                start = content.find("```json") + 7
                end = content.find("```", start)
                content = content[start:end].strip()
            elif "```" in content:
                start = content.find("```") + 3
                end = content.find("```", start)
                content = content[start:end].strip()
            
            result = json.loads(content)
            
            # 验证必需字段
            required_fields = ["intent", "confidence", "emotion", "need_human", "reason"]
            for field in required_fields:
                if field not in result:
                    raise ValueError(f"Missing required field: {field}")
            
            return result
            
        except json.JSONDecodeError as e:
            # JSON 解析失败，返回默认结果
            print(f"[Router] JSON 解析失败: {e}, 原始响应: {response}")
            return {
                "intent": "general_question",
                "confidence": 0.3,
                "emotion": "neutral",
                "need_human": False,
                "reason": "无法解析意图，默认为一般问题"
            }
        except Exception as e:
            print(f"[Router] 意图分析异常: {e}")
            return {
                "intent": "error",
                "confidence": 0.0,
                "emotion": "neutral",
                "need_human": True,
                "reason": f"系统异常: {str(e)}"
            }
    
    def should_route_to_planner(self, intent: str) -> bool:
        """判断是否需要路由到专业规划 Agent"""
        planner_intents = [
            "return_request",  # 退货
            "exchange_request",  # 换货
        ]
        return intent in planner_intents
    
    def should_route_to_human(self, analysis: Dict) -> bool:
        """判断是否需要人工介入"""
        # 1. AI 明确建议人工处理
        if analysis.get("need_human"):
            return True
        
        # 2. 用户情绪激动
        if analysis.get("emotion") in ["angry", "very_frustrated"]:
            return True
        
        # 3. 意图识别置信度过低
        if analysis.get("confidence", 0) < 0.5:
            return True
        
        return False


# 向后兼容：保留旧的函数接口
async def detect_intent(message: str, history: List[Dict] = None) -> Dict[str, object]:
    """
    旧版 API 兼容函数
    返回格式：
    {
        "intent": "RETURN",  # 大写格式
        "confidence": 0.95,
        "should_escalate": false,
        "escalate_reason": ""
    }
    """
    agent = RouterAgent()
    analysis = await agent.analyze_intent(message, history)
    
    # 转换为旧格式
    intent_mapping = {
        "return_request": "RETURN",
        "exchange_request": "EXCHANGE",
        "order_status": "WISMO",
        "product_question": "FAQ",
        "complaint": "HUMAN",
        "general_question": "FAQ",
        "other": "FAQ"
    }
    
    return {
        "intent": intent_mapping.get(analysis["intent"], "FAQ"),
        "confidence": analysis["confidence"],
        "should_escalate": analysis["need_human"],
        "escalate_reason": analysis["reason"] if analysis["need_human"] else "",
        "emotion": analysis["emotion"],  # 新增字段
        "raw_intent": analysis["intent"]  # 原始意图
    }
