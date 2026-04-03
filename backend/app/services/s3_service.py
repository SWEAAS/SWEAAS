"""AWS S3 integration — onboarding docs, PDF report storage, presigned URLs."""

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_BUCKET_NAME = settings.s3_bucket_name or "sweaas-documents"


class S3Service:
    """Manages S3 storage for onboarding documents and generated PDF reports."""

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import boto3
                self._client = boto3.client("s3")
            except Exception as exc:
                logger.warning("S3 client unavailable: %s", exc)
        return self._client

    async def upload_onboarding_doc(
        self,
        org_id: str,
        project_id: str,
        content: str | bytes,
        content_type: str = "application/pdf",
    ) -> dict[str, Any]:
        """Upload an onboarding context document to S3.

        Key pattern: onboarding/{org_id}/{project_id}/context.pdf
        """
        key = f"onboarding/{org_id}/{project_id}/context.pdf"
        client = self._get_client()
        if client is None:
            logger.info("[dev-mode] Would upload onboarding doc to s3://%s/%s", _BUCKET_NAME, key)
            return {"key": key, "bucket": _BUCKET_NAME, "status": "dev-mode"}

        body = content if isinstance(content, bytes) else content.encode("utf-8")
        client.put_object(
            Bucket=_BUCKET_NAME,
            Key=key,
            Body=body,
            ContentType=content_type,
        )
        logger.info("Uploaded onboarding doc to s3://%s/%s", _BUCKET_NAME, key)
        return {"key": key, "bucket": _BUCKET_NAME, "status": "uploaded"}

    async def get_onboarding_doc(self, project_id: str) -> str:
        """Fetch onboarding context document for a project.

        Searches for the key by project_id. Returns empty string if not found.
        """
        client = self._get_client()
        if client is None:
            return ""

        try:
            prefix = f"onboarding/"
            resp = client.list_objects_v2(Bucket=_BUCKET_NAME, Prefix=prefix, MaxKeys=100)
            for obj in resp.get("Contents", []):
                if project_id in obj["Key"]:
                    result = client.get_object(Bucket=_BUCKET_NAME, Key=obj["Key"])
                    return result["Body"].read().decode("utf-8", errors="replace")
        except Exception as exc:
            logger.debug("Could not fetch onboarding doc for %s: %s", project_id, exc)

        return ""

    async def upload_report(
        self,
        org_id: str,
        project_id: str,
        pdf_bytes: bytes,
        report_type: str = "session",
    ) -> dict[str, Any]:
        """Upload a generated PDF report to S3.

        Key pattern: reports/{org_id}/{project_id}/{date}_{report_type}.pdf
        """
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
        key = f"reports/{org_id}/{project_id}/{date_str}_{report_type}.pdf"
        client = self._get_client()
        if client is None:
            logger.info("[dev-mode] Would upload report to s3://%s/%s", _BUCKET_NAME, key)
            return {"key": key, "bucket": _BUCKET_NAME, "status": "dev-mode"}

        client.put_object(
            Bucket=_BUCKET_NAME,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        logger.info("Uploaded report to s3://%s/%s", _BUCKET_NAME, key)
        return {"key": key, "bucket": _BUCKET_NAME, "status": "uploaded"}

    async def get_report_url(self, key: str, expires_in: int = 3600) -> str:
        """Generate a presigned download URL for a report PDF."""
        client = self._get_client()
        if client is None:
            return f"https://{_BUCKET_NAME}.s3.amazonaws.com/{key}?dev-mode=true"

        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": _BUCKET_NAME, "Key": key},
            ExpiresIn=expires_in,
        )
        return url

    async def list_reports(self, project_id: str) -> list[dict[str, str]]:
        """List all report keys for a project."""
        client = self._get_client()
        if client is None:
            return []

        try:
            prefix = f"reports/"
            resp = client.list_objects_v2(Bucket=_BUCKET_NAME, Prefix=prefix, MaxKeys=200)
            results = []
            for obj in resp.get("Contents", []):
                if project_id in obj["Key"]:
                    results.append({
                        "key": obj["Key"],
                        "last_modified": obj["LastModified"].isoformat(),
                        "size": obj["Size"],
                    })
            return results
        except Exception as exc:
            logger.debug("Could not list reports for %s: %s", project_id, exc)
            return []
