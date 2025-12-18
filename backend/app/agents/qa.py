"""
Q&A Agent - front desk support.
"""

import json
from typing import Dict, List, Optional

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

    async def chat(self, messages: List[Dict[str, str]], max_retries: int = 2) -> Dict:
        """Chat with Kimi and optionally call tools."""
        system_message = {
            "role": "system",
            "content": self.prompt,
        }

        max_messages = 30
        if len(messages) > max_messages:
            messages = messages[-max_messages:]
            print(
                f"[QA Agent] message count > {max_messages}; trimming to latest {max_messages}"
            )

        print(f"[QA Agent] sending request to Kimi, count={len(messages)}")

        last_error: Optional[Exception] = None
        response = None
        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        f"{self.api_base}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "kimi-k2-turbo-preview",
                            "messages": [system_message] + messages,
                            "tools": QA_AGENT_TOOLS,
                            "temperature": 0.7,
                        },
                    )

                print(f"[QA Agent] Kimi status {response.status_code}")
                response.raise_for_status()
                break
            except Exception as exc:
                last_error = exc
                if attempt < max_retries:
                    print(
                        f"[QA Agent] request failed, retry {attempt + 1}/{max_retries}: {exc}"
                    )
                    import asyncio

                    await asyncio.sleep(1)
                else:
                    print(f"[QA Agent] request failed: {exc}")
                    raise last_error

        result = response.json()
        finish_reason = result["choices"][0]["finish_reason"]
        print(f"[QA Agent] Kimi finish_reason={finish_reason}")

        choice = result["choices"][0]
        assistant_message = choice["message"]

        if finish_reason == "tool_calls" and assistant_message.get("tool_calls"):
            tool_calls = assistant_message["tool_calls"]
            print(
                f"[QA Agent] tool calls: {[t['function']['name'] for t in tool_calls]}"
            )

            tool_results = await self._execute_tools(tool_calls)
            final_response = await self._get_final_response(
                messages=messages,
                assistant_message=assistant_message,
                tool_results=tool_results,
            )

            return {
                "message": final_response,
                "tool_calls": tool_calls,
                "tool_results": tool_results,
                "finish_reason": "stop",
            }

        return {
            "message": assistant_message.get("content", ""),
            "tool_calls": None,
            "finish_reason": finish_reason,
        }

    async def _execute_tools(self, tool_calls: List[Dict]) -> List[Dict]:
        """Execute tool calls and return tool messages."""
        results: List[Dict] = []

        for tool_call in tool_calls:
            tool_name = tool_call["function"]["name"]
            tool_args = json.loads(tool_call["function"]["arguments"])
            tool_id = tool_call["id"]

            if tool_name == "call_return_department":
                result = await self.return_planner.handle_return_request(
                    order_id=tool_args["order_id"],
                    reason=tool_args.get("reason", "user_requested"),
                )
            elif tool_name == "call_order_department":
                result = self.order_agent.get_order_details(order_id=tool_args["order_id"])
            elif tool_name == "call_logistics_department":
                result = self.order_agent.get_logistics_info(order_id=tool_args["order_id"])
            elif tool_name == "transfer_to_human":
                result = {
                    "transferred": True,
                    "reason": tool_args.get("reason", "user_requested"),
                    "message": "Connecting to a human agent.",
                }
            else:
                result = {"error": f"Unknown tool: {tool_name}"}

            results.append(
                {
                    "tool_call_id": tool_id,
                    "role": "tool",
                    "name": tool_name,
                    "content": json.dumps(result, ensure_ascii=True),
                }
            )

        return results

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

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "moonshot-v1-8k",
                    "messages": new_messages,
                    "temperature": 0.7,
                },
            )

            response.raise_for_status()
            result = response.json()

        return result["choices"][0]["message"]["content"]
