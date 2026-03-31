"""Role loader tests."""

from app.agents.prompts.role_loader import load_role_prompt


def test_load_known_role():
    prompt = load_role_prompt("frontend_dev")
    assert isinstance(prompt, str)
    assert len(prompt) > 0


def test_load_unknown_role_falls_back():
    prompt = load_role_prompt("nonexistent_role")
    assert "expert" in prompt.lower() or "skilled" in prompt.lower()
