from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..core.auth import User, get_current_user, require_admin
from ..core.supabase import get_supabase_admin_client
from ..db.repo import Repository, get_repo

router = APIRouter(tags=["conversations"])


class AssignConversationRequest(BaseModel):
    """接管对话请求"""
    pass


class ReleaseConversationRequest(BaseModel):
    """解除接管请求"""
    pass


@router.get("/conversations")
async def list_conversations(
    user: User = Depends(get_current_user), repo: Repository = Depends(get_repo)
):
    return {"items": repo.list_conversations(user.user_id)}


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(
    conversation_id: str,
    user: User = Depends(get_current_user),
    repo: Repository = Depends(get_repo),
):
    messages = repo.list_messages(conversation_id, user.user_id)
    if not messages and conversation_id not in {
        c["id"] for c in repo.list_conversations(user.user_id)
    }:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"items": messages}


@router.post("/conversations/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: str,
    request: AssignConversationRequest,
    user: User = Depends(require_admin),
):
    """
    人工接管对话：把 conversations.status 更新为 agent，并写入 assigned_agent_id。
    """
    client = get_supabase_admin_client()

    conv_response = client.table("conversations").select("*").eq("id", conversation_id).execute()
    if not conv_response.data or len(conv_response.data) == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = conv_response.data[0]

    # 更新会话状态为人工接管
    client.table("conversations").update({
        "status": "agent",
        "assigned_agent_id": user.user_id
    }).eq("id", conversation_id).execute()

    # 获取客服昵称
    profile_response = client.table("user_profiles").select("display_name").eq("user_id", user.user_id).execute()
    agent_name = "客服"
    if profile_response.data and len(profile_response.data) > 0:
        agent_name = profile_response.data[0].get("display_name", "客服")

    # 推送系统消息，提示客服已接入
    system_message = f"客服「{agent_name}」已接入，为您服务"
    customer_id = conversation.get("user_id")

    client.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": customer_id,
        "role": "system",
        "content": system_message
    }).execute()

    return {
        "ok": True,
        "conversation_id": conversation_id,
        "assigned_agent_id": user.user_id,
        "agent_name": agent_name,
        "status": "agent"
    }


@router.post("/conversations/{conversation_id}/release")
async def release_conversation(
    conversation_id: str,
    request: ReleaseConversationRequest,
    user: User = Depends(require_admin),
):
    """
    客服解除接管对话：
    conversation status 从 'agent' 更新为 'ai'，AI 恢复工作
    """
    # 验证用户角色（仅 admin 可操作）
    client = get_supabase_admin_client()

    # 检查对话是否存在
    conv_response = client.table("conversations").select("*").eq("id", conversation_id).execute()
    if not conv_response.data or len(conv_response.data) == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = conv_response.data[0]

    # 检查是否是当前客服接管的对话
    if conversation.get("assigned_agent_id") != user.user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only release conversations assigned to you"
        )

    # 更新对话状态为 AI 接管
    client.table("conversations").update({
        "status": "ai",
        "assigned_agent_id": None
    }).eq("id", conversation_id).execute()

    # 获取客服名称
    profile_response = client.table("user_profiles").select("display_name").eq("user_id", user.user_id).execute()
    agent_name = "客服"
    if profile_response.data and len(profile_response.data) > 0:
        agent_name = profile_response.data[0].get("display_name", "客服")

    # 添加系统消息：AI 恢复服务
    system_message = f"客服「{agent_name}」已解除接管，AI 恢复为您服务"
    customer_id = conversation.get("user_id")

    client.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": customer_id,
        "role": "system",
        "content": system_message
    }).execute()

    return {
        "ok": True,
        "conversation_id": conversation_id,
        "status": "ai",
        "message": "AI has resumed handling this conversation"
    }


@router.get("/conversations/{conversation_id}/status")
async def get_conversation_status(
    conversation_id: str,
    user: User = Depends(get_current_user),
):
    """
    获取对话状态（用于检查是否被人工接管）。
    """
    client = get_supabase_admin_client()

    conv_response = client.table("conversations").select("status, assigned_agent_id").eq("id", conversation_id).execute()
    if not conv_response.data or len(conv_response.data) == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = conv_response.data[0]

    return {
        "conversation_id": conversation_id,
        "status": conversation.get("status", "ai"),
        "assigned_agent_id": conversation.get("assigned_agent_id"),
        "is_human_takeover": conversation.get("status") == "agent"
    }
