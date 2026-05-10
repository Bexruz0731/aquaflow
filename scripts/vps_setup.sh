#!/bin/bash
# VPS initial setup — run once on a fresh Ubuntu 22.04 server
# Usage: bash vps_setup.sh your-domain.uz

set -e

DOMAIN="${1:-app.suvpro.uz}"
EMAIL="${2:-admin@suvpro.uz}"

echo "🚀 SuvPro VPS Setup — domain: $DOMAIN"

# ── System update ────────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban

# ── Docker ───────────────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing docker-compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# ── Certbot (SSL) ─────────────────────────────────────────────────────────────
if ! command -v certbot &> /dev/null; then
    echo "🔒 Installing Certbot..."
    apt-get install -y certbot
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
echo "🔥 Configuring firewall..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── Fail2ban ──────────────────────────────────────────────────────────────────
systemctl enable fail2ban
systemctl start fail2ban

# ── App directory ─────────────────────────────────────────────────────────────
mkdir -p /opt/suvpro
mkdir -p /var/backups/suvpro

echo "✅ VPS setup complete!"
echo ""
echo "Next steps:"
echo "  1. Clone repo: git clone <repo-url> /opt/suvpro"
echo "  2. cd /opt/suvpro && bash scripts/setup.sh"
echo "  3. Edit .env files"
echo "  4. bash scripts/ssl_setup.sh $DOMAIN $EMAIL"
echo "  5. bash scripts/deploy.sh"
