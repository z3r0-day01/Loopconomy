#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$MAIN_DIR/.bot.pid"
LOG_FILE="$MAIN_DIR/bot.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    fi
}

is_running() {
    local pid=$(get_pid)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    return 1
}

print_banner() {
    clear
    echo -e "${MAGENTA}"
    cat <<'EOF'
 ╔════════════════════════════════════════╗
 ║        Loopconomy Bot Manager          ║
 ╚════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo -e "${CYAN}${BOLD}                    v1.0.0 | Beta 2${NC}"
    echo ""
}

show_status() {
    echo -e "${CYAN}${BOLD}Bot Status:${NC}"
    echo ""
    
    if is_running; then
        local pid=$(get_pid)
        local uptime=$(ps -o etime= -p "$pid" 2>/dev/null || echo "unknown")
        local cpu=$(ps -o %cpu= -p "$pid" 2>/dev/null || echo "0")
        local mem=$(ps -o %mem= -p "$pid" 2>/dev/null || echo "0")
        
        echo -e "  ${GREEN}● RUNNING${NC}"
        echo -e "  PID: $pid"
        echo -e "  Uptime: $uptime"
        echo -e "  CPU: ${cpu}%"
        echo -e "  Memory: ${mem}%"
        
        if [ -f "$LOG_FILE" ]; then
            local lines=$(wc -l < "$LOG_FILE")
            echo -e "  Log lines: $lines"
        fi
    else
        echo -e "  ${RED}● STOPPED${NC}"
    fi
    echo ""
}

start_bot() {
    if is_running; then
        echo -e "${YELLOW}Bot is already running!${NC}"
        return 1
    fi
    
    cd "$MAIN_DIR"
    
    echo "Starting bot..."
    nohup node main.js >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    sleep 2
    
    if is_running; then
        echo -e "${GREEN}✓ Bot started (PID: $pid)${NC}"
    else
        echo -e "${RED}✗ Bot failed to start${NC}"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop_bot() {
    if ! is_running; then
        echo -e "${YELLOW}Bot is not running.${NC}"
        return 1
    fi
    
    local pid=$(get_pid)
    echo "Stopping bot (PID: $pid)..."
    
    kill "$pid" 2>/dev/null
    
    local count=0
    while kill -0 "$pid" 2>/dev/null && [ $count -lt 30 ]; do
        sleep 1
        echo -n "."
    done
    echo ""
    
    if is_running; then
        echo -e "${YELLOW}Force killing...${NC}"
        kill -9 "$pid" 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    echo -e "${GREEN}✓ Bot stopped${NC}"
}

restart_bot() {
    echo "Restarting bot..."
    stop_bot
    sleep 1
    start_bot
}

view_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo "No log file found."
        return 1
    fi
    
    echo -e "${CYAN}Showing last 50 lines. Ctrl+C to exit.${NC}"
    echo ""
    tail -n 50 -f "$LOG_FILE"
}

view_full_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo "No log file found."
        return 1
    fi
    
    less "$LOG_FILE"
}

clear_logs() {
    if [ -f "$LOG_FILE" ]; then
        read -p "Clear log file? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            > "$LOG_FILE"
            echo -e "${GREEN}✓ Logs cleared${NC}"
        fi
    else
        echo "No logs to clear."
    fi
}

db_status() {
    echo -e "${CYAN}${BOLD}Database Status:${NC}"
    echo ""
    
    cd "$MAIN_DIR"
    
    if [ ! -f .env ]; then
        echo -e "${RED}✗ .env not found${NC}"
        return 1
    fi
    
    source .env
    
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}✗ DATABASE_URL not set${NC}"
        return 1
    fi
    
    if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
        echo -e "${GREEN}✓ Database connected${NC}"
        
        local users=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM economy" 2>/dev/null | tr -d ' ')
        local total=$(psql "$DATABASE_URL" -t -c "SELECT COALESCE(SUM(coins), 0) FROM economy" 2>/dev/null | tr -d ' ')
        
        echo -e "  Users: ${users}"
        echo -e "  Total coins: ${total}"
    else
        echo -e "${RED}✗ Connection failed${NC}"
    fi
    echo ""
}

db_query() {
    cd "$MAIN_DIR"
    
    if [ ! -f .env ]; then
        echo -e "${RED}✗ .env not found${NC}"
        return 1
    fi
    
    source .env
    
    echo -e "${CYAN}Enter SQL query:${NC}"
    read -r query
    
    echo -e "${YELLOW}Executing: $query${NC}"
    
    if psql "$DATABASE_URL" -c "$query" 2>&1; then
        echo -e "${GREEN}✓ Query executed${NC}"
    else
        echo -e "${RED}✗ Query failed${NC}"
    fi
    
    echo ""
    read -p "Press Enter..."
}

db_list_users() {
    cd "$MAIN_DIR"
    
    if [ ! -f .env ]; then
        echo -e "${RED}✗ .env not found${NC}"
        return 1
    fi
    
    source .env
    
    echo -e "${CYAN}${BOLD}Top Users by Balance:${NC}"
    echo ""
    
    psql "$DATABASE_URL" -c "SELECT uid, coins FROM economy ORDER BY coins DESC LIMIT 20;" 2>/dev/null || echo "Failed"
    
    echo ""
    read -p "Press Enter..."
}

db_add_coins() {
    cd "$MAIN_DIR"
    
    if [ ! -f .env ]; then
        echo -e "${RED}✗ .env not found${NC}"
        return 1
    fi
    
    source .env
    
    echo -e "${CYAN}Enter User ID:${NC}"
    read -r uid
    
    echo -e "${CYAN}Enter Amount:${NC}"
    read -r amount
    
    echo -e "${YELLOW}Adding $amount coins to $uid...${NC}"
    
    psql "$DATABASE_URL" -c "INSERT INTO economy (uid, coins) VALUES ('$uid', $amount) ON CONFLICT (uid) DO UPDATE SET coins = economy.coins + $amount;" 2>&1
    
    echo -e "${GREEN}✓ Done${NC}"
    echo ""
    read -p "Press Enter..."
}

db_backup() {
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}PostgreSQL client not found${NC}"
        return 1
    fi
    
    cd "$MAIN_DIR"
    
    if [ -f .env ]; then
        source .env
        
        if [ -n "$DATABASE_URL" ]; then
            mkdir -p backups
            local backup_file="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
            echo "Creating: $backup_file"
            
            if pg_dump "$DATABASE_URL" > "$backup_file" 2>/dev/null; then
                echo -e "${GREEN}✓ Backup created${NC}"
                
                read -p "Compress? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    gzip "$backup_file"
                    echo "Compressed: ${backup_file}.gz"
                fi
            else
                echo -e "${RED}✗ Backup failed${NC}"
            fi
        fi
    fi
}

update_bot() {
    cd "$MAIN_DIR"
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Git not found${NC}"
        return 1
    fi
    
    echo "Pulling updates..."
    
    if git pull origin beta2 2>&1; then
        echo -e "${GREEN}✓ Updates pulled${NC}"
        
        [ -d "node_modules" ] && npm install 2>/dev/null
        
        if is_running; then
            read -p "Restart to apply? (y/N): " -n 1 -r
            echo
            [[ $REPLY =~ ^[Yy]$ ]] && restart_bot
        fi
    else
        echo -e "${RED}✗ Git pull failed${NC}"
    fi
}

run_command() {
    echo -e "${CYAN}Enter shell command:${NC}"
    read -r cmd
    
    echo -e "${YELLOW}Running: $cmd${NC}"
    
    if eval "$cmd" 2>&1; then
        echo -e "${GREEN}✓ Done${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    
    echo ""
    read -p "Press Enter..."
}

show_menu() {
    print_banner
    show_status
    
    echo -e "${CYAN}${BOLD}        ╔════════════════════════════════╗"
    echo "        ║        Management Menu         ║"
    echo -e "        ╚════════════════════════════════╝${NC}"
    echo ""
    
    if is_running; then
        echo -e "  ${GREEN}1.${NC} Stop Bot"
    else
        echo -e "  ${GREEN}1.${NC} Start Bot"
    fi
    echo -e "  ${BOLD}2.${NC} Restart Bot"
    echo -e "  ${BOLD}3.${NC} View Logs"
    echo -e "  ${BOLD}4.${NC} View Full Logs"
    echo -e "  ${BOLD}5.${NC} Clear Logs"
    echo -e "  ${BOLD}6.${NC} Update (git pull)"
    echo ""
    echo -e "${YELLOW}  Database:${NC}"
    echo -e "  ${BOLD}7.${NC} DB Status"
    echo -e "  ${BOLD}8.${NC} DB List Users"
    echo -e "  ${BOLD}9.${NC} DB Query (SQL)"
    echo -e "  ${BOLD}10.${NC} DB Add Coins"
    echo -e "  ${BOLD}11.${NC} DB Backup"
    echo ""
    echo -e "${MAGENTA}  System:${NC}"
    echo -e "  ${BOLD}12.${NC} Run Command"
    echo -e "  ${BOLD}13.${NC} Refresh"
    echo -e "  ${RED}14.${NC} Exit"
    echo ""
}

main() {
    while true; do
        show_menu
        read -p "Select: " choice
        echo ""
        
        case $choice in
            1) is_running && stop_bot || start_bot; echo ""; read -p "Enter..." ;;
            2) restart_bot; echo ""; read -p "Enter..." ;;
            3) view_logs ;;
            4) view_full_logs ;;
            5) clear_logs; echo ""; read -p "Enter..." ;;
            6) update_bot; echo ""; read -p "Enter..." ;;
            7) db_status; read -p "Enter..." ;;
            8) db_list_users ;;
            9) db_query ;;
            10) db_add_coins ;;
            11) db_backup; echo ""; read -p "Enter..." ;;
            12) run_command ;;
            13) continue ;;
            14) echo "Goodbye!"; exit 0 ;;
            *) echo "Invalid."; sleep 1 ;;
        esac
    done
}

main "$@"
