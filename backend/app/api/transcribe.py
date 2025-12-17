"""
语音转写API
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.auth import get_current_user
from app.core.supabase import get_supabase_admin_client
from app.services.asr import asr_service

router = APIRouter(prefix="/api/transcribe", tags=["transcribe"])


class TranscribeRequest(BaseModel):
    message_id: str
    audio_url: str


class TranscribeResponse(BaseModel):
    success: bool
    transcript: Optional[str] = None
    message: str = ""


@router.post("", response_model=TranscribeResponse)
async def transcribe_audio(
    req: TranscribeRequest,
    user=Depends(get_current_user)
):
    """
    转写语音消息
    
    - 从URL下载音频
    - 调用阿里云ASR转写
    - 更新数据库中的transcript字段
    """
    try:
        # 调用ASR服务
        transcript = await asr_service.transcribe_url(req.audio_url)
        
        if not transcript:
            return TranscribeResponse(
                success=False,
                message="语音转写失败，请检查阿里云ASR配置"
            )
        
        # 更新数据库
        supabase = get_supabase_admin_client()
        result = supabase.table("messages").update({
            "transcript": transcript
        }).eq("id", req.message_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="消息不存在")
        
        return TranscribeResponse(
            success=True,
            transcript=transcript,
            message="转写成功"
        )
        
    except Exception as e:
        print(f"转写API错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
