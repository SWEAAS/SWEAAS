"""Small Tavus HTTP client that bypasses local proxy interception."""

from __future__ import annotations

import asyncio
import json
import urllib.error
import urllib.request
from typing import Any


def _request_sync(
    method: str,
    url: str,
    headers: dict[str, str],
    json_body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    data = None
    request_headers = dict(headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(
        url,
        data=data,
        headers=request_headers,
        method=method,
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    try:
        with opener.open(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
            if not payload:
                return response.status, {}
            try:
                return response.status, json.loads(payload)
            except json.JSONDecodeError:
                return response.status, {"detail": payload}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"detail": payload or str(exc)}
        return exc.code, parsed
    except urllib.error.URLError as exc:
        return 0, {"detail": str(exc.reason)}


async def tavus_get(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    return await asyncio.to_thread(_request_sync, "GET", url, headers, None)


async def tavus_head(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    return await asyncio.to_thread(_request_sync, "HEAD", url, headers, None)


async def tavus_post(
    url: str,
    headers: dict[str, str],
    json_body: dict[str, Any],
) -> tuple[int, dict[str, Any]]:
    return await asyncio.to_thread(_request_sync, "POST", url, headers, json_body)
