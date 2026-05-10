#!/bin/bash

# Quick deployment script for SUV Pro
# This script helps you quickly deploy or update the project

set -e

echo "======================================"
echo "SUV Pro Quick Deploy"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the project directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}Error: docker-compose.prod.yml not found!${NC}"
    echo "Please run this script from the project root directory."
    exit 1
fi

# Function to show menu
show_menu() {
    echo ""
    echo "Choose an action:"
    echo "1) Initial deployment (first time setup)"
    echo "2) Update and restart all services"
    echo "3) View logs"
    echo "4) Stop all services"
    echo "5) Database backup"
    echo "6) Database restore"
    echo "7) Check service status"
    echo "8) Clean up (remove unused images/volumes)"
    echo "9) Exit"
    echo ""
    read -p "Enter choice [1-9]: " choice
}

# Initial deployment
initial_deploy() {
    echo -e "${GREEN}Starting initial deployment...${NC}"

    # Check .env files
    if [ ! -f "backend/.env" ]; then
        echo -e "${YELLOW}Creating backend/.env from template...${NC}"
        cp backend/.env.production backend/.env
        echo -e "${RED}IMPORTANT: Edit backend/.env with your credentials!${NC}"
        read -p "Press Enter when ready to continue..."
    fi

    if [ ! -f "bot/.env" ]; then
        echo -e "${YELLOW}Creating bot/.env from template...${NC}"
        cp bot/.env.production bot/.env
        echo -e "${RED}IMPORTANT: Edit bot/.env with your credentials!${NC}"
        read -p "Press Enter when ready to continue..."
    fi

    # Build and start services
    echo -e "${GREEN}Building and starting services...${NC}"
    docker compose -f docker-compose.prod.yml up -d --build

    echo -e "${GREEN}Waiting for services to start...${NC}"
    sleep 10

    # Show logs
    docker compose -f docker-compose.prod.yml logs --tail=50

    echo -e "${GREEN}Initial deployment complete!${NC}"
    echo "Access your application at: http://YOUR_SERVER_IP"
}

# Update services
update_services() {
    echo -e "${GREEN}Updating services...${NC}"

    # Pull latest changes (if using git)
    if [ -d ".git" ]; then
        echo -e "${YELLOW}Pulling latest changes...${NC}"
        git pull
    fi

    # Rebuild and restart
    docker compose -f docker-compose.prod.yml up -d --build

    echo -e "${GREEN}Services updated!${NC}"
}

# View logs
view_logs() {
    echo "Which service logs do you want to view?"
    echo "1) All services"
    echo "2) Backend"
    echo "3) Bot"
    echo "4) Nginx"
    echo "5) PostgreSQL"
    echo "6) Redis"
    read -p "Enter choice [1-6]: " log_choice

    case $log_choice in
        1) docker compose -f docker-compose.prod.yml logs -f --tail=100 ;;
        2) docker compose -f docker-compose.prod.yml logs -f backend --tail=100 ;;
        3) docker compose -f docker-compose.prod.yml logs -f bot --tail=100 ;;
        4) docker compose -f docker-compose.prod.yml logs -f nginx --tail=100 ;;
        5) docker compose -f docker-compose.prod.yml logs -f postgres --tail=100 ;;
        6) docker compose -f docker-compose.prod.yml logs -f redis --tail=100 ;;
        *) echo "Invalid choice" ;;
    esac
}

# Stop services
stop_services() {
    echo -e "${YELLOW}Stopping all services...${NC}"
    docker compose -f docker-compose.prod.yml down
    echo -e "${GREEN}Services stopped!${NC}"
}

# Database backup
db_backup() {
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    echo -e "${GREEN}Creating database backup: $BACKUP_FILE${NC}"
    docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres suvpro > "$BACKUP_FILE"
    echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
}

# Database restore
db_restore() {
    echo "Available backup files:"
    ls -lh backup_*.sql 2>/dev/null || echo "No backup files found"
    echo ""
    read -p "Enter backup filename to restore: " backup_file

    if [ -f "$backup_file" ]; then
        echo -e "${YELLOW}Restoring database from $backup_file...${NC}"
        docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres suvpro < "$backup_file"
        echo -e "${GREEN}Database restored!${NC}"
    else
        echo -e "${RED}Backup file not found!${NC}"
    fi
}

# Check status
check_status() {
    echo -e "${GREEN}Service Status:${NC}"
    docker compose -f docker-compose.prod.yml ps
    echo ""
    echo -e "${GREEN}Resource Usage:${NC}"
    docker stats --no-stream
}

# Clean up
cleanup() {
    echo -e "${YELLOW}Cleaning up unused Docker resources...${NC}"
    docker system prune -af --volumes
    echo -e "${GREEN}Cleanup complete!${NC}"
}

# Main loop
while true; do
    show_menu
    case $choice in
        1) initial_deploy ;;
        2) update_services ;;
        3) view_logs ;;
        4) stop_services ;;
        5) db_backup ;;
        6) db_restore ;;
        7) check_status ;;
        8) cleanup ;;
        9) echo "Exiting..."; exit 0 ;;
        *) echo -e "${RED}Invalid choice!${NC}" ;;
    esac
done
