#!/usr/bin/env bash
# Deploy backend to AWS ECS (same flow as .github/workflows/deploy-aws.yml):
#   1. docker build (linux/amd64) from backend/Dockerfile
#   2. push to ECR sweaas-backend
#   3. ecs update-service --force-new-deployment
#
# Prerequisites: AWS CLI v2, Docker, credentials with ECR push + ecs:UpdateService
# Environment (optional overrides):
#   AWS_REGION      default: us-east-1
#   ECR_REPO        default: sweaas-backend
#   ECS_CLUSTER     default: sweaas
#   ECS_SERVICE     default: backend
#   IMAGE_TAG       default: short git SHA
#
# Usage: ./scripts/deploy-backend-prod.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO="${ECR_REPO:-sweaas-backend}"
ECS_CLUSTER="${ECS_CLUSTER:-sweaas}"
ECS_SERVICE="${ECS_SERVICE:-backend}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

if ! command -v aws >/dev/null 2>&1; then
  echo "error: aws CLI not found." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found." >&2
  exit 1
fi

echo "==> Verifying AWS identity..."
aws sts get-caller-identity --region "$AWS_REGION" >/dev/null

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")"
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO}"

echo "==> Logging in to ECR ${ECR_REGISTRY}..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "==> Building ${FULL_IMAGE}:${IMAGE_TAG} (linux/amd64)..."
export DOCKER_BUILDKIT=1
docker build --platform linux/amd64 \
  -t "${FULL_IMAGE}:${IMAGE_TAG}" \
  -t "${FULL_IMAGE}:latest" \
  -f backend/Dockerfile .

echo "==> Pushing ${FULL_IMAGE}:${IMAGE_TAG} and :latest..."
docker push "${FULL_IMAGE}:${IMAGE_TAG}"
docker push "${FULL_IMAGE}:latest"

echo "==> Forcing new ECS deployment: cluster=${ECS_CLUSTER} service=${ECS_SERVICE}..."
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  >/dev/null

echo "==> Done. ECS is rolling out the new task definition (image :latest / ${IMAGE_TAG})."
