"""
Q&A Agent - front desk support.
完全依赖 AI 调用 tool_calls，无任何后备逻辑
"""

import json
from typing import Dict, List, Optional, Any

import httpx

from app.agents.mcp_tools import QA_AGENT_TOOLS
from app.agents.order_agent import OrderAgent
from app.agents.return_planner import ReturnPlannerAgent
from app.db.repo import Repository
from app.core.config import settings
from app.core.prompts import QA_AGENT_PROMPT


class QAAgent:
    """Front desk agent that can call internal tools."""

    def __init__(self, user_id: Optional[str] = None, repo: Optional["Repository"] = None):
        self.api_key = settings.kimi_api_key
        self.api_base = "https://api.moonshot.cn/v1"
        self.user_id = user_id
        self.prompt = QA_AGENT_PROMPT.replace("{{USER_ID}}", user_id or "用户")
        self.return_planner = ReturnPlannerAgent(user_id=user_id, repo=repo)
        self.order_agent = OrderAgent(user_id=user_id)

    async def chat(self, messages: List[Dict[str, str]], max_retries: int = 3) -> Dict:
        """Chat with Kimi and optionally call tools."""
        system_message = {
            "role": "system",
            "content": self.prompt,
        }

        max_messages = 30
        if len(messages) > max_messages:
            messages = messages[-max_messages:]
            print(f"[QA Agent] message count > {max_messages}; trimming to latest {max_messages}")

        print(f"[QA Agent] sending request to Kimi, count={len(messages)}")
        
        # 打印 messages 结构用于调试
        print(f"[QA Agent] Messages structure:")
        for i, msg in enumerate(messages):
            role = msg.get("role", "?")
            content = msg.get("content", "")[:50]
            print(f"  [{i}] {role}: {content}...")

        last_error: Optional[Exception] = None
        response = None
        for attempt in range(max_retries + 1):
            try:
                request_data = {
                    "model": "moonshot-v1-128k",
                    "messages": [system_message] + messages,
                    "tools": QA_AGENT_TOOLS,
                    "tool_choice": "auto",
                    "temperature": 0.3,
                }
                
                print(f"[QA Agent] Tools count: {len(QA_AGENT_TOOLS)}")
                print(f"[QA Agent] Tool names: {[t['function']['name'] for t in QA_AGENT_TOOLS]}")
                
                if messages:
                    last_msg = messages[-1] if messages[-1].get("role") == "user" else None
                    if last_msg:
                        print(f"[QA Agent] Last user message: {last_msg.get('content', '')[:100]}")

                # 创建 httpx 客户端，增加更长的超时时间和禁用 SSL 验证（如果需要）
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(120.0, connect=60.0),
                    verify=settings.kimi_verify_ssl,  # 可通过环境变量 KIMI_VERIFY_SSL=false 禁用
                    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
                ) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=request_data,
                    )

                print(f"[QA Agent] Kimi status {response.status_code}")
                response.raise_for_status()
                break
            except httpx.ConnectError as exc:
                last_error = exc
                if attempt < max_retries:
                    wait_time = 2 ** attempt  # 指数退避：1s, 2s, 4s
                    print(f"[QA Agent] 网络连接失败，{wait_time}秒后重试 {attempt + 1}/{max_retries}: {exc}")
                    import asyncio
                    await asyncio.sleep(wait_time)
                else:
                    print(f"[QA Agent] 网络连接失败，已达最大重试次数: {exc}")
                    raise Exception(f"无法连接到 Kimi API，请检查网络连接: {str(exc)}")
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < max_retries:
                    print(f"[QA Agent] 请求超时，重试 {attempt + 1}/{max_retries}")
                    import asyncio
                    await asyncio.sleep(2)
                else:
                    print(f"[QA Agent] 请求超时，已达最大重试次数")
                    raise Exception(f"Kimi API 请求超时: {str(exc)}")
            except Exception as exc:
                last_error = exc
                if attempt < max_retries:
                    print(f"[QA Agent] 请求失败，重试 {attempt + 1}/{max_retries}: {exc}")
                    import asyncio
                    await asyncio.sleep(1)
                else:
                    print(f"[QA Agent] 请求失败: {exc}")
                    raise last_error

        result = response.json()
        finish_reason = result["choices"][0]["finish_reason"]
        print(f"[QA Agent] Kimi finish_reason={finish_reason}")

        choice = result["choices"][0]
        assistant_message = choice["message"]
        
        # 检查是否有 tool_calls
        tool_calls = assistant_message.get("tool_calls")
        if tool_calls:
            print(f"[QA Agent] ✅ TOOL CALLS: {[t['function']['name'] for t in tool_calls]}")

            tool_results, tool_data = await self._execute_tools(tool_calls)
            final_response = await self._get_final_response(
                messages=messages,
                assistant_message=assistant_message,
                tool_results=tool_results,
            )

            return {
                "message": final_response,
                "tool_calls": tool_calls,
                "tool_results": tool_results,
                "tool_data": tool_data,  # 结构化数据，用于前端卡片展示
                "finish_reason": "stop",
            }
        
        # 没有 tool_calls，直接返回模型回复（不做任何后备处理）
        print(f"[QA Agent] ⚠️ NO TOOL CALLS - model returned direct response")
        print(f"[QA Agent] assistant content: {assistant_message.get('content', '')[:200]}")

        return {
            "message": assistant_message.get("content", ""),
            "tool_calls": None,
            "finish_reason": finish_reason,
        }

    async def _execute_tools(self, tool_calls: List[Dict]) -> tuple[List[Dict], Dict[str, Any]]:
        """Execute tool calls and return tool messages and structured data."""
        results: List[Dict] = []
        tool_data: Dict[str, Any] = {}  # 用于存储结构化数据，前端可以渲染卡片

        for tool_call in tool_calls:
            tool_name = tool_call["function"]["name"]
            tool_args_str = tool_call["function"]["arguments"]
            tool_id = tool_call["id"]
            
            try:
                tool_args = json.loads(tool_args_str) if tool_args_str else {}
            except json.JSONDecodeError:
                tool_args = {}
            
            print(f"[QA Agent] Executing tool: {tool_name}, args: {tool_args}")

            if tool_name == "call_return_department":
                result = await self.return_planner.handle_return_request(
                    order_id=tool_args.get("order_id"),
                    reason=tool_args.get("reason", "user_requested"),
                )
                tool_data["return_result"] = result
            elif tool_name == "call_order_department":
                result = self.order_agent.search_orders(
                    order_id=tool_args.get("order_id"),
                    keyword=tool_args.get("keyword"),
                    list_all=tool_args.get("list_all", True),
                )
                # 保存订单数据用于卡片展示
                tool_data["orders"] = result.get("orders", [])
            elif tool_name == "call_logistics_department":
                result = self.order_agent.get_logistics_info(order_id=tool_args.get("order_id"))
                tool_data["logistics"] = result
            elif tool_name == "transfer_to_human":
                result = {
                    "transferred": True,
                    "reason": tool_args.get("reason", "user_requested"),
                    "message": "Connecting to a human agent.",
                }
                tool_data["transfer"] = result
            else:
                result = {"error": f"Unknown tool: {tool_name}"}
            
            print(f"[QA Agent] Tool {tool_name} result: {str(result)[:200]}...")

            results.append({
                "role": "tool",
                "tool_call_id": tool_id,
                "name": tool_name,
                "content": json.dumps(result, ensure_ascii=False),
            })

        return results, tool_data

    async def _get_final_response(
        self,
        messages: List[Dict],
        assistant_message: Dict,
        tool_results: List[Dict],
    ) -> str:
        """Send tool results back to the model to get a final reply."""
        system_message = {
            "role": "system",
            "content": self.prompt,
        }

        new_messages = [system_message] + messages + [assistant_message] + tool_results
        
        print(f"[QA Agent] Sending tool results back to Kimi, tool count: {len(tool_results)}")

        # 增加重试机制
        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(120.0, connect=60.0),
                    verify=settings.kimi_verify_ssl,
                    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
                ) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "moonshot-v1-128k",
                            "messages": new_messages,
                            "temperature": 0.3,
                        },
                    )

                    response.raise_for_status()
                    result = response.json()
                    return result["choices"][0]["message"]["content"]
                    
            except httpx.ConnectError as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    print(f"[QA Agent] _get_final_response 连接失败，{wait_time}秒后重试 {attempt + 1}/{max_retries}: {exc}")
                    import asyncio
                    await asyncio.sleep(wait_time)
                else:
                    print(f"[QA Agent] _get_final_response 连接失败，已达最大重试次数")
                    raise Exception(f"无法连接到 Kimi API: {str(exc)}")
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    print(f"[QA Agent] _get_final_response 超时，重试 {attempt + 1}/{max_retries}")
                    import asyncio
                    await asyncio.sleep(2)
                else:
                    raise Exception(f"Kimi API 请求超时: {str(exc)}")
            except Exception as exc:
                last_error = exc
                if attempt < max_retries - 1:
                    print(f"[QA Agent] _get_final_response 失败，重试 {attempt + 1}/{max_retries}: {exc}")
                    import asyncio
                    await asyncio.sleep(1)
                else:
                    raise last_error
        
        raise Exception(f"_get_final_response 失败: {str(last_error)}")

