"""Load agent role definitions from vendor/agency-agents/ as system prompts.

Each role file is a Markdown document describing the agent's identity,
personality, core mission, workflows, and deliverables.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

VENDOR_AGENTS_DIR = Path(__file__).resolve().parents[4] / "vendor" / "agency-agents"

ROLE_MAP: dict[str, str] = {
    "frontend_dev": "engineering/frontend-developer.md",
    "backend_architect": "engineering/backend-architect.md",
    "devops": "engineering/devops-automator.md",
    "qa_tester": "testing/qa-engineer.md",
    "growth_analyst": "marketing/growth-hacker.md",
    "product_ops": "product/product-manager.md",
    "engineering_manager": "engineering/senior-developer.md",
    "product_manager": "product/product-manager.md",
    "marketing_manager": "marketing/growth-hacker.md",
}


def load_role_prompt(role: str) -> str:
    """Load the system prompt for a given agent role.

    Falls back to a generic prompt if the vendor file is not found.
    """
    relative_path = ROLE_MAP.get(role)
    if relative_path is None:
        logger.warning("No role mapping for '%s' — using generic prompt.", role)
        return _generic_prompt(role)

    full_path = VENDOR_AGENTS_DIR / relative_path
    if not full_path.exists():
        logger.warning("Role file not found at %s — using generic prompt.", full_path)
        return _generic_prompt(role)

    content = full_path.read_text(encoding="utf-8")
    logger.info(
        "Loaded role prompt for '%s' from %s (%d chars)",
        role,
        full_path.name,
        len(content),
    )
    return content


def _generic_prompt(role: str) -> str:
    return (
        f"You are a highly skilled {role.replace('_', ' ')} working as part of a "
        f"software engineering team. You are an expert in your domain. "
        f"Follow instructions precisely, produce high-quality work, and report "
        f"results clearly to your manager."
    )
