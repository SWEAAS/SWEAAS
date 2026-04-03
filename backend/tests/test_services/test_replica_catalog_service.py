import asyncio
from datetime import UTC, datetime

from app.services.replica_catalog_service import ReplicaCatalogService


class StubReplica:
    def __init__(self, replica_id: str, replica_name: str, thumbnail_video_url: str = "", model_name: str = "phoenix"):
        self.replica_id = replica_id
        self.replica_name = replica_name
        self.normalized_name = "".join(char for char in replica_name.lower() if char.isalnum())
        self.thumbnail_video_url = thumbnail_video_url
        self.model_name = model_name
        self.poster_image_bytes = b"jpeg"
        self.updated_at = datetime.now(UTC)
        self.last_checked_at = datetime.now(UTC)
        self.is_active = True


class FakeDb:
    async def flush(self):
        return None

    async def refresh(self, _replica):
        return None


def test_summarize_reconciliation_groups_changes(monkeypatch):
    service = ReplicaCatalogService()
    stored = [
        StubReplica("rep-1", "Charlie CTO", "https://cdn/old.mp4", "phoenix-a"),
        StubReplica("rep-2", "Ana Product", "https://cdn/product.mp4", "phoenix-a"),
        StubReplica("rep-3", "Mia Support", "https://cdn/support.mp4", "phoenix-a"),
    ]
    live = [
        {"replica_id": "rep-1", "replica_name": "Charlie Cto", "thumbnail_video_url": "https://cdn/new.mp4", "model_name": "phoenix-b", "raw_payload": {}},
        {"replica_id": "rep-9", "replica_name": "Mia Support", "thumbnail_video_url": "https://cdn/mia.mp4", "model_name": "phoenix-a", "raw_payload": {}},
        {"replica_id": "rep-4", "replica_name": "Nora Design", "thumbnail_video_url": "https://cdn/nora.mp4", "model_name": "phoenix-a", "raw_payload": {}},
    ]

    async def fake_list_stored(_db):
        return stored

    async def fake_fetch_live():
        return live

    def fake_usage_summary(replica_id):
        if replica_id == "rep-3":
            return {
                "organization_count": 2,
                "cto_assignment_count": 1,
                "team_assignment_count": 2,
                "total_assignment_count": 3,
            }
        return {
            "organization_count": 0,
            "cto_assignment_count": 0,
            "team_assignment_count": 0,
            "total_assignment_count": 0,
        }

    monkeypatch.setattr(service, "list_stored_replicas", fake_list_stored)
    monkeypatch.setattr(service, "fetch_live_replicas", fake_fetch_live)
    monkeypatch.setattr(service._onboarding_service, "summarize_replica_usage", fake_usage_summary)

    result = asyncio.run(service.summarize_reconciliation(db=None))

    assert len(result["updates_to_stored_replica"]) == 1
    assert result["updates_to_stored_replica"][0]["database_replica"]["replica_id"] == "rep-1"
    assert "thumbnail_video_url" in result["updates_to_stored_replica"][0]["changed_fields"]
    assert len(result["name_mismatch"]) == 2
    assert result["name_mismatch"][0]["database_replica"]["replica_id"] == "rep-3"
    assert result["name_mismatch"][0]["live_replica"]["replica_id"] == "rep-9"
    assert result["name_mismatch"][0]["impacted_onboarding_usage"]["total_assignment_count"] == 3
    assert len(result["missing_in_database"]) == 1
    assert result["missing_in_database"][0]["live_replica"]["replica_id"] == "rep-4"


def test_warm_check_falls_back_to_get_when_head_not_supported(monkeypatch):
    service = ReplicaCatalogService()

    async def fake_head(_url, _headers):
        return 405, {"detail": "method not allowed"}

    async def fake_get(_url, _headers):
        return 200, {"data": []}

    monkeypatch.setattr("app.services.replica_catalog_service.tavus_head", fake_head)
    monkeypatch.setattr("app.services.replica_catalog_service.tavus_get", fake_get)
    monkeypatch.setattr(service, "_headers", lambda: {"x-api-key": "test-key"})

    result = asyncio.run(service.warm_check())

    assert result["ok"] is True
    assert len(result["attempts"]) == 1
    assert result["attempts"][0]["payload"]["method"] == "GET"
    assert result["attempts"][0]["payload"]["head_status_code"] == 405


def test_replace_with_live_soft_deactivates_old_replica(monkeypatch):
    service = ReplicaCatalogService()
    old_replica = StubReplica("rep-old", "Charlie CTO")

    async def fake_fetch_live():
        return [
            {
                "replica_id": "rep-new",
                "replica_name": "Charlie CTO v2",
                "thumbnail_video_url": "https://cdn/new.mp4",
                "model_name": "phoenix-b",
                "raw_payload": {},
            }
        ]

    async def fake_get_by_id(_db, replica_id):
        if replica_id == "rep-old":
            return old_replica
        return None

    async def fake_upsert(_db, live_replica, existing_replica_id):
        assert existing_replica_id is None
        return StubReplica(
            live_replica["replica_id"],
            live_replica["replica_name"],
            live_replica["thumbnail_video_url"],
            live_replica["model_name"],
        )

    monkeypatch.setattr(service, "fetch_live_replicas", fake_fetch_live)
    monkeypatch.setattr(service, "_get_by_replica_id", fake_get_by_id)
    monkeypatch.setattr(service, "_upsert_live_replica", fake_upsert)

    result = asyncio.run(
        service.apply_action(
            FakeDb(),
            "replace_with_live",
            {"database_replica_id": "rep-old", "live_replica_id": "rep-new"},
        )
    )

    assert result is not None
    assert result.replica_id == "rep-new"
    assert old_replica.is_active is False
