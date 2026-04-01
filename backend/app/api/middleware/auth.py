"""Supabase JWT authentication middleware and dependency."""

from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)


@lru_cache(maxsize=8)
def _jwks_client(supabase_url: str) -> PyJWKClient:
    """Fetch signing keys from Supabase (ES256 / RS256 after JWT Signing Keys migration)."""
    base = supabase_url.rstrip("/")
    return PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json")


class AuthenticatedUser:
    """Represents a verified Supabase user extracted from a JWT."""

    def __init__(self, uid: str, email: str, role: str = "authenticated"):
        self.uid = uid
        self.email = email
        self.role = role


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    """Verify a Supabase access token via JWKS (ES256 / RS256 from JWT Signing Keys)."""
    try:
        header = jwt.get_unverified_header(token)
        alg = (header.get("alg") or "").upper()
    except jwt.DecodeError as exc:
        raise jwt.InvalidTokenError("Malformed JWT header") from exc

    if alg == "HS256":
        raise jwt.InvalidTokenError(
            "HS256 JWTs are not supported; configure Supabase JWT Signing Keys (ES256)"
        )

    if alg in ("ES256", "RS256"):
        if not settings.supabase_url.strip():
            raise RuntimeError("SUPABASE_URL is required for JWKS verification")
        base = settings.supabase_url.strip().rstrip("/")
        issuer = f"{base}/auth/v1"
        signing_key = _jwks_client(base).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            audience="authenticated",
            issuer=issuer,
        )

    raise jwt.InvalidTokenError(f"Unsupported JWT algorithm: {alg or '(missing)'}")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> AuthenticatedUser:
    """Decode and verify a Supabase JWT, returning the authenticated user.

    When ``AUTH_ENFORCE_JWT`` is false, returns a placeholder dev user (no Supabase session).
    """
    if not settings.auth_enforce_jwt:
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
