#!/usr/bin/env bash
# Usage: ./scripts/secrets-push.sh [path/to/.env]
# Uploads every non-empty, non-placeholder key from .env to AWS SSM Parameter Store
# under /sweaas/dev/<KEY> as SecureString (encrypted with the default AWS-managed KMS key).
set -euo pipefail

ENV_FILE="${1:-.env}"
PREFIX="/sweaas/dev"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

echo "Pushing secrets from '$ENV_FILE' → SSM $PREFIX/"
count=0
skipped=0

while IFS= read -r line || [[ -n "$line" ]]; do
  # skip blank lines and comments
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue

  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"

    # skip empty or placeholder values
    if [[ -z "$value" || "$value" == *"your-"* ]]; then
      echo "  skip  $key (empty or placeholder)"
      skipped=$((skipped + 1))
      continue
    fi

    echo "  push  $key"
    aws ssm put-parameter \
      --name "$PREFIX/$key" \
      --value "$value" \
      --type SecureString \
      --overwrite \
      --no-cli-pager \
      > /dev/null
    count=$((count + 1))
  fi
done < "$ENV_FILE"

echo ""
echo "Done — pushed $count parameters, skipped $skipped."
echo "View them: aws ssm get-parameters-by-path --path $PREFIX --recursive --with-decryption --no-cli-pager"
