#!/usr/bin/env bash
# Production frontend build for sweaas.com (Vite + Amplify Hosting).
#
# Default: run a production build with VITE_API_BASE_URL pointing at the public API.
# With --amplify: also start an AWS Amplify hosted build (RELEASE job) so Amplify
# pulls the latest connected Git branch and builds in the cloud — push commits first.
#
# Environment (optional):
#   VITE_API_BASE_URL              default: https://api.sweaas.com/api/v1
#   VITE_SUPABASE_URL              required for real auth (same as backend SUPABASE_URL)
#   VITE_SUPABASE_PUBLISHABLE_KEY  required for real auth (Supabase publishable/anon key)
#   AMPLIFY_APP_ID                 default: d3rw7tzkg9y12a
#   AMPLIFY_BRANCH                 default: main
#   AWS_REGION                     default: us-east-1
#   VITE_SENTRY_DSN                set in shell or .env if you upload source maps via CI
#
# Usage:
#   ./scripts/deploy-frontend-prod.sh              # build only → frontend/dist
#   ./scripts/deploy-frontend-prod.sh --amplify    # build + trigger Amplify RELEASE job

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://api.sweaas.com/api/v1}"
AMPLIFY_APP_ID="${AMPLIFY_APP_ID:-d3rw7tzkg9y12a}"
AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-main}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found." >&2
  exit 1
fi

cd frontend

echo "==> Installing dependencies..."
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Building with VITE_API_BASE_URL=${VITE_API_BASE_URL}"
export VITE_API_BASE_URL
if [[ -n "${VITE_SUPABASE_URL:-}" ]]; then export VITE_SUPABASE_URL; fi
if [[ -n "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then export VITE_SUPABASE_PUBLISHABLE_KEY; fi
if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "warning: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — build will use dev-style login only." >&2
fi
npm run build

echo "==> Production assets in ${ROOT}/frontend/dist"

if [[ "${1:-}" == "--amplify" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "error: aws CLI required for --amplify" >&2
    exit 1
  fi
  echo "==> Starting Amplify RELEASE job (app=${AMPLIFY_APP_ID} branch=${AMPLIFY_BRANCH})..."
  aws amplify start-job \
    --app-id "$AMPLIFY_APP_ID" \
    --branch-name "$AMPLIFY_BRANCH" \
    --job-type RELEASE \
    --region "$AWS_REGION"
  echo "==> Amplify job submitted. Monitor progress in the AWS Amplify console."
else
  echo ""
  echo "Tip: push your branch, then run with --amplify to trigger a hosted build,"
  echo "     or rely on Amplify's GitHub auto-build on push."
fi
