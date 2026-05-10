#!/bin/bash
# Daily PostgreSQL backup — add to cron: 0 2 * * * /path/to/backup_db.sh

BACKUP_DIR="/var/backups/suvpro"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER="suvpro_postgres_1"

mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" pg_dump -U postgres suvpro | gzip > "$BACKUP_DIR/suvpro_$DATE.sql.gz"

# Keep last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "✅ Backup saved: suvpro_$DATE.sql.gz"
