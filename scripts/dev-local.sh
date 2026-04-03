#!/usr/bin/env bash
# Start local infrastructure (Postgres, Redis, ChromaDB), run migrations, then:
#   - FastAPI backend on http://localhost:8000 (hot reload)
#   - Vite frontend on http://localhost:5173 (proxies /api → backend)
#
# Prerequisites: Docker, Python 3.11+ venv at repo root (.venv), Node 18+, .env from .env.example
#
# Usage: ./scripts/dev-local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "error: missing .env — copy .env.example to .env and fill values." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found." >&2
  exit 1
fi

UVICORN_BIN=""
if [[ -x .venv/bin/uvicorn ]]; then
  UVICORN_BIN=".venv/bin/uvicorn"
elif command -v uvicorn >/dev/null 2>&1; then
  UVICORN_BIN="uvicorn"
else
  echo "error: uvicorn not found. Create venv and run: pip install -e '.[dev]'" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found." >&2
  exit 1
fi

echo "==> Starting Postgres, Redis, ChromaDB (docker compose)..."
docker compose up -d postgres redis chromadb

PG_USER="${POSTGRES_USER:-sweaas}"
export PG_USER
echo "==> Waiting for Postgres to accept connections..."
for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose exec -T postgres pg_isready -U "$PG_USER" >/dev/null 2>&1; then
  echo "error: Postgres did not become ready in time." >&2
  exit 1
fi

echo "==> Running Alembic migrations..."
(cd backend && alembic upgrade head)

BACKEND_PID=""
cleanup() {
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo ""
    echo "==> Stopping backend (pid ${BACKEND_PID})..."
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Starting backend: http://localhost:8000 (docs: /docs)"
"$UVICORN_BIN" app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend &
BACKEND_PID=$!

# Give uvicorn a moment to bind
sleep 1

echo "==> Starting frontend: http://localhost:5173"
cd frontend
if [[ ! -d node_modules ]]; then
  echo "==> Installing frontend dependencies..."
  npm install
fi
npm run dev
