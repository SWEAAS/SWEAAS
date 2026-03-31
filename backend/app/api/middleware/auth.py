"""Supabase JWT authentication middleware and dependency."""

from typing import Annotated

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


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> AuthenticatedUser:
    """Decode and verify a Supabase JWT, returning the authenticated user.

    In development mode with no JWT secret configured, this returns a
    placeholder user so the API can be exercised without Supabase.
    """
    if not settings.supabase_jwt_secret:
        return AuthenticatedUser(uid="dev-user", email="dev@sweaas.dev", role="authenticated")

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")

    return AuthenticatedUser(
        uid=payload.get("sub", ""),
        email=payload.get("email", ""),
        role=payload.get("role", "authenticated"),
    )
