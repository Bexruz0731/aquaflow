#!/bin/bash
# Deploy / update SuvPro on production VPS
# Usage: bash scripts/deploy.sh [--no-migrate] [--no-frontend]

set -e

COMPOSE="docker compose -f docker-compose.dev.yml"
SKIP_MIGRATE=false
SKIP_FRONTEND=false
TEST_STOPPED=false

for arg in "$@"; do
    [[ "$arg" == "--no-migrate" ]] && SKIP_MIGRATE=true
    [[ "$arg" == "--no-frontend" ]] && SKIP_FRONTEND=true
done

# ── Memory check helpers ──────────────────────────────────────────────────────
free_mb() {
    awk '/^MemAvailable/ {print int($2/1024)}' /proc/meminfo
}

stop_test_if_needed() {
    local FREE=$(free_mb)
    if [ "$FREE" -lt 1200 ]; then
        echo "RAM low (${FREE}MB free) — stopping test containers to free memory..."
        docker compose -f /root/test/docker-compose.dev.yml stop 2>/dev/null \
            || docker stop $(docker ps --filter "name=test-" -q) 2>/dev/null \
            || true
        TEST_STOPPED=true
        sleep 3
        echo "RAM after stopping test: $(free_mb)MB free"
    else
        echo "RAM OK: ${FREE}MB free"
    fi
}

restore_test() {
    if [ "$TEST_STOPPED" = true ]; then
        echo "Restoring test containers..."
        docker compose -f /root/test/docker-compose.dev.yml start 2>/dev/null \
            || docker start $(docker ps -a --filter "name=test-" --filter "status=exited" -q) 2>/dev/null \
            || true
    fi
}

# Restore test containers even on error
trap restore_test EXIT

echo "Deploying SuvPro..."
echo "RAM at start: $(free_mb)MB free"

# ── Pull latest code ──────────────────────────────────────────────────────────
echo "Pulling latest code..."
git pull origin main

# ── Build frontends ───────────────────────────────────────────────────────────
if [ "$SKIP_FRONTEND" = false ]; then
    stop_test_if_needed

    # Limit Node.js heap per build to avoid OOM (512MB is enough for Vite)
    export NODE_OPTIONS="--max-old-space-size=512"

    echo "Building web panel..."
    cd web && npm ci --prefer-offline && npm run build && cd ..
    echo "RAM after web build: $(free_mb)MB free"

    echo "Building client app..."
    cd client-app && npm ci --prefer-offline && npm run build && cd ..
    echo "RAM after client build: $(free_mb)MB free"

    echo "Building courier app..."
    cd courier-app && npm ci --prefer-offline && npm run build && cd ..
    echo "RAM after courier build: $(free_mb)MB free"

    unset NODE_OPTIONS

    # Copy built files to nginx serve directories
    echo "Copying build artifacts to /var/www/suvpro/..."
    rm -rf /var/www/suvpro/web && cp -r web/dist /var/www/suvpro/web
    rm -rf /var/www/suvpro/client && cp -r client-app/dist /var/www/suvpro/client
    rm -rf /var/www/suvpro/courier && cp -r courier-app/dist /var/www/suvpro/courier
    echo "Frontend deployed to /var/www/suvpro/"
fi

# ── Rebuild backend images ────────────────────────────────────────────────────
echo "Building backend image..."
stop_test_if_needed
$COMPOSE build --no-cache backend celery bot

# ── Run migrations ────────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATE" = false ]; then
    echo "Running database migrations..."
    $COMPOSE run --rm backend alembic upgrade head
fi

# ── Restart services (backend only, no Vite dev servers) ──────────────────────
echo "Restarting backend services..."
$COMPOSE up -d --no-deps backend celery bot

# ── Reload nginx ──────────────────────────────────────────────────────────────
echo "Reloading nginx..."
nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true

# ── Health check ─────────────────────────────────────────────────────────────
echo "Checking health..."
sleep 5
if curl -sf http://localhost/health > /dev/null; then
    echo "Deploy successful! API is healthy."
else
    echo "Health check failed!"
    $COMPOSE logs backend --tail=50
    exit 1
fi

echo ""
echo "Deploy complete at $(date)"
echo "RAM at end: $(free_mb)MB free"
