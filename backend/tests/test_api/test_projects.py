"""Project endpoint tests."""

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.main import app
from app.core.dependencies import get_github_service, get_greptile_service, get_sentry_service
from app.core.database import get_db


class FakeGitHubService:
    async def create_repository(self, repo_name, private=True):
        return {"html_url": f"https://github.com/SWEAAS/{repo_name}"}
    async def add_collaborator(self, repo_name, username, permission="push"):
        return {"status": "added"}


class FakeGreptileService:
    async def index_repository(self, repo_name):
        return {"status": "indexing"}


class FakeSentryService:
    async def create_project(self, name, slug=None, platform="python"):
        return {"slug": slug or "test", "id": "123"}
    async def get_client_dsn(self, project_slug):
        return "https://test@sentry.io/123"
    async def link_repository(self, repo_name):
        return {"status": "linked"}


class FakeProject:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


@pytest.fixture
def mock_db():
    session = AsyncMock()
    # _resolve_org_id: select User.organization_id where supabase_uid == "dev-user"
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = "00000000-0000-0000-0000-000000000001"
    session.execute.return_value = result_mock
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    
    async def fake_get_db():
        yield session
    
    return fake_get_db, session


@pytest.fixture
def project_client(client, mock_db):
    fake_get_db, session = mock_db
    app.dependency_overrides[get_db] = fake_get_db
    app.dependency_overrides[get_github_service] = lambda: FakeGitHubService()
    app.dependency_overrides[get_greptile_service] = lambda: FakeGreptileService()
    app.dependency_overrides[get_sentry_service] = lambda: FakeSentryService()
    yield client, session
    app.dependency_overrides.clear()


def test_create_project(project_client):
    c, session = project_client
    # After _resolve_org_id, the next execute calls are for creating the project
    # The route does db.add(project) then db.flush() — no further selects needed for create
    resp = c.post(
        "/api/v1/projects",
        json={"name": "My Test Project", "description": "A test", "github_username": "testuser"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Test Project"
    assert data["slug"] == "my-test-project"
    assert data["status"] == "active"
    assert "github_repo_url" in data


def test_create_project_minimal(project_client):
    c, _ = project_client
    resp = c.post("/api/v1/projects", json={"name": "Min"})
    assert resp.status_code == 201


def test_create_project_missing_name(project_client):
    c, _ = project_client
    resp = c.post("/api/v1/projects", json={})
    assert resp.status_code == 422


def test_list_projects_empty(project_client):
    c, session = project_client
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = "00000000-0000-0000-0000-000000000001"
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = []
    
    # First call is _resolve_org_id, second is the list query
    call_count = [0]
    original_execute = session.execute
    
    async def multi_execute(stmt):
        call_count[0] += 1
        if call_count[0] <= 1:
            mock = MagicMock()
            mock.scalar_one_or_none.return_value = "00000000-0000-0000-0000-000000000001"
            return mock
        else:
            mock = MagicMock()
            mock.scalars.return_value = scalars_mock
            return mock
    
    session.execute = multi_execute
    resp = c.get("/api/v1/projects")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_project_not_found(project_client):
    c, session = project_client
    call_count = [0]
    
    async def multi_execute(stmt):
        call_count[0] += 1
        if call_count[0] <= 1:
            mock = MagicMock()
            mock.scalar_one_or_none.return_value = "00000000-0000-0000-0000-000000000001"
            return mock
        else:
            mock = MagicMock()
            mock.scalar_one_or_none.return_value = None
            return mock
    
    session.execute = multi_execute
    resp = c.get("/api/v1/projects/nonexistent-id")
    assert resp.status_code == 404
