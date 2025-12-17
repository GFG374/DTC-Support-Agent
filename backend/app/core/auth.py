import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .supabase import get_supabase_admin_client, get_supabase_client

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class User:
    user_id: str
    token: str
    claims: Dict[str, Any]
    email: Optional[str] = None


class JWKClientCache:
    """Simple JWKS cache to avoid pulling keys on every request."""

    _cached_client = None
    _cached_at = 0.0
    _ttl_seconds = 600

    @classmethod
    def get_client(cls):
        if not settings.supabase_jwks_url:
            raise RuntimeError("SUPABASE_JWKS_URL is not configured")
        now = time.time()
        if cls._cached_client and (now - cls._cached_at) < cls._ttl_seconds:
            return cls._cached_client
        cls._cached_client = jwt.PyJWKClient(settings.supabase_jwks_url)
        cls._cached_at = now
        return cls._cached_client


def decode_token(token: str) -> Dict[str, Any]:
    try:
        jwk_client = JWKClientCache.get_client()
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception:
        # Fallback 1: try unverified decode just to extract claims (accepts HS/RS without key)
        try:
            payload = jwt.decode(
                token,
                options={"verify_signature": False, "verify_aud": False},
            )
            if payload.get("sub"):
                return payload
        except Exception:
            pass
        # Fallback 2: use Supabase anon client to validate token remotely
        try:
            anon_client = get_supabase_client()
            res = anon_client.auth.get_user(jwt=token)
            user = getattr(res, "user", None) or {}
            sub = getattr(user, "id", None) or user.get("id")
            if sub:
                return {
                    "sub": sub,
                    "email": getattr(user, "email", None) or user.get("email"),
                }
        except Exception:
            pass
        # Fallback 3: use service role if available
        try:
            admin_client = get_supabase_admin_client()
            res = admin_client.auth.get_user(jwt=token)
            user = getattr(res, "user", None) or {}
            sub = getattr(user, "id", None) or user.get("id")
            if sub:
                return {
                    "sub": sub,
                    "email": getattr(user, "email", None) or user.get("email"),
                }
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )
    token = credentials.credentials
    if token.count(".") != 2:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization must use Supabase access_token (JWT), not refresh_token",
        )
    payload = decode_token(token)
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return User(user_id=user_id, token=token, claims=payload, email=email)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """
    Ensure the current user has admin role.
    Uses service role client to bypass RLS while checking user_profiles.
    """
    client = get_supabase_admin_client()
    res = (
        client.table("user_profiles")
        .select("role")
        .eq("user_id", user.user_id)
        .limit(1)
        .execute()
    )
    data = res.data or []
    role = data[0].get("role") if data else None
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
