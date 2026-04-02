#!/usr/bin/env bash
# Usage: ./scripts/secrets-pull.sh [output-file]
# Pulls all parameters from SSM /sweaas/dev/* and writes them as a .env file.
# Requires AWS credentials with ssm:GetParametersByPath + kms:Decrypt on /sweaas/dev/*.
set -euo pipefail

PREFIX="/sweaas/dev"
OUTPUT_FILE="${1:-.env}"

echo "Pulling secrets from SSM $PREFIX/ → '$OUTPUT_FILE'"

# Paginate through all params under the prefix
params=$(aws ssm get-parameters-by-path \
  --path "$PREFIX" \
  --recursive \
  --with-decryption \
  --no-cli-pager \
  --query 'Parameters[*].[Name,Value]' \
  --output text)

if [[ -z "$params" ]]; then
  echo "No parameters found under $PREFIX — have you run secrets-push.sh yet?" >&2
  exit 1
fi

# Back up existing .env if present
if [[ -f "$OUTPUT_FILE" ]]; then
  cp "$OUTPUT_FILE" "${OUTPUT_FILE}.bak"
  echo "Backed up existing file to ${OUTPUT_FILE}.bak"
fi

{
  echo "# Generated from AWS SSM Parameter Store ($PREFIX)"
  echo "# $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo ""
  while IFS=$'\t' read -r name value; do
    key="${name##*/}"
    echo "$key=$value"
  done <<< "$params"
} > "$OUTPUT_FILE"

echo ""
echo "Done — written to '$OUTPUT_FILE'"
echo "Note: DATABASE_URL / REDIS_URL / CHROMA_HOST point to production infra."
echo "      Override locally as needed for your dev environment."
