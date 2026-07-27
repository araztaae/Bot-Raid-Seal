#!/bin/bash

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
CONTAINER="raid-bot"
OLD_CONTAINER="abyssal"
DB_FILE="raid.db"
BACKUP_DIR="backups"

# ── Helpers ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_action()  { echo -e "${BLUE}[>>>]${NC} $1"; }
separator()   { echo -e "${CYAN}────────────────────────────────────────${NC}"; }

# ── Functions ─────────────────────────────────────────────────────────────────
cleanup_old() {
    log_action "Cleaning up old containers..."
    docker stop "$OLD_CONTAINER" 2>/dev/null && log_warn "Stopped old container: $OLD_CONTAINER" || true
    docker rm "$OLD_CONTAINER" 2>/dev/null && log_warn "Removed old container: $OLD_CONTAINER" || true
    docker rm -f "$CONTAINER" 2>/dev/null || true
    docker network prune -f 2>/dev/null || true
}

backup_db() {
    if [ -f "$DB_FILE" ]; then
        mkdir -p "$BACKUP_DIR"
        BACKUP_NAME="${BACKUP_DIR}/raid_$(date +%Y%m%d_%H%M%S).db"
        cp "$DB_FILE" "$BACKUP_NAME"
        log_info "Database backed up to: $BACKUP_NAME"

        # Keep only last 7 backups
        ls -t "$BACKUP_DIR"/raid_*.db 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
    else
        log_warn "No database file found, skipping backup."
    fi
}

pull_code() {
    log_action "Pulling latest code..."
    git pull origin main
}

build() {
    log_action "Building Docker image..."
    docker-compose build --no-cache
}

start() {
    log_action "Starting bot..."
    docker-compose up -d
}

stop() {
    log_action "Stopping bot..."
    docker-compose down
}

cleanup_images() {
    log_action "Cleaning up old Docker images..."
    docker image prune -f 2>/dev/null || true
}

show_status() {
    separator
    log_info "Bot Status:"
    docker-compose ps 2>/dev/null || echo "Container not running."
    separator

    # Check restart count
    RESTARTS=$(docker inspect --format='{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "0")
    if [ "$RESTARTS" -gt 0 ]; then
        log_warn "Container has restarted $RESTARTS time(s) — check logs for errors."
    fi
}

show_logs() {
    docker-compose logs -f --tail=50
}

# ── Commands ──────────────────────────────────────────────────────────────────
cmd_start() {
    cleanup_old
    pull_code
    build
    start
    separator
    log_info "Bot is running!"
    show_status
}

cmd_stop() {
    stop
    log_info "Bot stopped."
}

cmd_restart() {
    cleanup_old
    stop
    start
    separator
    log_info "Bot restarted!"
    show_status
}

cmd_update() {
    cleanup_old
    backup_db
    pull_code
    build
    stop
    start
    cleanup_images
    separator
    log_info "Bot updated and running!"
    show_status
}

cmd_logs() {
    show_logs
}

cmd_status() {
    show_status
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "$1" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    update)  cmd_update ;;
    logs)    cmd_logs ;;
    status)  cmd_status ;;
    *)
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════╗${NC}"
        echo -e "${GREEN}║       🎮 Raid Bot Manager        ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════╝${NC}"
        echo ""
        echo "Usage: ./update.sh [command]"
        echo ""
        echo "Commands:"
        echo -e "  ${CYAN}start${NC}     - Pull, build & start bot"
        echo -e "  ${CYAN}stop${NC}      - Stop bot"
        echo -e "  ${CYAN}restart${NC}   - Restart bot"
        echo -e "  ${CYAN}update${NC}    - Full update (pull, build, backup, restart)"
        echo -e "  ${CYAN}logs${NC}      - Show bot logs"
        echo -e "  ${CYAN}status${NC}    - Show bot status"
        echo ""
        ;;
esac
