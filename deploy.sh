#!/bin/bash

# Deployment script for SUV Pro Production Server
# Ubuntu 24.04

set -e

echo "======================================"
echo "SUV Pro Production Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Updating system...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}Step 2: Installing required packages...${NC}"
apt install -y git curl wget vim htop nano ufw

echo -e "${GREEN}Step 3: Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed successfully${NC}"
else
    echo -e "${YELLOW}Docker is already installed${NC}"
fi

echo -e "${GREEN}Step 4: Installing Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    apt install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
else
    echo -e "${YELLOW}Docker Compose is already installed${NC}"
fi

echo -e "${GREEN}Step 5: Configuring firewall (UFW)...${NC}"
ufw --force enable
ufw allow ssh
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8443/tcp
echo -e "${GREEN}Firewall configured${NC}"

echo -e "${GREEN}Step 6: Creating project directory...${NC}"
PROJECT_DIR="/opt/suvpro"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

echo -e "${YELLOW}================================${NC}"
echo -e "${YELLOW}Initial setup complete!${NC}"
echo -e "${YELLOW}================================${NC}"
echo ""
echo "Next steps:"
echo "1. Upload your project files to: $PROJECT_DIR"
echo "2. Configure .env.production file with your credentials"
echo "3. Run: cd $PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "You can use SCP to upload files:"
echo "  scp -r /path/to/your/project/* root@31.56.113.76:$PROJECT_DIR/"
echo ""
echo -e "${GREEN}Deployment preparation completed!${NC}"
