import hashlib

from .config import settings


def hash_invite_code(code: str) -> str:
    """
    Hash invite code with server-side pepper.
    Only hashed values are stored in the database.
    """
    if not settings.invite_code_pepper:
        raise RuntimeError("INVITE_CODE_PEPPER is not configured")
    payload = f"{code}{settings.invite_code_pepper}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
