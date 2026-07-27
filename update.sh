#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CONTAINER="raid-bot"
OLD_CONTAINER="abyssal"

cleanup_old() {
    echo -e "${YELLOW}🧹 Cleaning up old container...${NC}"
    docker stop "$OLD_CONTAINER" 2>/dev/null || true
    docker rm "$OLD_CONTAINER" 2>/dev/null || true
    docker rm -f "$CONTAINER" 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
}

pull_code() {
    echo -e "${GREEN}📥 Pulling latest code...${NC}"
    git pull origin main
}

build() {
    echo -e "${GREEN}🐳 Building Docker image...${NC}"
    docker-compose build --no-cache
}

start() {
    echo -e "${GREEN}🚀 Starting bot...${NC}"
    docker-compose up -d
}

stop() {
    echo -e "${YELLOW}⏹️  Stopping bot...${NC}"
    docker-compose down
}

restart() {
    stop
    start
}

logs() {
    docker-compose logs -f --tail=50
}

status() {
    docker-compose ps
}

case "$1" in
    start)
        cleanup_old
        pull_code
        build
        start
        echo -e "${GREEN}✅ Bot is running!${NC}"
        ;;
    stop)
        stop
        echo -e "${YELLOW}⏹️  Bot stopped.${NC}"
        ;;
    restart)
        cleanup_old
        restart
        echo -e "${GREEN}✅ Bot restarted!${NC}"
        ;;
    update)
        cleanup_old
        pull_code
        build
        stop
        start
        echo -e "${GREEN}✅ Bot updated and running!${NC}"
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    *)
        echo -e "${GREEN}Raid Bot Manager${NC}"
        echo ""
        echo "Usage: ./update.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start     - Pull code, build & start bot"
        echo "  stop      - Stop bot"
        echo "  restart   - Restart bot"
        echo "  update    - Pull, rebuild & restart (full update)"
        echo "  logs      - Show bot logs"
        echo "  status    - Show bot status"
        echo ""
        echo "Examples:"
        echo "  ./update.sh update    # Full update"
        echo "  ./update.sh logs      # See logs"
        echo "  ./update.sh restart   # Quick restart"
        ;;
esac
