"""Auth endpoint tests."""


def test_get_profile(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["uid"] == "dev-user"
    assert data["email"] == "user@sweaas.dev"
    assert data["role"] == "owner"
    assert "full_name" in data
    assert "github_username" in data
