"""Global JWT enforcement for /api/v1 when AUTH_ENFORCE_JWT is enabled."""

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.api.middleware.auth import decode_supabase_jwt
from app.core.config import get_settings


class AuthEnforcementMiddleware(BaseHTTPMiddleware):
    """Require a valid Supabase Bearer token for protected API routes."""

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        if not settings.auth_enforce_jwt:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        method = request.method

        if path == "/" and method in ("GET", "HEAD"):
            return await call_next(request)

        prefix = settings.api_prefix.rstrip("/")
        if path != prefix and not path.startswith(f"{prefix}/"):
            return await call_next(request)

        if _is_allowlisted_api_route(method, path, prefix):
            return await call_next(request)

        auth_header = request.headers.get("authorization")
        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header."},
            )
        parts = auth_header.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header."},
            )
        token = parts[1].strip()
        try:
            decode_supabase_jwt(token)
        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=401, content={"detail": "Token has expired."})
        except jwt.InvalidTokenError:
            return JSONResponse(status_code=401, content={"detail": "Invalid token."})
        except RuntimeError as exc:
            return JSONResponse(
                status_code=500,
                content={"detail": f"Server misconfiguration: {exc!s}"},
            )

        return await call_next(request)


def _is_allowlisted_api_route(method: str, path: str, api_prefix: str) -> bool:
    """Paths that must stay callable without a user JWT (health, provider webhooks)."""
    normalized = path.rstrip("/") or "/"
    health = f"{api_prefix.rstrip('/')}/health"
    if normalized == health and method in ("GET", "HEAD"):
        return True
    if normalized == f"{api_prefix.rstrip('/')}/budget/webhook" and method == "POST":
        return True
    if normalized == f"{api_prefix.rstrip('/')}/stripe/webhook" and method == "POST":
        return True
    if normalized == f"{api_prefix.rstrip('/')}/feedback/webhooks/intercom" and method == "POST":
        return True
    if normalized == f"{api_prefix.rstrip('/')}/feedback/webhooks/canny" and method == "POST":
        return True
    if normalized == f"{api_prefix.rstrip('/')}/github/webhook" and method == "POST":
        return True
    if normalized == f"{api_prefix.rstrip('/')}/communication/customer-call/public" and method == "POST":
        return True
    if normalized.startswith(f"{api_prefix.rstrip('/')}/communication/replica-posters/") and method in ("GET", "HEAD"):
        return True
    if normalized == f"{api_prefix.rstrip('/')}/onboarding/assess" and method == "POST":
        return True
    return False
