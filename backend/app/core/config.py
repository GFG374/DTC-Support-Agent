from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseSettings, Field

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Load env from backend/.env; only fall back to backend/.env.example if backend/.env does not exist.
env_path = BACKEND_ROOT / ".env"
env_example_path = BACKEND_ROOT / ".env.example"
if env_path.exists():
    load_dotenv(env_path, override=True)
elif env_example_path.exists():
    load_dotenv(env_example_path, override=True)


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
    # Support both ALIPAY_PRIVATE_KEY and the older ALIPAY_APP_PRIVATE_KEY used in some .env templates.
    alipay_private_key: str = Field("", env=("ALIPAY_PRIVATE_KEY", "ALIPAY_APP_PRIVATE_KEY"))
    alipay_public_key: str = ""
    # SSL verification toggle (debug-only; keep true in production).
    kimi_verify_ssl: bool = Field(True, env="KIMI_VERIFY_SSL")
    # Alipay SSL verification (use false only for local debugging issues).
    alipay_verify_ssl: bool = Field(True, env="ALIPAY_VERIFY_SSL")
    alipay_sandbox: bool = Field(True, env="ALIPAY_SANDBOX")

    class Config:
        env_file = str(env_path)
        env_file_encoding = "utf-8"


settings = Settings()
