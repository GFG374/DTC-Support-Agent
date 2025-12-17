"""
阿里云语音识别（ASR）服务
使用阿里云智能语音交互服务进行语音转文字
前端已直接录制WAV格式（16kHz, 单声道, 16bit），无需转换
"""
import json
import time
import hmac
import base64
import hashlib
import requests
import uuid
from typing import Optional
from app.core.config import settings


class AliyunASR:
    """阿里云语音识别服务 - 一句话识别"""
    
    def __init__(self):
        self.appkey = settings.aliyun_asr_appkey
        self.access_key_id = settings.aliyun_asr_access_key_id
        self.access_key_secret = settings.aliyun_asr_access_key_secret
        # 一句话识别API
        self.api_url = "https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr"
        
        print("🎤 阿里云ASR服务已初始化")
        if self.appkey:
            print(f"   AppKey: {self.appkey[:8]}...")
    
    def _get_token(self) -> Optional[str]:
        """
        获取阿里云访问令牌
        使用AccessKey换取临时token
        """
        if not all([self.access_key_id, self.access_key_secret]):
            print("❌ AccessKey未配置")
            return None
        
        try:
            url = "https://nls-meta.cn-shanghai.aliyuncs.com/"
            timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            nonce = str(uuid.uuid4())
            
            params = {
                "AccessKeyId": self.access_key_id,
                "Action": "CreateToken",
                "Version": "2019-02-28",
                "Timestamp": timestamp,
                "SignatureMethod": "HMAC-SHA1",
                "SignatureVersion": "1.0",
                "SignatureNonce": nonce,
                "Format": "JSON",
                "RegionId": "cn-shanghai"
            }
            
            sorted_params = sorted(params.items())
            canonicalized = "&".join([f"{k}={requests.utils.quote(str(v), safe='')}" for k, v in sorted_params])
            string_to_sign = f"GET&%2F&{requests.utils.quote(canonicalized, safe='')}"
            
            h = hmac.new(
                (self.access_key_secret + "&").encode('utf-8'),
                string_to_sign.encode('utf-8'),
                hashlib.sha1
            )
            signature = base64.b64encode(h.digest()).decode('utf-8')
            params["Signature"] = signature
            
            print("🔑 正在获取阿里云Token...")
            response = requests.get(url, params=params, timeout=10)
            result = response.json()
            
            if "Token" in result and "Id" in result["Token"]:
                print("✅ Token获取成功")
                return result["Token"]["Id"]
            else:
                print(f"❌ 获取token失败: {result}")
                return None
                
        except Exception as e:
            print(f"❌ 获取阿里云token错误: {str(e)}")
            return None
    
    async def transcribe_url(self, audio_url: str) -> Optional[str]:
        """
        转写语音URL
        
        Args:
            audio_url: 语音文件的公开URL（支持wav格式）
            
        Returns:
            转写文本，失败返回None
        """
        if not all([self.appkey, self.access_key_id, self.access_key_secret]):
            print("❌ 阿里云ASR未配置")
            return "阿里云ASR未配置，请在.env中设置ALIYUN_ASR_APPKEY等参数"
        
        try:
            # 获取token
            token = self._get_token()
            if not token:
                return "获取阿里云Token失败，请检查AccessKey配置"
            
            # 下载音频文件
            print(f"📥 下载音频: {audio_url}")
            audio_response = requests.get(audio_url, timeout=30)
            audio_response.raise_for_status()
            audio_data = audio_response.content
            
            print(f"📊 音频大小: {len(audio_data)} bytes")
            
            # 判断音频格式
            audio_format = "wav"
            if audio_url.endswith(".wav"):
                audio_format = "wav"
            elif audio_url.endswith(".pcm"):
                audio_format = "pcm"
            elif audio_url.endswith(".mp3"):
                audio_format = "mp3"
            else:
                # 默认尝试wav
                audio_format = "wav"
            
            print(f"🎵 音频格式: {audio_format}")
            
            # 构建请求参数
            params = {
                "appkey": self.appkey,
                "format": audio_format,
                "sample_rate": 16000,
                "enable_punctuation_prediction": "true",
                "enable_inverse_text_normalization": "true",
            }
            
            headers = {
                "Content-Type": "application/octet-stream",
                "X-NLS-Token": token,
            }
            
            # 发送识别请求
            print("🎤 调用阿里云ASR API...")
            response = requests.post(
                self.api_url,
                params=params,
                headers=headers,
                data=audio_data,
                timeout=30
            )
            
            print(f"📡 ASR响应状态码: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"📋 ASR完整响应: {result}")
                
                status = result.get("status", 0)
                message = result.get("message", "")
                
                if status == 20000000:  # 成功
                    transcript = result.get("result", "")
                    if transcript and transcript.strip():
                        print(f"✅ 转写成功: {transcript}")
                        return transcript
                    else:
                        return "转写结果为空，可能原因：\n1. 音频中无人声\n2. 说话声音太小\n3. 背景噪音过大"
                else:
                    return f"转写失败: {message} (状态码: {status})"
            else:
                return f"ASR API调用失败: HTTP {response.status_code}"
            
        except requests.exceptions.Timeout:
            return "请求超时，请稍后重试"
        except Exception as e:
            error_msg = f"语音转写异常: {str(e)}"
            print(f"❌ {error_msg}")
            return error_msg


# 全局ASR实例
asr_service = AliyunASR()
