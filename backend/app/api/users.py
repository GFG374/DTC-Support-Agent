"""
用户相关API
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from ..core.supabase import get_supabase_admin_client

router = APIRouter(prefix="/users", tags=["users"])


class EmailRequest(BaseModel):
    email: EmailStr


@router.post("/avatar-by-email")
async def get_avatar_by_email(req: EmailRequest):
    """
    根据邮箱获取用户头像URL - 直接从 user_profiles 表查询
    """
    try:
        print(f"📧 收到头像查询请求: {req.email}")
        supabase = get_supabase_admin_client()
        
        # 直接从 user_profiles 表通过 email 查询
        print(f"🔍 查询 user_profiles 表，email: {req.email}")
        profile_response = supabase.table("user_profiles").select("avatar_url, display_name").eq("email", req.email).execute()
        
        print(f"👤 查询结果: {profile_response.data}")
        
        if profile_response.data and len(profile_response.data) > 0:
            avatar_url = profile_response.data[0].get("avatar_url")
            display_name = profile_response.data[0].get("display_name")
            print(f"✅ 找到用户: {display_name}, 头像: {avatar_url}")
            return {
                "avatar_url": avatar_url,
                "display_name": display_name
            }
        
        print(f"⚠️ user_profiles 表中没有找到 email={req.email} 的记录")
        return {"avatar_url": None}
        
    except Exception as e:
        print(f"❌ 获取用户头像失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"avatar_url": None}
