from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.auth import User, get_current_user
from ..core.supabase import get_supabase_admin_client
from ..db.repo import Repository, get_repo

router = APIRouter(tags=["conversations"])


class AssignConversationRequest(BaseModel):
    """接管对话请求"""
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
    user: User = Depends(get_current_user),
):
    """
    客服接管对话
    将 conversation status 更新为 'agent'，设置 assigned_agent_id
    """
    # 验证用户角色（只有 admin 可以接管）
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can assign conversations")
    
    client = get_supabase_admin_client()
    
    # 检查对话是否存在
    conv_response = client.table("conversations").select("*").eq("id", conversation_id).execute()
    if not conv_response.data or len(conv_response.data) == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    conversation = conv_response.data[0]
    
    # 检查对话状态是否为 pending_agent
    if conversation.get("status") != "pending_agent":
        raise HTTPException(
            status_code=400, 
            detail=f"Conversation is not pending agent (current status: {conversation.get('status')})"
        )
    
    # 更新对话状态
    update_response = client.table("conversations").update({
        "status": "agent",
        "assigned_agent_id": user.user_id
    }).eq("id", conversation_id).execute()
    
    # 获取客服名称
    profile_response = client.table("user_profiles").select("display_name").eq("user_id", user.user_id).execute()
    agent_name = "客服"
    if profile_response.data and len(profile_response.data) > 0:
        agent_name = profile_response.data[0].get("display_name", "客服")
    
    # 添加系统消息：客服已接入
    system_message = f"✅ 客服「{agent_name}」已接入，为您服务"
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
