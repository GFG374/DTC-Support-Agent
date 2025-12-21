import asyncio
import json
import re
import uuid
from typing import AsyncGenerator, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents import qa as qa_module, router as router_module
from ..agents.qa import QAAgent
from ..core.auth import User, get_current_user
from ..core.supabase import get_supabase_admin_client
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
    assistant_message_id: Optional[str] = None


def extract_order_id(text: str) -> Optional[str]:
    """从用户消息中提取订单号。"""
    pattern = r"ORD[-_A-Z0-9]{3,}"
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

    # 人工接管时直接跳过 AI 回复（放在消息解析之后以便记录用户发言）

    # 如果已经人工接管，直接跳过 AI 回复
    try:
        client = get_supabase_admin_client()
        conv_status_res = (
            client.table("conversations").select("status").eq("id", conversation_id).execute()
        )
        if conv_status_res.data and conv_status_res.data[0].get("status") == "agent":
            repo.add_message(conversation_id, user.user_id, "user", payload.message)
            return StreamingResponse(
                stream_skip("human_takeover"),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Conversation-Id": conversation_id},
            )
    except Exception:
        # 如果读取状态失败，不阻塞流程，继续后面逻辑
        pass

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
    except Exception as exc:
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

    if payload.is_voice and payload.audio_url:
        transcript = "语音转写功能待接入"

        messages_list = repo.list_messages(conversation_id, user.user_id)
        if messages_list:
            last_msg = messages_list[-1]
            if last_msg.get("role") == "user" and last_msg.get("audio_url") == payload.audio_url:
                from ..core.supabase import get_supabase_admin_client

                client = get_supabase_admin_client()
                client.table("messages").update(
                    {
                        "transcript": transcript,
                        "content": f"VOICE|{payload.audio_url}|{transcript}",
                    }
                ).eq("id", last_msg["id"]).execute()

        user_message = transcript
    elif payload.message:
        user_message = payload.message
    else:
        raise HTTPException(status_code=400, detail="Message or audio_url required")

    # 人工接管时直接跳过 AI 回复，同时仍然记录用户消息
    try:
        client = get_supabase_admin_client()
        conv_status_res = (
            client.table("conversations").select("status").eq("id", conversation_id).execute()
        )
        if conv_status_res.data and conv_status_res.data[0].get("status") == "agent":
            repo.add_message(conversation_id, user.user_id, "user", user_message)
            return StreamingResponse(
                stream_skip("human_takeover"),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Conversation-Id": conversation_id,
                },
            )
    except Exception:
        pass

    history = repo.list_messages(conversation_id, user.user_id)
    messages = [
        {
            "role": "system",
            "content": "你是一名电商客服，帮助用户解决订单、物流、退换货相关问题。回答要简洁、友好，并用中文回复。",
        }
    ]
    for item in history:
        role = "assistant" if item["role"] == "assistant" else "user"
        content = item.get("transcript") or item["content"]
        if content.startswith("VOICE|"):
            parts = content.split("|")
            content = parts[2] if len(parts) > 2 and parts[2] else "用户发送了语音消息"
        messages.append({"role": role, "content": content})

    async def generate_kimi_stream():
        full_content = ""
        tool_calls = []

        try:
            async for chunk in kimi.chat_completion_stream(messages):
                if chunk["type"] == "content":
                    yield f"data: {json.dumps({'content': chunk['data']}, ensure_ascii=False)}\n\n"
                    full_content += chunk["data"]
                elif chunk["type"] == "tool_calls":
                    tool_calls = chunk["data"]
                elif chunk["type"] == "done":
                    full_content = chunk["content"]
                    tool_calls = chunk.get("tool_calls", [])
        except Exception as exc:
            import traceback

            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            return

        transfer_call = None
        for call in tool_calls:
            if call.get("function", {}).get("name") == "transfer_to_human":
                transfer_call = call
                break

        if transfer_call:
            try:
                args = json.loads(transfer_call["function"]["arguments"])
                reason = args.get("reason", "用户请求")
            except Exception:
                reason = "用户请求"

            from ..core.supabase import get_supabase_admin_client

            client = get_supabase_admin_client()
            client.table("conversations").update({"status": "pending_agent"}).eq(
                "id", conversation_id
            ).execute()

            ai_reply = (
                "您好，我正在为您联系人工客服，请稍候~\n"
                "我们的客服会尽快为您服务。"
            )
            repo.add_message(conversation_id, user.user_id, "assistant", ai_reply)

            system_msg = (
                f"⚠️ AI 检测到转人工请求（原因：{reason}），等待客服接入..."
            )
            repo.add_message(conversation_id, user.user_id, "system", system_msg)
        else:
            repo.add_message(conversation_id, user.user_id, "assistant", full_content)

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


@router.post("/chat/agent")
async def chat_with_agent(
    payload: ChatRequest,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    conversation_id = payload.conversation_id
    if not conversation_id:
        conversation_id = repo.create_conversation(user.user_id)

    user_message = payload.message
    if not user_message:
        raise HTTPException(status_code=400, detail="Message required")

    from ..core.supabase import get_supabase_admin_client

    client = get_supabase_admin_client()
    conv_response = (
        client.table("conversations")
        .select("status, assigned_agent_id")
        .eq("id", conversation_id)
        .execute()
    )

    if conv_response.data and len(conv_response.data) > 0:
        conv_status = conv_response.data[0].get("status")
        if conv_status == "agent":
            return StreamingResponse(
                stream_skip("human_takeover"),
                media_type="text/event-stream",
            )

    transfer_reason = detect_transfer_reason(user_message)
    if transfer_reason:
        client.table("conversations").update({"status": "pending_agent"}).eq(
            "id", conversation_id
        ).execute()
        client.table("messages").insert(
            {
                "conversation_id": conversation_id,
                "user_id": user.user_id,
                "role": "system",
                "content": f"TRANSFER_TO_HUMAN: {transfer_reason}",
            }
        ).execute()
        return StreamingResponse(
            stream_skip("transfer_requested"),
            media_type="text/event-stream",
        )

    # 前端已经保存了用户消息，这里不再重复保存
    # 直接获取历史消息
    qa_agent = QAAgent(user_id=user.user_id, repo=repo)

    history = repo.list_messages(conversation_id, user.user_id)
    messages = [{"role": item["role"], "content": item["content"]} for item in history]

    async def generate_agent_stream():
        from ..core.supabase import get_supabase_admin_client

        db_client = get_supabase_admin_client()

        try:
            result = await qa_agent.chat(messages)

            assistant_reply = result["message"]
            tool_calls = result.get("tool_calls")
            tool_data = result.get("tool_data", {})  # 结构化数据
            transfer_reason = None

            print(f"[Agent] AI reply: {assistant_reply[:100]}...")
            print(f"[Agent] tool calls: {tool_calls}")

            if tool_calls:
                for tool_call in tool_calls:
                    tool_name = tool_call["function"]["name"]
                    print(f"[Agent] tool call: {tool_name}")
                    repo.log_event(
                        trace_id=str(uuid.uuid4()),
                        event_type="TOOL_CALL",
                        payload={"tool": tool_name, "args": tool_call["function"]["arguments"]},
                        conversation_id=conversation_id,
                        user_id=user.user_id,
                    )

                    if tool_name == "transfer_to_human":
                        try:
                            args = json.loads(tool_call["function"]["arguments"])
                            transfer_reason = args.get("reason", "用户请求")
                            print(
                                f"[Agent] transfer_to_human detected, reason: {transfer_reason}"
                            )
                        except Exception:
                            transfer_reason = "用户请求"
            else:
                print("[Agent] no tool calls")

            if not transfer_reason and tool_data.get("transfer"):
                transfer_reason = tool_data["transfer"].get("reason") or "退款需要人工处理"

            if transfer_reason:
                print(f"[Agent] transfer to human, reason: {transfer_reason}")

                db_client.table("conversations").update({"status": "pending_agent"}).eq(
                    "id", conversation_id
                ).execute()

                system_msg = f"TRANSFER_TO_HUMAN: {transfer_reason}"
                db_client.table("messages").insert(
                    {
                        "conversation_id": conversation_id,
                        "user_id": user.user_id,
                        "role": "system",
                        "content": system_msg,
                    }
                ).execute()

                print("[Agent] conversation status set to pending_agent")
                if assistant_reply:
                    if "人工" not in assistant_reply:
                        assistant_reply = (
                            f"{assistant_reply}\n\n"
                            f"很抱歉，原因：{transfer_reason}。我将为您联系人工客服，请稍候~"
                        )
                else:
                    assistant_reply = f"很抱歉，原因：{transfer_reason}。我将为您联系人工客服，请稍候~"

            if assistant_reply:
                message_payload = {
                    "conversation_id": conversation_id,
                    "user_id": user.user_id,
                    "role": "assistant",
                    "content": assistant_reply,
                }
                if payload.assistant_message_id:
                    message_payload["id"] = payload.assistant_message_id
                    message_payload["client_message_id"] = payload.assistant_message_id
                if tool_data.get("orders"):
                    message_payload["metadata"] = {"orders": tool_data.get("orders")}
                try:
                    db_client.table("messages").upsert(message_payload).execute()
                except Exception as exc:
                    print(f"[Agent] failed to persist assistant reply: {exc}")

            # 先发送结构化数据（如果有订单数据）
            if tool_data:
                yield f"data: {json.dumps({'tool_data': tool_data}, ensure_ascii=False)}\n\n"

            for char in assistant_reply:
                yield f"data: {json.dumps({'content': char}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.02)

            yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"

        except Exception as exc:
            import traceback

            traceback.print_exc()
            error_message = f"System error: {exc}"
            yield f"data: {json.dumps({'error': error_message}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate_agent_stream(),
        media_type="text/event-stream",
    )
