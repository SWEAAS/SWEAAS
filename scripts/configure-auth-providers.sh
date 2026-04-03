#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# configure-auth-providers.sh
#
# After creating Google + GitHub OAuth credentials (see instructions
# printed when run without arguments), run this script to configure
# Supabase Auth providers and update .env in one shot.
#
# Usage:
#   ./scripts/configure-auth-providers.sh \
#       --google-client-id  "XXXX.apps.googleusercontent.com" \
#       --google-secret     "GOCSPX-XXXX" \
#       --github-client-id  "Ov23liXXXX" \
#       --github-secret     "XXXX"
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

SUPABASE_REF="bzsxqzgryiemyzeeefuw"
SUPABASE_CALLBACK="https://${SUPABASE_REF}.supabase.co/auth/v1/callback"

# ── Parse args ───────────────────────────────────────────────────
GOOGLE_CLIENT_ID=""
GOOGLE_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_SECRET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --google-client-id)  GOOGLE_CLIENT_ID="$2"; shift 2 ;;
    --google-secret)     GOOGLE_SECRET="$2"; shift 2 ;;
    --github-client-id)  GITHUB_CLIENT_ID="$2"; shift 2 ;;
    --github-secret)     GITHUB_SECRET="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$GOOGLE_CLIENT_ID" || -z "$GOOGLE_SECRET" || -z "$GITHUB_CLIENT_ID" || -z "$GITHUB_SECRET" ]]; then
  cat <<'INSTRUCTIONS'
╔══════════════════════════════════════════════════════════════════╗
║              SWEAAS Auth Provider Setup Instructions            ║
╚══════════════════════════════════════════════════════════════════╝

You need to create OAuth credentials in two places, then re-run
this script with the values. Both take ~2 minutes each.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 1: Google OAuth (Google Cloud Console)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1a) Open: https://console.cloud.google.com/apis/credentials?project=sweaas

1b) If you see a banner "To create an OAuth client ID, you must first
    configure your consent screen", click "CONFIGURE CONSENT SCREEN":
    • User type: External
    • App name: SWEAAS
    • User support email: your email
    • Developer contact email: your email
    • Scopes: click "ADD OR REMOVE SCOPES" → check:
        .../auth/userinfo.email
        .../auth/userinfo.profile
        openid
      → Save
    • Test users: skip (or add your email)
    • Click "BACK TO DASHBOARD"
    NOTE: To allow anyone to sign in (not just test users), click
    "PUBLISH APP" on the consent screen dashboard.

1c) Back on the Credentials page, click "+ CREATE CREDENTIALS"
    → "OAuth client ID"
    • Application type: Web application
    • Name: SWEAAS (Supabase Auth)
    • Authorized JavaScript origins: (leave empty)
    • Authorized redirect URIs: add exactly ONE entry:
INSTRUCTIONS
  echo "        ${SUPABASE_CALLBACK}"
  cat <<'INSTRUCTIONS'
    • Click CREATE
    • Copy the Client ID and Client Secret shown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 2: GitHub OAuth App
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2a) Open: https://github.com/settings/developers
    (this is your PERSONAL OAuth Apps — NOT the SWEAAS org GitHub App)

2b) Click "New OAuth App"
    • Application name: SWEAAS Login
    • Homepage URL: https://sweaas.com
INSTRUCTIONS
  echo "    • Authorization callback URL: ${SUPABASE_CALLBACK}"
  cat <<'INSTRUCTIONS'
    • Click "Register application"

2c) On the app page:
    • Copy the Client ID (shown at top, e.g. Ov23li...)
    • Click "Generate a new client secret" → copy it immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 3: Run this script again
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ./scripts/configure-auth-providers.sh \
      --google-client-id  "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com" \
      --google-secret     "GOCSPX-YOUR_GOOGLE_SECRET" \
      --github-client-id  "YOUR_GITHUB_CLIENT_ID" \
      --github-secret     "YOUR_GITHUB_SECRET"

The script will:
  ✓ Enable Google + GitHub on Supabase via the Management API
  ✓ Update your .env with the new credentials
  ✓ Verify the configuration

INSTRUCTIONS
  exit 1
fi

# ── Load Supabase access token ───────────────────────────────────
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if [[ -f "$ENV_FILE" ]]; then
    SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
  fi
fi
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "error: SUPABASE_ACCESS_TOKEN not found in env or .env" >&2
  exit 1
fi
export SUPABASE_ACCESS_TOKEN

echo "==> Configuring Supabase Auth providers for project ${SUPABASE_REF}..."

# ── Enable Google provider ───────────────────────────────────────
echo "    → Enabling Google..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/${SUPABASE_REF}/config/auth" \
  -d "{
    \"external_google_enabled\": true,
    \"external_google_client_id\": \"${GOOGLE_CLIENT_ID}\",
    \"external_google_secret\": \"${GOOGLE_SECRET}\",
    \"external_google_skip_nonce_check\": false
  }")

if [[ "$RESULT" != "200" ]]; then
  echo "error: Supabase API returned HTTP $RESULT for Google config" >&2
  exit 1
fi
echo "      ✓ Google enabled"

# ── Enable GitHub provider ───────────────────────────────────────
echo "    → Enabling GitHub..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/${SUPABASE_REF}/config/auth" \
  -d "{
    \"external_github_enabled\": true,
    \"external_github_client_id\": \"${GITHUB_CLIENT_ID}\",
    \"external_github_secret\": \"${GITHUB_SECRET}\"
  }")

if [[ "$RESULT" != "200" ]]; then
  echo "error: Supabase API returned HTTP $RESULT for GitHub config" >&2
  exit 1
fi
echo "      ✓ GitHub enabled"

# ── Update .env ──────────────────────────────────────────────────
echo "    → Updating .env..."

update_or_add_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Use perl for reliable in-place replacement (macOS sed -i is finicky)
    perl -pi -e "s|^\Q${key}\E=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

update_or_add_env "GOOGLE_OAUTH_CLIENT_ID" "$GOOGLE_CLIENT_ID"
update_or_add_env "GOOGLE_OAUTH_CLIENT_SECRET" "$GOOGLE_SECRET"
update_or_add_env "GITHUB_OAUTH_CLIENT_ID" "$GITHUB_CLIENT_ID"
update_or_add_env "GITHUB_OAUTH_CLIENT_SECRET" "$GITHUB_SECRET"

echo "      ✓ .env updated"

# ── Verify ───────────────────────────────────────────────────────
echo "    → Verifying..."
VERIFY=$(curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/${SUPABASE_REF}/config/auth" 2>&1)

GOOGLE_OK=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('external_google_enabled', False))")
GITHUB_OK=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('external_github_enabled', False))")
SITE_URL=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('site_url', '?'))")
REDIRECTS=$(echo "$VERIFY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('uri_allow_list', '?'))")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Configuration Summary                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  %-20s %-38s ║\n" "Site URL:" "$SITE_URL"
printf "║  %-20s %-38s ║\n" "Email enabled:" "True"
printf "║  %-20s %-38s ║\n" "Google enabled:" "$GOOGLE_OK"
printf "║  %-20s %-38s ║\n" "GitHub enabled:" "$GITHUB_OK"
echo "║                                                            ║"
echo "║  Redirect URLs:                                            ║"
IFS=',' read -ra URLS <<< "$REDIRECTS"
for url in "${URLS[@]}"; do
  printf "║    %-56s ║\n" "$url"
done
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Done! Google + GitHub sign-in is now live on your Supabase project."
echo ""
echo "For production, make sure these are set in your backend environment:"
echo "  AUTH_ENFORCE_JWT=true"
echo "  SUPABASE_URL=https://${SUPABASE_REF}.supabase.co"
echo ""
echo "And in your frontend build (Amplify env vars):"
echo "  VITE_SUPABASE_URL=https://${SUPABASE_REF}.supabase.co"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY=<your publishable key>"
