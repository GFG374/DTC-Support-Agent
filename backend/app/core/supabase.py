from functools import lru_cache

from supabase import Client, create_client

from .config import settings


def _ensure_not_example_placeholder(name: str, value: str) -> None:
    if not value:
        raise RuntimeError(f"{name} is missing in backend/.env")
    if value in {"your_service_role_key_here", "your_anon_key_here"}:
        raise RuntimeError(f"{name} is still the example placeholder; set a real key in backend/.env")
    # Supabase Python client expects JWT-style keys (usually starts with 'eyJ...').
    # If you paste a new-style publishable key here, it will fail with "Invalid API key".
    if value.startswith("sb_publishable_"):
        raise RuntimeError(
            f"{name} looks like a publishable key; backend needs the Supabase 'anon'/'service_role' JWT key from the dashboard API settings."
        )


@lru_cache
def get_supabase_client() -> Client:
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is missing in backend/.env")
    _ensure_not_example_placeholder("SUPABASE_ANON_KEY", settings.supabase_anon_key)
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache
def get_supabase_admin_client() -> Client:
    """
    Admin client uses service_role key to bypass RLS for privileged operations
    such as invite management and role elevation.
    """
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is missing in backend/.env")
    _ensure_not_example_placeholder("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key)
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
