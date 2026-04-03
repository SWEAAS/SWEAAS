"""Load agent role definitions from vendor/agency-agents/ as system prompts.

Each role file is a Markdown document describing the agent's identity,
personality, core mission, workflows, and deliverables.

The agency-agents repo contains 130+ role definitions across categories:
  engineering/ (25+), marketing/ (28+), testing/ (8), product/ (5),
  design/ (8), support/ (6), sales/ (8), specialized/ (28+), etc.

Files follow the naming convention: {category}/{category}-{role-name}.md
  e.g. engineering/engineering-backend-architect.md

The loader supports:
  1. Explicit ROLE_MAP for our 6 graph specialist nodes + 3 managers
  2. Auto-discovery: any role file in the vendor tree can be loaded by
     its slug (e.g. "security-engineer" -> engineering/engineering-security-engineer.md)
  3. list_available_roles() to enumerate everything available
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

VENDOR_AGENTS_DIR = Path(__file__).resolve().parents[4] / "vendor" / "agency-agents"

# Explicit mapping for the graph nodes we have today.
# Paths match the actual filenames (category/category-name.md convention).
ROLE_MAP: dict[str, str] = {
    # Engineering specialists
    "frontend_dev": "engineering/engineering-frontend-developer.md",
    "backend_architect": "engineering/engineering-backend-architect.md",
    "devops": "engineering/engineering-devops-automator.md",
    "qa_tester": "testing/testing-api-tester.md",
    # Managers
    "engineering_manager": "engineering/engineering-senior-developer.md",
    "product_manager": "product/product-manager.md",
    "marketing_manager": "marketing/marketing-growth-hacker.md",
    # Non-engineering specialists
    "product_ops": "product/product-feedback-synthesizer.md",
    "growth_analyst": "marketing/marketing-growth-hacker.md",
}

# Lazily populated on first call to list_available_roles()
_DISCOVERED_ROLES: dict[str, str] | None = None


def load_role_prompt(role: str) -> str:
    """Load the system prompt for a given agent role.

    Resolution order:
      1. Check explicit ROLE_MAP (our graph node names)
      2. Try auto-discovery by slug across all vendor categories
      3. Fall back to a generic prompt
    """
    # 1. Explicit map
    relative_path = ROLE_MAP.get(role)
    if relative_path:
        full_path = VENDOR_AGENTS_DIR / relative_path
        if full_path.exists():
            return _read_role_file(role, full_path)
        logger.warning("Mapped file missing at %s — trying auto-discovery.", full_path)

    # 2. Auto-discover by slug
    discovered = _discover_roles()
    slug = _normalize_slug(role)

    if slug in discovered:
        full_path = VENDOR_AGENTS_DIR / discovered[slug]
        if full_path.exists():
            return _read_role_file(role, full_path)

    # Try partial match (e.g. "security_engineer" matches "engineering-security-engineer")
    for disc_slug, disc_path in discovered.items():
        if slug in disc_slug or disc_slug in slug:
            full_path = VENDOR_AGENTS_DIR / disc_path
            if full_path.exists():
                logger.info("Fuzzy-matched '%s' -> '%s'", role, disc_path)
                return _read_role_file(role, full_path)

    # 3. Generic fallback
    logger.warning("No role file found for '%s' — using generic prompt.", role)
    return _generic_prompt(role)


def list_available_roles() -> dict[str, str]:
    """Return all available role slugs and their file paths.

    Keys are normalized slugs (e.g. "backend-architect"), values are
    relative paths within the vendor/agency-agents/ tree.
    """
    return dict(_discover_roles())


def get_role_categories() -> dict[str, list[str]]:
    """Group available roles by category folder."""
    roles = _discover_roles()
    categories: dict[str, list[str]] = {}
    for slug, path in roles.items():
        cat = path.split("/")[0]
        categories.setdefault(cat, []).append(slug)
    return categories


def _discover_roles() -> dict[str, str]:
    """Scan the vendor tree and build a slug -> path map.

    Cached after first call. Excludes non-role directories like
    examples/, integrations/, strategy/, game-development/, spatial-computing/.
    """
    global _DISCOVERED_ROLES
    if _DISCOVERED_ROLES is not None:
        return _DISCOVERED_ROLES

    _DISCOVERED_ROLES = {}

    if not VENDOR_AGENTS_DIR.exists():
        logger.warning("Vendor agents dir not found at %s", VENDOR_AGENTS_DIR)
        return _DISCOVERED_ROLES

    skip_dirs = {
        "examples", "integrations", "strategy", ".github",
        "game-development", "spatial-computing",
    }

    for category_dir in sorted(VENDOR_AGENTS_DIR.iterdir()):
        if not category_dir.is_dir() or category_dir.name in skip_dirs:
            continue
        if category_dir.name.startswith("."):
            continue

        for md_file in sorted(category_dir.glob("*.md")):
            if md_file.name.upper().startswith("README"):
                continue

            relative = f"{category_dir.name}/{md_file.name}"
            # Strip category prefix and .md to get the slug
            # e.g. "engineering/engineering-backend-architect.md" -> "backend-architect"
            name = md_file.stem
            prefix = f"{category_dir.name}-"
            if name.startswith(prefix):
                slug = name[len(prefix):]
            else:
                slug = name

            _DISCOVERED_ROLES[slug] = relative

    logger.info(
        "Discovered %d role definitions across %d categories",
        len(_DISCOVERED_ROLES),
        len({p.split("/")[0] for p in _DISCOVERED_ROLES.values()}),
    )
    return _DISCOVERED_ROLES


def _normalize_slug(role: str) -> str:
    """Convert internal role name to a discovery slug.

    "backend_architect" -> "backend-architect"
    "qa_tester" -> "qa-tester"
    """
    return role.replace("_", "-").lower()


def _read_role_file(role: str, path: Path) -> str:
    """Read and return the contents of a role definition file."""
    content = path.read_text(encoding="utf-8")
    logger.info(
        "Loaded role prompt for '%s' from %s (%d chars)",
        role, path.name, len(content),
    )
    return content


def _generic_prompt(role: str) -> str:
    return (
        f"You are a highly skilled {role.replace('_', ' ')} working as part of a "
        f"software engineering team. You are an expert in your domain. "
        f"Follow instructions precisely, produce high-quality work, and report "
        f"results clearly to your manager."
    )
