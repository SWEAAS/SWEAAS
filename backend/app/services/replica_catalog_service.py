"""Replica catalog sync and reconciliation against Tavus."""

from __future__ import annotations

import asyncio
import html
import json
import re
import shutil
import subprocess
from datetime import UTC, datetime
from difflib import SequenceMatcher
from hashlib import sha1, sha256
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser
from app.core.config import get_settings
from app.models.replica import ReplicaProfile
from app.services.onboarding_service import OnboardingService
from app.services.tavus_client import tavus_get, tavus_head

try:
    import sentry_sdk
except ImportError:  # pragma: no cover - optional in local dev/test environments
    sentry_sdk = None

_TAVUS_REPLICAS_URL = "https://tavusapi.com/v2/replicas"
_WARM_CHECK_DELAYS_SECONDS = (0, 3, 5, 7, 20)
_UNSUPPORTED_HEAD_STATUS_CODES = {400, 405, 501}
_MAX_SENTRY_BODY_LENGTH = 600


def _normalize_name(name: str) -> str:
    cleaned = " ".join(name.strip().split())
    return re.sub(r"[^a-z0-9]+", "", cleaned.lower())


def _hash_name(name: str) -> int:
    return int(sha1(name.encode("utf-8")).hexdigest()[:8], 16)


def _get_initials(name: str) -> str:
    parts = [part for part in " ".join(name.strip().split()).split(" ") if part]
    return "".join(part[0] for part in parts[:2]).upper() or "CT"


def _build_poster_svg(replica_name: str) -> str:
    normalized_name = " ".join(replica_name.strip().split())
    escaped_name = html.escape(normalized_name)
    initials = html.escape(_get_initials(normalized_name))
    hue = _hash_name(normalized_name) % 360
    hue_2 = (hue + 28) % 360
    hue_3 = (hue + 68) % 360

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="hsl({hue} 52% 20%)"/>
      <stop offset="0.58" stop-color="hsl({hue_2} 58% 32%)"/>
      <stop offset="1" stop-color="hsl({hue_3} 72% 50%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" rx="42" fill="url(#bg)"/>
  <circle cx="180" cy="170" r="130" fill="rgba(255,255,255,0.12)"/>
  <circle cx="980" cy="700" r="170" fill="rgba(255,255,255,0.12)"/>
  <text x="600" y="400" fill="white" font-size="220" font-weight="700" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif">{initials}</text>
  <text x="600" y="575" fill="white" font-size="64" font-weight="600" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif">{escaped_name}</text>
</svg>
"""


def _truncate_response_body(payload: Any) -> str:
    try:
        serialized = json.dumps(payload, default=str)
    except TypeError:
        serialized = repr(payload)
    if len(serialized) <= _MAX_SENTRY_BODY_LENGTH:
        return serialized
    return f"{serialized[:_MAX_SENTRY_BODY_LENGTH]}…"


def _build_poster_hash(poster_bytes: bytes | None, poster_svg: str) -> str:
    if poster_bytes is not None:
        return sha256(poster_bytes).hexdigest()
    return sha256(poster_svg.encode("utf-8")).hexdigest()


def _extract_still_from_video(thumbnail_video_url: str) -> tuple[bytes, str] | None:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path or not thumbnail_video_url.startswith(("http://", "https://")):
        return None

    try:
        result = subprocess.run(
            [
                ffmpeg_path,
                "-loglevel",
                "error",
                "-ss",
                "00:00:00.3",
                "-i",
                thumbnail_video_url,
                "-frames:v",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "pipe:1",
            ],
            check=True,
            capture_output=True,
            timeout=20,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return None

    if not result.stdout:
        return None
    return result.stdout, "image/jpeg"


class ReplicaCatalogService:
    """Database-backed Tavus replica catalog with admin reconciliation helpers."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._onboarding_service = OnboardingService()

    def _headers(self) -> dict[str, str]:
        if not self._settings.tavus_api_key:
            raise HTTPException(status_code=503, detail="Tavus API key is not configured")
        return {"x-api-key": self._settings.tavus_api_key}

    def _capture_tavus_failure(
        self,
        *,
        message: str,
        endpoint: str,
        status_code: int,
        payload: dict[str, Any],
        attempt: int | None = None,
        method: str | None = None,
    ) -> None:
        if sentry_sdk is None:
            return

        context: dict[str, Any] = {
            "endpoint": endpoint,
            "status_code": status_code,
            "parsed_payload": payload,
            "response_body_preview": _truncate_response_body(payload),
        }
        if attempt is not None:
            context["attempt"] = attempt
        if method is not None:
            context["method"] = method

        with sentry_sdk.push_scope() as scope:
            scope.set_context("tavus_request_failure", context)
            sentry_sdk.capture_message(message, level="error")

    def ensure_admin(self, user: AuthenticatedUser) -> None:
        if user.email == "user@sweaas.dev":
            return
        if user.role.lower() in {"admin", "owner"}:
            return
        raise HTTPException(status_code=403, detail="Admin access required")

    def build_asset_version(self, replica: ReplicaProfile) -> str:
        if replica.poster_image_hash:
            return replica.poster_image_hash[:16]
        fallback_hash = _build_poster_hash(replica.poster_image_bytes, replica.poster_svg)
        return fallback_hash[:16]

    def build_poster_etag(self, replica: ReplicaProfile) -> str:
        if replica.poster_image_hash:
            return f"\"{replica.poster_image_hash}\""
        return f"\"{_build_poster_hash(replica.poster_image_bytes, replica.poster_svg)}\""

    def build_asset_url(self, request: Request, replica: ReplicaProfile) -> str:
        version = self.build_asset_version(replica)
        relative_path = f"{self._settings.api_prefix}/communication/replica-posters/{replica.replica_id}?v={version}"
        cdn_base = self._settings.replica_assets_cdn_base_url.strip().rstrip("/")
        if cdn_base:
            return f"{cdn_base}{relative_path}"
        return str(request.url_for("get_replica_poster", replica_id=replica.replica_id).include_query_params(v=version))

    def build_svg_asset_url(self, request: Request, replica: ReplicaProfile) -> str:
        version = self.build_asset_version(replica)
        return str(
            request.url_for("get_replica_poster_svg", replica_id=replica.replica_id).include_query_params(v=version)
        )

    async def list_stored_replicas(self, db: AsyncSession) -> list[ReplicaProfile]:
        result = await db.execute(
            select(ReplicaProfile).where(ReplicaProfile.is_active.is_(True)).order_by(ReplicaProfile.replica_name.asc())
        )
        return list(result.scalars().all())

    async def warm_check(self) -> dict[str, Any]:
        attempts: list[dict[str, Any]] = []
        for index, delay in enumerate(_WARM_CHECK_DELAYS_SECONDS, start=1):
            if delay:
                await asyncio.sleep(delay)
            status_code, payload = await self._probe_replicas_endpoint()
            success = 200 <= status_code < 300
            attempts.append(
                {
                    "attempt": index,
                    "delay_seconds": delay,
                    "status_code": status_code,
                    "success": success,
                    "payload": payload,
                }
            )
            if success:
                return {"ok": True, "attempts": attempts}

        for attempt in attempts:
            self._capture_tavus_failure(
                message="Tavus warm check failed",
                endpoint=_TAVUS_REPLICAS_URL,
                status_code=attempt["status_code"],
                payload=attempt["payload"],
                attempt=attempt["attempt"],
                method=str(attempt["payload"].get("method", "HEAD")),
            )
        return {"ok": False, "attempts": attempts}

    async def _probe_replicas_endpoint(self) -> tuple[int, dict[str, Any]]:
        head_status, head_payload = await tavus_head(_TAVUS_REPLICAS_URL, self._headers())
        if head_status not in _UNSUPPORTED_HEAD_STATUS_CODES:
            return head_status, {"method": "HEAD", **head_payload}

        get_status, get_payload = await tavus_get(_TAVUS_REPLICAS_URL, self._headers())
        return get_status, {
            "method": "GET",
            "head_status_code": head_status,
            "head_payload": head_payload,
            **get_payload,
        }

    async def sync_live_to_db(self, db: AsyncSession) -> int:
        """Fetch live Tavus replicas and upsert them into ``replica_profiles``.

        Returns the number of live replicas persisted. Used by the first-touch
        path in ``GET /replicas`` when the catalog is empty so a fresh install
        doesn't need an admin to run reconciliation before onboarding works.
        Raises :class:`HTTPException` 502 if the Tavus API itself is down so
        callers can decide between propagating the error or silently returning
        an empty list.
        """
        live = await self.fetch_live_replicas()
        for entry in live:
            await self._upsert_live_replica(db, entry, None)
        if live:
            await db.commit()
        return len(live)

    async def fetch_live_replicas(self) -> list[dict[str, Any]]:
        status_code, payload = await tavus_get(_TAVUS_REPLICAS_URL, self._headers())
        if status_code != 200:
            self._capture_tavus_failure(
                message="Tavus replica fetch failed",
                endpoint=_TAVUS_REPLICAS_URL,
                status_code=status_code,
                payload=payload,
                method="GET",
            )
            raise HTTPException(status_code=502, detail="Failed to fetch Tavus replicas")

        raw = payload.get("data", [])
        live_replicas: list[dict[str, Any]] = []
        for replica in raw:
            replica_id = replica.get("replica_id")
            if replica.get("status") != "completed" or not replica_id:
                continue
            live_replicas.append(
                {
                    "replica_id": replica_id,
                    "replica_name": replica.get("replica_name", ""),
                    "thumbnail_video_url": replica.get("thumbnail_video_url", ""),
                    "model_name": replica.get("model_name", ""),
                    "raw_payload": replica,
                }
            )
        return live_replicas

    async def summarize_reconciliation(self, db: AsyncSession) -> dict[str, list[dict[str, Any]]]:
        stored = await self.list_stored_replicas(db)
        live = await self.fetch_live_replicas()

        stored_by_id = {replica.replica_id: replica for replica in stored}
        live_by_id = {replica["replica_id"]: replica for replica in live}
        stored_only = [replica for replica in stored if replica.replica_id not in live_by_id]
        live_only = [replica for replica in live if replica["replica_id"] not in stored_by_id]

        name_mismatches: list[dict[str, Any]] = []
        consumed_live_ids: set[str] = set()
        remaining_stored_only: list[ReplicaProfile] = []
        for stored_replica in stored_only:
            match = self._find_name_mismatch_match(stored_replica, live_only, consumed_live_ids)
            if match is None:
                remaining_stored_only.append(stored_replica)
                continue
            consumed_live_ids.add(match["replica_id"])
            name_mismatches.append(
                {
                    "reason": "name_mismatch",
                    "database_replica": self._serialize_stored_replica(stored_replica),
                    "live_replica": self._serialize_live_replica(match),
                    "impacted_onboarding_usage": self._build_usage_summary(stored_replica.replica_id),
                    "actions": ["replace_with_live", "delete_database_replica", "dismiss"],
                }
            )

        for stored_replica in remaining_stored_only:
            name_mismatches.append(
                {
                    "reason": "name_mismatch",
                    "database_replica": self._serialize_stored_replica(stored_replica),
                    "live_replica": None,
                    "impacted_onboarding_usage": self._build_usage_summary(stored_replica.replica_id),
                    "actions": ["delete_database_replica", "dismiss"],
                }
            )

        missing_in_database = [
            {
                "reason": "missing_in_database",
                "live_replica": self._serialize_live_replica(replica),
                "actions": ["append_new_replica", "dismiss"],
            }
            for replica in live_only
            if replica["replica_id"] not in consumed_live_ids
        ]

        updates_to_stored_replica = []
        for replica_id, stored_replica in stored_by_id.items():
            live_replica = live_by_id.get(replica_id)
            if live_replica is None:
                continue
            changed_fields = self._get_changed_fields(stored_replica, live_replica)
            if not changed_fields:
                continue
            updates_to_stored_replica.append(
                {
                    "reason": "updates_to_stored_replica",
                    "changed_fields": changed_fields,
                    "database_replica": self._serialize_stored_replica(stored_replica),
                    "live_replica": self._serialize_live_replica(live_replica),
                    "impacted_onboarding_usage": self._build_usage_summary(stored_replica.replica_id),
                    "actions": ["update_stored_replica", "dismiss"],
                }
            )

        return {
            "name_mismatch": name_mismatches,
            "missing_in_database": missing_in_database,
            "updates_to_stored_replica": updates_to_stored_replica,
        }

    def _find_name_mismatch_match(
        self,
        stored_replica: ReplicaProfile,
        live_only: list[dict[str, Any]],
        consumed_live_ids: set[str],
    ) -> dict[str, Any] | None:
        best_match = None
        best_score = 0.0
        for candidate in live_only:
            if candidate["replica_id"] in consumed_live_ids:
                continue
            score = SequenceMatcher(
                None,
                stored_replica.normalized_name,
                _normalize_name(candidate["replica_name"]),
            ).ratio()
            if score >= 0.84 and score > best_score:
                best_match = candidate
                best_score = score
        return best_match

    def _get_changed_fields(self, stored_replica: ReplicaProfile, live_replica: dict[str, Any]) -> list[str]:
        changed = []
        if stored_replica.replica_name != live_replica["replica_name"]:
            changed.append("replica_name")
        if (stored_replica.thumbnail_video_url or "") != (live_replica["thumbnail_video_url"] or ""):
            changed.append("thumbnail_video_url")
        if (stored_replica.model_name or "") != (live_replica["model_name"] or ""):
            changed.append("model_name")
        if stored_replica.poster_image_bytes is None:
            changed.append("poster_image")
        return changed

    def _serialize_live_replica(self, live_replica: dict[str, Any]) -> dict[str, Any]:
        return {
            "replica_id": live_replica["replica_id"],
            "replica_name": live_replica["replica_name"],
            "thumbnail_video_url": live_replica["thumbnail_video_url"],
            "model_name": live_replica["model_name"],
        }

    def _serialize_stored_replica(self, stored_replica: ReplicaProfile) -> dict[str, Any]:
        return {
            "replica_id": stored_replica.replica_id,
            "replica_name": stored_replica.replica_name,
            "thumbnail_video_url": stored_replica.thumbnail_video_url,
            "model_name": stored_replica.model_name,
            "updated_at": stored_replica.updated_at.isoformat() if stored_replica.updated_at else None,
        }

    def _build_usage_summary(self, replica_id: str | None) -> dict[str, int] | None:
        if not replica_id:
            return None
        return self._onboarding_service.summarize_replica_usage(replica_id)

    async def apply_action(self, db: AsyncSession, action: str, payload: dict[str, Any]) -> ReplicaProfile | None:
        live = await self.fetch_live_replicas()
        live_by_id = {replica["replica_id"]: replica for replica in live}

        if action == "append_new_replica":
            replica_id = self._require_payload_id(payload.get("live_replica_id"), "live_replica_id")
            return await self._upsert_live_replica(db, self._require_live_replica(live_by_id, replica_id), None)

        if action == "update_stored_replica":
            replica_id = self._require_payload_id(payload.get("live_replica_id"), "live_replica_id")
            return await self._upsert_live_replica(
                db,
                self._require_live_replica(live_by_id, replica_id),
                replica_id,
            )

        if action == "replace_with_live":
            old_replica_id = self._require_payload_id(
                payload.get("database_replica_id"),
                "database_replica_id",
            )
            new_replica_id = self._require_payload_id(payload.get("live_replica_id"), "live_replica_id")
            existing = await self._get_by_replica_id(db, old_replica_id)
            if existing is not None:
                existing.is_active = False
                existing.last_checked_at = datetime.now(UTC)
                await db.flush()
            return await self._upsert_live_replica(
                db,
                self._require_live_replica(live_by_id, new_replica_id),
                None,
            )

        if action == "delete_database_replica":
            database_replica_id = self._require_payload_id(
                payload.get("database_replica_id"),
                "database_replica_id",
            )
            existing = await self._get_by_replica_id(db, database_replica_id)
            if existing is not None:
                existing.is_active = False
                existing.last_checked_at = datetime.now(UTC)
                await db.flush()
            return None

        if action == "dismiss":
            return None

        raise HTTPException(status_code=400, detail="Unsupported reconciliation action")

    async def _get_by_replica_id(self, db: AsyncSession, replica_id: str) -> ReplicaProfile | None:
        result = await db.execute(select(ReplicaProfile).where(ReplicaProfile.replica_id == replica_id))
        return result.scalar_one_or_none()

    def _require_live_replica(
        self,
        live_by_id: dict[str, dict[str, Any]],
        replica_id: str | None,
    ) -> dict[str, Any]:
        if not replica_id or replica_id not in live_by_id:
            raise HTTPException(status_code=404, detail="Live Tavus replica not found")
        return live_by_id[replica_id]

    def _require_payload_id(self, value: Any, field_name: str) -> str:
        if not isinstance(value, str) or not value:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field_name}")
        return value

    async def _upsert_live_replica(
        self,
        db: AsyncSession,
        live_replica: dict[str, Any],
        existing_replica_id: str | None,
    ) -> ReplicaProfile:
        replica = None
        if existing_replica_id is not None:
            replica = await self._get_by_replica_id(db, existing_replica_id)
        if replica is None:
            replica = await self._get_by_replica_id(db, live_replica["replica_id"])
        if replica is None:
            replica = ReplicaProfile(
                replica_id=live_replica["replica_id"],
                replica_name=live_replica["replica_name"],
                normalized_name=_normalize_name(live_replica["replica_name"]),
                poster_image_hash="",
                poster_svg=_build_poster_svg(live_replica["replica_name"]),
                raw_payload=live_replica["raw_payload"],
            )
            db.add(replica)

        extracted = await asyncio.to_thread(_extract_still_from_video, live_replica["thumbnail_video_url"])
        poster_image_bytes = extracted[0] if extracted else None
        poster_image_content_type = extracted[1] if extracted else None

        replica.replica_id = live_replica["replica_id"]
        replica.replica_name = live_replica["replica_name"]
        replica.normalized_name = _normalize_name(live_replica["replica_name"])
        replica.thumbnail_video_url = live_replica["thumbnail_video_url"]
        replica.model_name = live_replica["model_name"]
        replica.poster_svg = _build_poster_svg(live_replica["replica_name"])
        replica.raw_payload = live_replica["raw_payload"]
        replica.last_seen_at = datetime.now(UTC)
        replica.last_checked_at = datetime.now(UTC)
        replica.is_active = True
        if poster_image_bytes is not None:
            replica.poster_image_bytes = poster_image_bytes
            replica.poster_image_content_type = poster_image_content_type
        replica.poster_image_hash = _build_poster_hash(replica.poster_image_bytes, replica.poster_svg)

        await db.flush()
        await db.refresh(replica)
        return replica
