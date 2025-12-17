import asyncio
import json
import re
import uuid
from typing import AsyncGenerator, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents.qa import QAAgent
from ..agents.router import RouterAgent
from ..agents.return_planner import ReturnPlannerAgent
from ..agents import qa as qa_module, router as router_module  # 旧代码兼容
from ..integrations import get_alipay_client, get_order_api
from ..core.auth import User, get_current_user
from ..db.repo import Repository, get_repo
from ..llm import kimi
from ..rag import bailian
from ..workflows.return_flow import ReturnFlow

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: Optional[str] = None
    audio_url: Optional[str] = None
    is_voice: bool = False


# ===== 辅助函数 =====

def extract_order_id(text: str) -> Optional[str]:
    """
    从用户消息中提取订单号
    支持格式：ORD20250101001、订单号ORD20250101001等
    """
    # 匹配 ORD + 数字
    pattern = r'ORD\d{11,}'
    match = re.search(pattern, text.upper())
    if match:
        return match.group(0)
    return None


def chunk_text(text: str, chunk_size: int = 80):
    for i in range(0, len(text), chunk_size):
        yield text[i : i + chunk_size]


async def stream_sse(text: str) -> AsyncGenerator[str, None]:
    for chunk in chunk_text(text):
        yield f"data: {chunk}\n\n"
        await asyncio.sleep(0)


def detect_transfer_reason(message: str) -> Optional[str]:
    text = message.strip()
    if not text:
        return None

    transfer_keywords = [
        "转人工",
        "人工客服",
        "真人客服",
        "转接人工",
        "找人工",
        "找人",
        "真人",
        "人工服务",
    ]
    if any(keyword in text for keyword in transfer_keywords):
        return "用户主动要求转人工"

    negative_keywords = [
        "垃圾",
        "骗子",
        "太差",
        "差劲",
        "失望",
        "生气",
        "愤怒",
        "投诉",
        "差评",
        "举报",
        "告你",
        "维权",
        "无语",
        "糟糕",
        "破公司",
    ]
    exclamations = text.count("!") + text.count("！")
    if exclamations >= 3 or any(keyword in text for keyword in negative_keywords):
        return "用户情绪激动或负面"

    return None


async def stream_text_reply(text: str) -> AsyncGenerator[str, None]:
    for char in text:
        yield f"data: {json.dumps({'content': char}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0)
    yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"


async def stream_skip(reason: str) -> AsyncGenerator[str, None]:
    yield f"data: {json.dumps({'skip': True, 'reason': reason}, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat_endpoint(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    if not payload.message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conversation_id = payload.conversation_id
    if not conversation_id:
        conversation_id = repo.create_conversation(user.user_id)

    repo.add_message(conversation_id, user.user_id, "user", payload.message)
    trace_id = str(uuid.uuid4())

    route = router_module.detect_intent(payload.message)
    repo.log_event(
        trace_id=trace_id,
        event_type="ROUTE_DECISION",
        payload=route,
        conversation_id=conversation_id,
        user_id=user.user_id,
    )

    try:
        if route["intent"] in {"RETURN", "EXCHANGE"}:
            repo.log_event(
                trace_id=trace_id,
                event_type="TOOL_CALL",
                payload={"tool": "ReturnFlow"},
                conversation_id=conversation_id,
                user_id=user.user_id,
            )
            flow = ReturnFlow(repo=repo, rag_client=bailian)
            reply, event_payload = await flow.handle(
                user_id=user.user_id,
                conversation_id=conversation_id,
                user_message=payload.message,
                trace_id=trace_id,
            )
            repo.log_event(
                trace_id=trace_id,
                event_type="TOOL_RESULT",
                payload=event_payload,
                conversation_id=conversation_id,
                user_id=user.user_id,
            )
        elif route["intent"] == "WISMO":
            reply = qa_module.render_wismo_reply()
        elif route["intent"] == "FAQ":
            reply = qa_module.render_faq_reply()
        else:
            reply = qa_module.render_human_handoff(route)
    except Exception as exc:  # broad: ensure trace_id is recorded on failure
        repo.log_event(
            trace_id=trace_id,
            event_type="ERROR",
            payload={"message": str(exc)},
            conversation_id=conversation_id,
            user_id=user.user_id,
        )
        raise

    repo.add_message(conversation_id, user.user_id, "assistant", reply)

    return StreamingResponse(
        stream_sse(reply),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Conversation-Id": conversation_id},
    )


@router.post("/chat/kimi")
async def chat_with_kimi(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    conversation_id = payload.conversation_id
    if not conversation_id:
        conversation_id = repo.create_conversation(user.user_id)

    # 处理语音消息
    if payload.is_voice and payload.audio_url:
        # TODO: 集成语音转文字API（阿里云、讯飞等）
        # 这里先用占位符
        transcript = "\u8bed\u97f3\u8f6c\u5199\u529f\u80fd\u5f85\u63a5\u5165"
        
        # 更新语音消息的转写文本
        messages_list = repo.list_messages(conversation_id, user.user_id)
        if messages_list:
            last_msg = messages_list[-1]
            if last_msg.get("role") == "user" and last_msg.get("audio_url") == payload.audio_url:
                # 更新转写文本
                from ..core.supabase import get_supabase_admin_client
                client = get_supabase_admin_client()
                client.table("messages").update({
                    "transcript": transcript,
                    "content": f"VOICE|{payload.audio_url}|{transcript}"
                }).eq("id", last_msg["id"]).execute()
        
        user_message = transcript
    elif payload.message:
        user_message = payload.message
        # 注意：用户消息已由前端直接入库，这里不再重复入库
    else:
        raise HTTPException(status_code=400, detail="Message or audio_url required")

    history = repo.list_messages(conversation_id, user.user_id)
    messages = [
        {
            "role": "system",
            "content": "\u4f60\u662f\u4e00\u540d\u7535\u5546\u5ba2\u670d\uff0c\u5e2e\u52a9\u7528\u6237\u89e3\u51b3\u8ba2\u5355\u3001\u7269\u6d41\u3001\u9000\u6362\u8d27\u76f8\u5173\u95ee\u9898\u3002\u56de\u7b54\u8981\u7b80\u6d01\u3001\u53cb\u597d\uff0c\u5e76\u7528\u4e2d\u6587\u56de\u590d\u3002",
        }
    ]
    for item in history:
        role = "assistant" if item["role"] == "assistant" else "user"
        # 如果是语音消息，使用转写文本
        content = item.get("transcript") or item["content"]
        if content.startswith("VOICE|"):
            parts = content.split("|")
            content = parts[2] if len(parts) > 2 and parts[2] else "用户发送了语音消息"
        messages.append({"role": role, "content": content})

    # 使用流式响应生成器
    async def generate_kimi_stream():
        full_content = ""
        tool_calls = []
        
        try:
            async for chunk in kimi.chat_completion_stream(messages):
                if chunk["type"] == "content":
                    # 逐块发送内容
                    yield f"data: {json.dumps({'content': chunk['data']}, ensure_ascii=False)}\n\n"
                    full_content += chunk["data"]
                elif chunk["type"] == "tool_calls":
                    tool_calls = chunk["data"]
                elif chunk["type"] == "done":
                    # 流式结束，处理完整内容
                    full_content = chunk["content"]
                    tool_calls = chunk.get("tool_calls", [])
        except Exception as exc:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            return
        
        # 检测是否需要转人工
        transfer_call = None
        for call in tool_calls:
            if call.get("function", {}).get("name") == "transfer_to_human":
                transfer_call = call
                break
        
        if transfer_call:
            # 解析转人工原因
            try:
                args = json.loads(transfer_call["function"]["arguments"])
                reason = args.get("reason", "用户请求")
            except:
                reason = "用户请求"
            
            # 更新 conversation 状态为 pending_agent
            from ..core.supabase import get_supabase_admin_client
            client = get_supabase_admin_client()
            client.table("conversations").update({
                "status": "pending_agent"
            }).eq("id", conversation_id).execute()
            
            # AI 回复转人工话术
            ai_reply = "您好，我正在为您联系人工客服，请稍候~\n我们的客服会尽快为您服务 😊"
            repo.add_message(conversation_id, user.user_id, "assistant", ai_reply)
            
            # 添加系统消息
            system_msg = f"⚠️ AI 检测到转人工请求（原因：{reason}），等待客服接入..."
            repo.add_message(conversation_id, user.user_id, "system", system_msg)
        else:
            # 正常 AI 回复入库
            repo.add_message(conversation_id, user.user_id, "assistant", full_content)
        
        # 发送结束标记
        yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate_kimi_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conversation_id,
        },
    )


# ===== 新版响应式 Agent 系统 =====

@router.post("/chat/agent")
async def chat_with_agent(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    """
    Multi-Agent 系统 - 新架构
    流程：Q&A Agent (前台) → 调用部门工具 (Kimi Function Calling)
    
    注意：用户消息和AI消息都由前端入库，后端不重复入库
    """
    conversation_id = payload.conversation_id
    if not conversation_id:
        conversation_id = repo.create_conversation(user.user_id)

    user_message = payload.message
    if not user_message:
        raise HTTPException(status_code=400, detail="Message required")
    
    # ⚠️ 检查对话是否被人工接管
    from ..core.supabase import get_supabase_admin_client
    client = get_supabase_admin_client()
    conv_response = client.table("conversations").select("status, assigned_agent_id").eq("id", conversation_id).execute()
    
    if conv_response.data and len(conv_response.data) > 0:
        conv_status = conv_response.data[0].get("status")
        if conv_status == "agent":
            # Human agent has taken over; skip AI response
            async def generate_skip_stream():
                yield f"data: {json.dumps({'skip': True, 'reason': 'human_takeover'}, ensure_ascii=False)}\\n\\n"
                yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\\n\\n"

            return StreamingResponse(
                generate_skip_stream(),
                media_type="text/event-stream"
            )
        if conv_status == "pending_agent":
            transfer_reply = "\u5df2\u4e3a\u60a8\u8f6c\u63a5\u4eba\u5de5\u5ba2\u670d\uff0c\u8bf7\u7a0d\u5019\uff5e"
            return StreamingResponse(
                stream_text_reply(transfer_reply),
                media_type="text/event-stream"
            )

    transfer_reason = detect_transfer_reason(user_message)
    if transfer_reason:
        transfer_reply = "\u5df2\u4e3a\u60a8\u8f6c\u63a5\u4eba\u5de5\u5ba2\u670d\uff0c\u8bf7\u7a0d\u5019\uff5e"
        client.table("conversations").update({
            "status": "pending_agent"
        }).eq("id", conversation_id).execute()
        client.table("messages").insert({
            "conversation_id": conversation_id,
            "user_id": user.user_id,
            "role": "system",
            "content": f"TRANSFER_TO_HUMAN: {transfer_reason}"
        }).execute()
        return StreamingResponse(
            stream_text_reply(transfer_reply),
            media_type="text/event-stream"
        )

    # Note: user messages are written by the client

    transfer_reason = detect_transfer_reason(user_message)
    if transfer_reason:
        transfer_reply = "\u5df2\u4e3a\u60a8\u8f6c\u63a5\u4eba\u5de5\u5ba2\u670d\uff0c\u8bf7\u7a0d\u5019\uff5e"
        client.table("conversations").update({
            "status": "pending_agent"
        }).eq("id", conversation_id).execute()
        client.table("messages").insert({
            "conversation_id": conversation_id,
            "user_id": user.user_id,
            "role": "system",
            "content": f"TRANSFER_TO_HUMAN: {transfer_reason}"
        }).execute()
        return StreamingResponse(
            stream_text_reply(transfer_reply),
            media_type="text/event-stream"
        )

    # Note: user messages are written by the client

    qa_agent = QAAgent()
    
    # 获取对话历史
    history = repo.list_messages(conversation_id, user.user_id)
    messages = [
        {"role": item["role"], "content": item["content"]}
        for item in history
    ]
    
    # 流式响应生成器
    async def generate_agent_stream():
        # 在生成器内部重新获取 supabase client
        from ..core.supabase import get_supabase_admin_client
        db_client = get_supabase_admin_client()
        
        try:
            # 调用 Q&A Agent（可能会调用部门工具）
            result = await qa_agent.chat(messages)
            
            assistant_reply = result["message"]
            tool_calls = result.get("tool_calls")
            transfer_reason = None
            
            print(f"[Agent] AI 回复: {assistant_reply[:100]}...")
            print(f"[Agent] 工具调用: {tool_calls}")
            
            # 记录工具调用（如果有）
            if tool_calls:
                for tool_call in tool_calls:
                    tool_name = tool_call["function"]["name"]
                    print(f"[Agent] 调用工具: {tool_name}")
                    repo.log_event(
                        trace_id=str(uuid.uuid4()),
                        event_type="TOOL_CALL",
                        payload={"tool": tool_name, "args": tool_call["function"]["arguments"]},
                        conversation_id=conversation_id,
                        user_id=user.user_id
                    )
                    
                    # 检查是否调用了 transfer_to_human
                    if tool_name == "transfer_to_human":
                        try:
                            args = json.loads(tool_call["function"]["arguments"])
                            transfer_reason = args.get("reason", "\u7528\u6237\u8bf7\u6c42\u8f6c\u4eba\u5de5")
                            print(f"[Agent] ✅ 检测到 transfer_to_human 工具调用，原因: {transfer_reason}")
                        except:
                            transfer_reason = "\u7528\u6237\u8bf7\u6c42\u8f6c\u4eba\u5de5"
            else:
                print(f"[Agent] ⚠️ AI 没有调用任何工具")
            
            # 如果调用了 transfer_to_human，更新对话状态
            if transfer_reason:
                print(f"[Agent] 检测到转人工，原因: {transfer_reason}")
                
                # 更新对话状态为 pending_agent
                db_client.table("conversations").update({
                    "status": "pending_agent"
                }).eq("id", conversation_id).execute()
                
                # 添加系统消息提示需要人工介入
                system_msg = f"TRANSFER_TO_HUMAN: {transfer_reason}"
                db_client.table("messages").insert({
                    "conversation_id": conversation_id,
                    "user_id": user.user_id,
                    "role": "system",
                    "content": system_msg
                }).execute()
                
                print(f"[Agent] 已更新对话状态为 pending_agent")
                
                # 发送转人工标记给前端
                yield f"data: {json.dumps({'transfer_to_human': True, 'reason': transfer_reason}, ensure_ascii=False)}\n\n"
            
            # 流式输出 AI 回复
            for char in assistant_reply:
                yield f"data: {json.dumps({'content': char}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.02)  # 模拟打字效果
            
            # 注意：AI消息由前端入库，这里不再入库
            # repo.add_message(conversation_id, user.user_id, "assistant", assistant_reply)
            
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_message = f"抱歉，系统出了点小问题 😅 错误：{str(e)}"
            yield f"data: {json.dumps({'error': error_message}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        generate_agent_stream(),
        media_type="text/event-stream"
    )
