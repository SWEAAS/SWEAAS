"""Supabase JWT authentication middleware and dependency."""

from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    """Represents a verified Supabase user extracted from a JWT."""

    def __init__(self, uid: str, email: str, role: str = "authenticated"):
        self.uid = uid
        self.email = email
        self.role = role


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    """Verify and decode a Supabase access token (HS256, audience authenticated)."""
    if not settings.supabase_jwt_secret.strip():
        raise RuntimeError("decode_supabase_jwt requires SUPABASE_JWT_SECRET")
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        audience="authenticated",
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> AuthenticatedUser:
    """Decode and verify a Supabase JWT, returning the authenticated user.

    When ``AUTH_ENFORCE_JWT`` is false and ``SUPABASE_JWT_SECRET`` is unset,
    returns a placeholder dev user so the API can be exercised without Supabase.
    """
    if not settings.auth_enforce_jwt and not settings.supabase_jwt_secret.strip():
        return AuthenticatedUser(uid="dev-user", email="dev@sweaas.dev", role="authenticated")

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )

    try:
        payload = decode_supabase_jwt(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
        ) from exc

    return AuthenticatedUser(
        uid=payload.get("sub", ""),
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
    )
