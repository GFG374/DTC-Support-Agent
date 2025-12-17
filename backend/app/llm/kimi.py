import httpx
import json
from typing import List, Dict, Optional

from ..core.config import settings

KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions"
KIMI_MODEL = "kimi-k2-turbo-preview"  # 使用最新的 Kimi K2 Turbo 模型

# 定义转人工工具
TRANSFER_TO_AGENT_TOOL = {
    "type": "function",
    "function": {
        "name": "transfer_to_agent",
        "description": "当用户明确要求人工客服，或者AI判断问题超出自己处理能力、需要人工介入时，调用此工具转接人工客服。例如：用户说'转人工'、'找客服'、'要投诉'、'太复杂了'等情况。",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "转人工的原因，例如：用户要求、问题复杂、需要特殊权限、用户情绪激动等"
                }
            },
            "required": ["reason"]
        }
    }
}


class KimiError(Exception):
    pass


class KimiResponse:
    """Kimi API 响应封装"""
    def __init__(self, content: str, tool_calls: Optional[List[Dict]] = None):
        self.content = content
        self.tool_calls = tool_calls or []
    
    @property
    def has_tool_calls(self) -> bool:
        return len(self.tool_calls) > 0
    
    def get_tool_call(self, name: str) -> Optional[Dict]:
        """获取指定名称的工具调用"""
        for call in self.tool_calls:
            if call.get("function", {}).get("name") == name:
                return call
        return None


async def chat_completion(
    messages: List[Dict[str, str]],
    temperature: float = 0.6,  # Kimi 推荐 0.6
    max_tokens: int = 1024,
    enable_tools: bool = True,  # 是否启用工具调用
) -> KimiResponse:
    if not settings.kimi_api_key:
        raise KimiError("Kimi API key is not configured")

    payload = {
        "model": KIMI_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    
    # 添加工具定义
    if enable_tools:
        payload["tools"] = [TRANSFER_TO_AGENT_TOOL]
    
    headers = {
        "Authorization": f"Bearer {settings.kimi_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(KIMI_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    try:
        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content", "")
        tool_calls = message.get("tool_calls", [])
        
        return KimiResponse(content=content, tool_calls=tool_calls)
    except Exception as exc:
        raise KimiError("Invalid response from Kimi API") from exc


async def chat_completion_stream(
    messages: List[Dict[str, str]],
    temperature: float = 0.6,
    max_tokens: int = 1024,
    enable_tools: bool = True,
):
    """流式调用 Kimi API，逐步返回响应内容"""
    if not settings.kimi_api_key:
        raise KimiError("Kimi API key is not configured")

    payload = {
        "model": KIMI_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,  # 启用流式响应
    }
    
    if enable_tools:
        payload["tools"] = [TRANSFER_TO_AGENT_TOOL]
    
    headers = {
        "Authorization": f"Bearer {settings.kimi_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST", KIMI_API_URL, headers=headers, json=payload) as response:
            response.raise_for_status()
            
            full_content = ""
            tool_calls = []
            
            async for line in response.aiter_lines():
                if not line.strip() or line.strip() == "data: [DONE]":
                    continue
                
                if line.startswith("data: "):
                    try:
                        data = line[6:]  # 去掉 "data: " 前缀
                        chunk = json.loads(data) if data.startswith("{") else None
                        if not chunk:
                            continue
                        
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content_chunk = delta.get("content", "")
                        
                        if content_chunk:
                            full_content += content_chunk
                            yield {"type": "content", "data": content_chunk}
                        
                        # 检查工具调用
                        if "tool_calls" in delta:
                            tool_calls = delta["tool_calls"]
                            yield {"type": "tool_calls", "data": tool_calls}
                    
                    except Exception as e:
                        # 跳过解析错误的行
                        continue
            
            # 流式结束，返回完整内容和工具调用
            yield {"type": "done", "content": full_content, "tool_calls": tool_calls}
