#!/usr/bin/env bash
# Clone vendor dependencies into the vendor/ directory.
# These are gitignored and must be cloned locally after initial checkout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_DIR="$REPO_ROOT/vendor"

mkdir -p "$VENDOR_DIR"

echo "==> Cloning agency-agents (agent role definitions)..."
if [ -d "$VENDOR_DIR/agency-agents" ]; then
    echo "    Already exists — pulling latest..."
    git -C "$VENDOR_DIR/agency-agents" pull --ff-only 2>/dev/null || true
else
    git clone https://github.com/msitarzewski/agency-agents.git "$VENDOR_DIR/agency-agents"
fi

echo "==> Cloning nemoclaw (NVIDIA NemoClaw blueprints)..."
if [ -d "$VENDOR_DIR/nemoclaw" ]; then
    echo "    Already exists — pulling latest..."
    git -C "$VENDOR_DIR/nemoclaw" pull --ff-only 2>/dev/null || true
else
    # Replace with the actual nemoclaw repo URL when available
    echo "    NOTE: nemoclaw repo URL not yet confirmed. Creating placeholder."
    mkdir -p "$VENDOR_DIR/nemoclaw"
    cat > "$VENDOR_DIR/nemoclaw/README.md" << 'INNER_EOF'
# NemoClaw Integration

Placeholder for NVIDIA NemoClaw blueprints.
Clone the actual repository here when the URL is confirmed.

## Integration Notes

NemoClaw blueprints can be loaded as additional system prompt context
for specialist agents via the role_loader module. Each blueprint file
should be a Markdown document describing skill patterns and workflows.

See: backend/app/agents/prompts/role_loader.py
INNER_EOF
fi

echo ""
echo "==> Verifying role_loader paths against agency-agents..."
ROLE_MAP_PATHS=(
    "engineering/engineering-frontend-developer.md"
    "engineering/engineering-backend-architect.md"
    "engineering/engineering-devops-automator.md"
    "testing/testing-api-tester.md"
    "marketing/marketing-growth-hacker.md"
    "product/product-manager.md"
    "product/product-feedback-synthesizer.md"
    "engineering/engineering-senior-developer.md"
)

MISSING=0
for path in "${ROLE_MAP_PATHS[@]}"; do
    FULL="$VENDOR_DIR/agency-agents/$path"
    if [ -f "$FULL" ]; then
        echo "    OK: $path"
    else
        echo "    MISSING: $path"
        MISSING=$((MISSING + 1))
    fi
done

if [ "$MISSING" -gt 0 ]; then
    echo ""
    echo "WARNING: $MISSING role file(s) missing. The role_loader will use generic prompts for those roles."
    echo "Check the agency-agents repo structure and update ROLE_MAP in:"
    echo "  backend/app/agents/prompts/role_loader.py"
fi

echo ""
echo "==> Vendor setup complete."
echo "    agency-agents: $VENDOR_DIR/agency-agents"
echo "    nemoclaw:      $VENDOR_DIR/nemoclaw"
