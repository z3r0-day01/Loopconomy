#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MAIN_DIR/.bot.pid"
LOG_FILE="$MAIN_DIR/bot.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

PROMPT="${GREEN}loop${NC}@${CYAN}bot${NC}:${YELLOW}~${NC}$ "
BOT_NAME="Loopconomy OS"
BOT_VERSION="Beta 2"

get_pid() {
    [ -f "$PID_FILE" ] && cat "$PID_FILE"
}

is_running() {
    local pid=$(get_pid)
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

tprint() {
    printf '%b\n' "$1"
}

clear_line() {
    printf '\r\033[K'
}

print_banner() {
    clear
    echo -e "${MAGENTA}"
    cat <<'EOF'
    ██╗    ██╗███████╗██████╗  ██████╗ ███████╗
    ██║    ██║██╔════╝██╔══██╗██╔═══██╗██╔════╝
    ██║ █╗ ██║█████╗  ██████╔╝██║   ██║███████╗
    ██║███╗██║██╔══╝  ██╔══██╗██║   ██║╚════██║
    ╚███╔███╔╝███████╗██████╔╝╚██████╔╝███████║
     ╚══╝╚══╝ ╚══════╝╚═════╝  ╚═════╝ ╚══════╝
EOF
    echo -e "${NC}"
    echo -e "  ${BOLD}${BOT_NAME} v${BOT_VERSION}${NC}"
    echo -e "  ${DIM}Type 'help' for commands${NC}"
    echo ""
}

show_status() {
    if is_running; then
        local pid=$(get_pid)
        local uptime=$(ps -o etime= -p "$pid" 2>/dev/null || echo "?")
        echo -e "  ${GREEN}● RUNNING${NC}  PID: $pid  Uptime: $uptime"
    else
        echo -e "  ${RED}● STOPPED${NC}"
    fi
}

cmd_help() {
    echo -e "${BOLD}Available Commands:${NC}"
    echo ""
    echo -e "  ${CYAN}Bot Control${NC}"
    echo -e "    start          Start the bot"
    echo -e "    stop           Stop the bot"
    echo -e "    restart        Restart the bot"
    echo -e "    status         Check bot status"
    echo ""
    echo -e "  ${CYAN}Logs${NC}"
    echo -e "    logs           View recent logs"
    echo -e "    tail           Follow logs (Ctrl+C to exit)"
    echo ""
    echo -e "  ${CYAN}Database${NC}"
    echo -e "    db status       Check database connection"
    echo -e "    db users        List top users"
    echo -e "    db backup       Backup database"
    echo -e "    db query        Run SQL query"
    echo ""
    echo -e "  ${CYAN}System${NC}"
    echo -e "    update          Pull latest from git"
    echo -e "    install         Run installer"
    echo -e "    clear           Clear screen"
    echo -e "    exit            Exit"
    echo ""
}

cmd_start() {
    if is_running; then
        tprint "${YELLOW}Bot is already running!${NC}"
        return
    fi
    cd "$MAIN_DIR"
    nohup node main.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 1
    if is_running; then
        tprint "${GREEN}✓ Bot started (PID: $(get_pid))${NC}"
    else
        tprint "${RED}✗ Failed to start${NC}"
        rm -f "$PID_FILE"
    fi
}

cmd_stop() {
    if ! is_running; then
        tprint "${YELLOW}Bot is not running${NC}"
        return
    fi
    local pid=$(get_pid)
    kill "$pid" 2>/dev/null
    sleep 2
    kill -9 "$pid" 2>/dev/null
    rm -f "$PID_FILE"
    tprint "${GREEN}✓ Bot stopped${NC}"
}

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

cmd_status() {
    show_status
}

cmd_logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -30 "$LOG_FILE"
    else
        tprint "${YELLOW}No logs found${NC}"
    fi
}

cmd_tail() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        tprint "${YELLOW}No logs found${NC}"
    fi
}

cmd_db() {
    local subcmd="$1"
    
    case "$subcmd" in
        status)
            if [ ! -f "$MAIN_DIR/.env" ]; then
                tprint "${RED}✗ .env not found${NC}"
                return
            fi
            source "$MAIN_DIR/.env"
            if [ -z "$DATABASE_URL" ]; then
                tprint "${RED}✗ DATABASE_URL not set${NC}"
                return
            fi
            if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
                tprint "${GREEN}✓ Database connected${NC}"
                local users=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM economy" 2>/dev/null | tr -d ' ')
                local total=$(psql "$DATABASE_URL" -t -c "SELECT COALESCE(SUM(coins),0) FROM economy" 2>/dev/null | tr -d ' ')
                echo "  Users: $users  Total coins: $total"
            else
                tprint "${RED}✗ Connection failed${NC}"
            fi
            ;;
        users)
            if [ -f "$MAIN_DIR/.env" ]; then
                source "$MAIN_DIR/.env"
                [ -n "$DATABASE_URL" ] && psql "$DATABASE_URL" -c "SELECT uid, coins FROM economy ORDER BY coins DESC LIMIT 15;" 2>/dev/null
            fi
            ;;
        backup)
            if [ -f "$MAIN_DIR/.env" ]; then
                source "$MAIN_DIR/.env"
                [ -n "$DATABASE_URL" ] || return
                mkdir -p "$MAIN_DIR/backups"
                local f="$MAIN_DIR/backups/backup_$(date +%Y%m%d_%H%M%S).sql"
                if pg_dump "$DATABASE_URL" > "$f" 2>/dev/null; then
                    tprint "${GREEN}✓ Backup: $(basename $f)${NC}"
                else
                    tprint "${RED}✗ Backup failed${NC}"
                fi
            fi
            ;;
        query)
            shift
            local q="$*"
            if [ -f "$MAIN_DIR/.env" ]; then
                source "$MAIN_DIR/.env"
                [ -n "$DATABASE_URL" ] && psql "$DATABASE_URL" -c "$q" 2>&1
            fi
            ;;
        *)
            echo "Usage: db [status|users|backup|query <sql>]"
            ;;
    esac
}

cmd_update() {
    cd "$MAIN_DIR"
    if git pull origin beta2 2>&1; then
        tprint "${GREEN}✓ Updated${NC}"
        [ -d "node_modules" ] && npm install &>/dev/null &
        if is_running; then
            tprint "${YELLOW}Restarting bot...${NC}"
            cmd_restart
        fi
    else
        tprint "${RED}✗ Update failed${NC}"
    fi
}

cmd_clear() {
    clear
}

cmd_exit() {
    tprint "${DIM}Goodbye!${NC}"
    exit 0
}

run_command() {
    local cmd="$1"
    shift
    
    case "$cmd" in
        help|h|\?) cmd_help ;;
        start|s) cmd_start ;;
        stop|p) cmd_stop ;;
        restart|r) cmd_restart ;;
        status|stat) cmd_status ;;
        logs|l) cmd_logs ;;
        tail|t) cmd_tail ;;
        db) cmd_db "$@" ;;
        update|u) cmd_update ;;
        install) cd "$SCRIPT_DIR" && ./install.sh ;;
        clear|cls) cmd_clear ;;
        exit|quit|q) cmd_exit ;;
        *) tprint "${RED}Unknown command: $cmd${NC}  (type 'help' for commands)" ;;
    esac
}

main() {
    trap 'tput cnorm; echo' EXIT
    
    tput civis 2>/dev/null
    
    print_banner
    show_status
    echo ""
    
    while true; do
        printf '%b ' "$PROMPT"
        read -r cmd || break
        
        clear_line
        
        [ -z "$cmd" ] && continue
        
        run_command $cmd
        echo ""
    done
}

main "$@"
