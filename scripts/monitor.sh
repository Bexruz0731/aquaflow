#!/bin/bash
# Simple uptime monitor — add to cron: */5 * * * * /opt/suvpro/scripts/monitor.sh
# Set ALERT_CHAT_ID and BOT_TOKEN in environment or this script

HEALTH_URL="${HEALTH_URL:-http://localhost/health}"
BOT_TOKEN="${MONITOR_BOT_TOKEN:-}"
CHAT_ID="${MONITOR_CHAT_ID:-}"
LOG_FILE="/var/log/suvpro_monitor.log"

alert() {
    local msg="$1"
    echo "$(date): $msg" >> "$LOG_FILE"
    if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
            -d "chat_id=${CHAT_ID}&text=⚠️ SuvPro: ${msg}" > /dev/null
    fi
}

# Check API health
if ! curl -sf --max-time 10 "$HEALTH_URL" > /dev/null; then
    alert "API is DOWN! $HEALTH_URL не отвечает"
    # Try to restart
    cd /opt/suvpro && docker compose -f docker-compose.prod.yml restart backend
fi

# Check disk space (alert if > 85%)
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    alert "Диск заполнен на ${DISK_USAGE}%"
fi

# Check postgres backup age (alert if last backup > 25h)
BACKUP_DIR="/var/backups/suvpro"
if [ -d "$BACKUP_DIR" ]; then
    LATEST=$(find "$BACKUP_DIR" -name "*.sql.gz" -newer /tmp/.monitor_sentinel 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        # Create sentinel file
        touch -d "25 hours ago" /tmp/.monitor_sentinel 2>/dev/null || true
        LATEST=$(find "$BACKUP_DIR" -name "*.sql.gz" -newer /tmp/.monitor_sentinel 2>/dev/null | head -1)
        [ -z "$LATEST" ] && alert "Последний бэкап БД старше 25 часов!"
    fi
fi
