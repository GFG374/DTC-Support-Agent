from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import User, require_admin
from ..core.supabase import get_supabase_admin_client
from ..db.repo import Repository, get_repo

router = APIRouter(tags=["admin_conversations"])


@router.get("/admin/conversations")
async def admin_list_conversations(user: User = Depends(require_admin)):
    client = get_supabase_admin_client()
    conv_res = (
        client.table("conversations")
        .select("id, user_id, title, created_at, status, assigned_agent_id")  # 添加 status 和 assigned_agent_id
        .order("created_at", desc=True)
        .execute()
    )
    conversations = conv_res.data or []
    if not conversations:
        return {"items": []}

    user_ids = list({c["user_id"] for c in conversations})
    profile_map = {}
    if user_ids:
        prof_res = (
            client.table("user_profiles")
            .select("user_id, display_name, avatar_url, role")
            .in_("user_id", user_ids)
            .execute()
        )
        for p in prof_res.data or []:
            profile_map[p["user_id"]] = p

    # fetch latest message per conversation
    convo_ids = [c["id"] for c in conversations]
    latest_map = {}
    if convo_ids:
        latest_res = (
          client.table("messages")
          .select("conversation_id, content, created_at")
          .in_("conversation_id", convo_ids)
          .order("created_at", desc=True)
          .execute()
        )
        for row in latest_res.data or []:
            cid = row["conversation_id"]
            if cid not in latest_map:
                latest_map[cid] = {"last_content": row["content"], "last_created_at": row["created_at"]}

    for c in conversations:
        profile = profile_map.get(c["user_id"], {})
        c["display_name"] = profile.get("display_name")
        c["avatar_url"] = profile.get("avatar_url")
        c["role"] = profile.get("role")
        latest = latest_map.get(c["id"], {})
        c["last_content"] = latest.get("last_content")
        c["last_created_at"] = latest.get("last_created_at")

    return {"items": conversations}


@router.get("/admin/conversations/{conversation_id}/messages")
async def admin_list_messages(conversation_id: str, user: User = Depends(require_admin)):
    client = get_supabase_admin_client()
    msg_res = (
        client.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    return {"items": msg_res.data or []}


@router.post("/admin/messages")
async def admin_add_message(
    payload: dict,
    user: User = Depends(require_admin),
):
    conversation_id = payload.get("conversation_id")
    content = payload.get("content")
    if not conversation_id or not content:
        raise HTTPException(status_code=400, detail="conversation_id and content required")
    client = get_supabase_admin_client()
    try:
        res = (
            client.table("messages")
            .insert(
                {
                    "conversation_id": conversation_id,
                    "user_id": user.user_id,
                    "role": "agent",
                    "content": content,
                }
            )
            .execute()
        )
        return res.data[0] if res.data else {}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"insert failed: {exc}")


@router.delete("/admin/conversations/{conversation_id}")
async def admin_delete_conversation(conversation_id: str, user: User = Depends(require_admin)):
    """删除会话及其所有消息"""
    client = get_supabase_admin_client()
    try:
        # 先删除该会话的所有消息
        client.table("messages").delete().eq("conversation_id", conversation_id).execute()
        # 再删除会话本身
        client.table("conversations").delete().eq("id", conversation_id).execute()
        return {"success": True, "message": "会话已删除"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"delete failed: {exc}")
