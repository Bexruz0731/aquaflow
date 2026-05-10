#!/bin/bash
# Obtain SSL certificate via Let's Encrypt
# Usage: bash ssl_setup.sh your-domain.uz admin@your-domain.uz

set -e

DOMAIN="${1:?Usage: ssl_setup.sh <domain> <email>}"
EMAIL="${2:?Usage: ssl_setup.sh <domain> <email>}"
CERT_DIR="./nginx/ssl"

echo "🔒 Getting SSL cert for $DOMAIN..."

mkdir -p "$CERT_DIR"
mkdir -p ./nginx/certbot/www

# Start nginx on port 80 for ACME challenge (uses dev config)
docker compose -f docker-compose.prod.yml up -d nginx || true

# Get certificate
certbot certonly \
    --webroot \
    --webroot-path=./nginx/certbot/www \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

# Copy certs
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem "$CERT_DIR/fullchain.pem"
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   "$CERT_DIR/privkey.pem"
chmod 644 "$CERT_DIR/fullchain.pem"
chmod 600 "$CERT_DIR/privkey.pem"

echo "✅ SSL certificates saved to $CERT_DIR"

# Add renewal cron
CRON_CMD="0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $(pwd)/$CERT_DIR/fullchain.pem && cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $(pwd)/$CERT_DIR/privkey.pem && docker compose -f $(pwd)/docker-compose.prod.yml exec nginx nginx -s reload"
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -

echo "✅ Auto-renewal cron added"
