#!/bin/bash
# Deploy / update SuvPro on production VPS
# Usage: bash scripts/deploy.sh [--no-migrate]

set -e

COMPOSE="docker compose -f docker-compose.prod.yml"
SKIP_MIGRATE=false

for arg in "$@"; do
    [[ "$arg" == "--no-migrate" ]] && SKIP_MIGRATE=true
done

echo "🚀 Deploying SuvPro..."

# ── Pull latest code ──────────────────────────────────────────────────────────
echo "📥 Pulling latest code..."
git pull origin main

# ── Build frontends ───────────────────────────────────────────────────────────
echo "🏗 Building web panel..."
cd web && npm ci && npm run build && cd ..

echo "🏗 Building client app..."
cd client-app && npm ci && npm run build && cd ..

echo "🏗 Building courier app..."
cd courier-app && npm ci && npm run build && cd ..

# ── Copy dist to nginx volumes ────────────────────────────────────────────────
echo "📂 Copying build artifacts..."
CONTAINER_WEB=$(docker volume inspect suvpro_web_dist --format '{{ .Mountpoint }}' 2>/dev/null || true)
CONTAINER_CLIENT=$(docker volume inspect suvpro_client_dist --format '{{ .Mountpoint }}' 2>/dev/null || true)
CONTAINER_COURIER=$(docker volume inspect suvpro_courier_dist --format '{{ .Mountpoint }}' 2>/dev/null || true)

if [ -n "$CONTAINER_WEB" ]; then
    rm -rf "${CONTAINER_WEB:?}"/* && cp -r web/dist/. "$CONTAINER_WEB/"
fi
if [ -n "$CONTAINER_CLIENT" ]; then
    rm -rf "${CONTAINER_CLIENT:?}"/* && cp -r client-app/dist/. "$CONTAINER_CLIENT/"
fi
if [ -n "$CONTAINER_COURIER" ]; then
    rm -rf "${CONTAINER_COURIER:?}"/* && cp -r courier-app/dist/. "$CONTAINER_COURIER/"
fi

# ── Rebuild backend images ────────────────────────────────────────────────────
echo "🐳 Building backend image..."
$COMPOSE build backend celery bot

# ── Run migrations ────────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATE" = false ]; then
    echo "🗄 Running database migrations..."
    $COMPOSE run --rm backend alembic upgrade head
fi

# ── Restart services ──────────────────────────────────────────────────────────
echo "🔄 Restarting services..."
$COMPOSE up -d --no-deps backend celery bot
$COMPOSE exec nginx nginx -s reload

# ── Health check ─────────────────────────────────────────────────────────────
echo "💓 Checking health..."
sleep 5
if curl -sf http://localhost/health > /dev/null; then
    echo "✅ Deploy successful! API is healthy."
else
    echo "❌ Health check failed! Rolling back..."
    $COMPOSE logs backend --tail=50
    exit 1
fi

echo ""
echo "✅ Deploy complete at $(date)"
