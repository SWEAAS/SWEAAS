"""Shared test fixtures."""

import os

# Ensure JWT enforcement does not block API tests (pytest process env wins over .env file).
os.environ["AUTH_ENFORCE_JWT"] = "false"

from app.core.config import get_settings

get_settings.cache_clear()

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Provide a synchronous test client for the FastAPI app."""
    with TestClient(app) as c:
        yield c
