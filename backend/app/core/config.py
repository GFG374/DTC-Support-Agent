from dotenv import load_dotenv
from pydantic import BaseSettings
from pathlib import Path

# Load env from .env; only fall back to .env.example if .env does not exist.
if Path(".env").exists():
    load_dotenv(".env", override=True)
elif Path(".env.example").exists():
    load_dotenv(".env.example", override=True)


class Settings(BaseSettings):
    app_name: str = "DTC Customer Service Agent"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwks_url: str = ""
    supabase_service_role_key: str = ""
    kimi_api_key: str = ""
    bailian_endpoint: str = ""
    bailian_token: str = ""
    aliyun_asr_appkey: str = ""
    aliyun_asr_access_key_id: str = ""
    aliyun_asr_access_key_secret: str = ""
    return_auto_approval_threshold: int = 5000
    invite_code_pepper: str = ""
    invite_default_expires_hours: int = 72
    rate_limit_redeem_per_min: int = 5
    alipay_app_id: str = ""
    alipay_private_key: str = ""
    alipay_public_key: str = ""
    alipay_sandbox: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
