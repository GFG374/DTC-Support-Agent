"""
Q&A Agent - 前台客服
负责与用户对话，调用其他部门处理业务
"""

import httpx
from typing import List, Dict, Optional
import json
from app.core.config import settings
from app.core.prompts import QA_AGENT_PROMPT
from app.agents.mcp_tools import QA_AGENT_TOOLS
from app.agents.return_planner import ReturnPlannerAgent
from app.agents.order_agent import OrderAgent


class QAAgent:
    """
    Q&A Agent - 前台接待员
    
    职责：
    1. 与用户友好对话
    2. 简单问题直接回答
    3. 复杂业务调用部门工具
    """
    
    def __init__(self):
        self.api_key = settings.kimi_api_key
        self.api_base = "https://api.moonshot.cn/v1"
        
        # 初始化各部门
        self.return_planner = ReturnPlannerAgent()
        self.order_agent = OrderAgent()
    
    async def chat(self, messages: List[Dict[str, str]]) -> Dict:
        """
        与用户对话
        
        Args:
            messages: 对话历史 [{"role": "user", "content": "..."}]
            
        Returns:
            {
                "message": "回复内容",
                "tool_calls": [...],  # 如果有工具调用
                "finish_reason": "stop" or "tool_calls"
            }
        """
        # 构建系统 Prompt
        system_message = {
            "role": "system",
            "content": QA_AGENT_PROMPT
        }
        
        # 限制消息历史长度（防止 token 超限）
        # 只保留最近 20 条消息（10轮对话）
        MAX_MESSAGES = 20
        if len(messages) > MAX_MESSAGES:
            print(f"[QA Agent] 消息历史过长({len(messages)}条)，截断至最近{MAX_MESSAGES}条")
            messages = messages[-MAX_MESSAGES:]
        
        print(f"[QA Agent] 发送请求到 Kimi, 消息数: {len(messages)}")
        
        # 调用 Kimi API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "kimi-k2-turbo-preview",
                    "messages": [system_message] + messages,
                    "tools": QA_AGENT_TOOLS,
                    "temperature": 0.7
                }
            )
            
            print(f"[QA Agent] Kimi 响应状态: {response.status_code}")
            response.raise_for_status()
            result = response.json()
            print(f"[QA Agent] Kimi 响应: finish_reason={result['choices'][0]['finish_reason']}")
        
        # 解析响应
        choice = result["choices"][0]
        finish_reason = choice["finish_reason"]
        assistant_message = choice["message"]
        
        # 如果 AI 想调用工具
        if finish_reason == "tool_calls" and assistant_message.get("tool_calls"):
            tool_calls = assistant_message["tool_calls"]
            print(f"[QA Agent] AI 要调用工具: {[t['function']['name'] for t in tool_calls]}")
            
            # 执行工具调用
            tool_results = await self._execute_tools(tool_calls)
            
            # 将工具结果返回给 AI，让 AI 生成最终回复
            final_response = await self._get_final_response(
                messages=messages,
                assistant_message=assistant_message,
                tool_results=tool_results
            )
            
            return {
                "message": final_response,
                "tool_calls": tool_calls,
                "tool_results": tool_results,
                "finish_reason": "stop"
            }
        
        # 如果 AI 直接回复（不需要工具）
        return {
            "message": assistant_message.get("content", ""),
            "tool_calls": None,
            "finish_reason": finish_reason
        }
    
    async def _execute_tools(self, tool_calls: List[Dict]) -> List[Dict]:
        """
        执行工具调用（呼叫各部门）
        
        Args:
            tool_calls: Kimi 返回的工具调用列表
            
        Returns:
            工具执行结果列表
        """
        results = []
        
        for tool_call in tool_calls:
            tool_name = tool_call["function"]["name"]
            tool_args = json.loads(tool_call["function"]["arguments"])
            tool_id = tool_call["id"]
            
            # 路由到对应部门
            if tool_name == "call_return_department":
                result = self.return_planner.handle_return_request(
                    order_id=tool_args["order_id"],
                    reason=tool_args.get("reason", "用户申请退货")
                )
            
            elif tool_name == "call_order_department":
                result = self.order_agent.get_order_details(
                    order_id=tool_args["order_id"]
                )
            
            elif tool_name == "call_logistics_department":
                result = self.order_agent.get_logistics_info(
                    order_id=tool_args["order_id"]
                )
            
            elif tool_name == "transfer_to_human":
                result = {
                    "transferred": True,
                    "reason": tool_args["reason"],
                    "message": "正在为您转接人工客服，请稍候..."
                }
            
            else:
                result = {"error": f"未知工具：{tool_name}"}
            
            results.append({
                "tool_call_id": tool_id,
                "role": "tool",
                "name": tool_name,
                "content": json.dumps(result, ensure_ascii=False)
            })
        
        return results
    
    async def _get_final_response(
        self,
        messages: List[Dict],
        assistant_message: Dict,
        tool_results: List[Dict]
    ) -> str:
        """
        获取最终回复（将工具结果给 AI，让 AI 生成友好的回复）
        
        Args:
            messages: 原始对话历史
            assistant_message: AI 的工具调用消息
            tool_results: 工具执行结果
            
        Returns:
            AI 生成的最终回复
        """
        # 构建新的对话历史
        system_message = {
            "role": "system",
            "content": QA_AGENT_PROMPT
        }
        
        new_messages = [system_message] + messages + [assistant_message] + tool_results
        
        # 再次调用 Kimi
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "moonshot-v1-8k",
                    "messages": new_messages,
                    "temperature": 0.7
                }
            )
            
            response.raise_for_status()
            result = response.json()
        
        return result["choices"][0]["message"]["content"]
