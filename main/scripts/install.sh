#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

clear_screen() {
    clear
}

print_banner() {
    clear_screen
    echo -e "${MAGENTA}"
    cat <<'EOF'
 ██████╗ ███████╗████████╗██████╗  ██████╗       ██╗    ██╗ █████╗ ███╗   ██╗██████╗ 
██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔═══██╗      ██║    ██║██╔══██╗████╗  ██║██╔══██╗
██║   ██║█████╗     ██║   ██████╔╝██║   ██║      ██║ █╗ ██║███████║██╔██╗ ██║██║  ██║
██║   ██║██╔══╝     ██║   ██╔══██╗██║   ██║      ██║███╗██║██╔══██║██║╚██╗██║██║  ██║
╚██████╔╝███████╗   ██║   ██║  ██║╚██████╔╝      ╚███╔███╔╝██║  ██║██║ ╚████║██████╔╝
 ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝       ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ 
EOF
    echo -e "${NC}"
    echo -e "${CYAN}${BOLD}                    Loopconomy Bot Installer${NC}"
    echo -e "${BLUE}                    Version 1.0.0 | Beta 2${NC}"
    echo ""
}

pause() {
    echo ""
    read -p "Press Enter to continue..."
}

check_dependencies() {
    print_banner
    echo -e "${YELLOW}${BOLD}[1/7] Checking Dependencies...${NC}"
    echo ""

    local missing=0

    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ $NODE_VERSION -lt 16 ]; then
            echo -e "${RED}✗${NC} Node.js version 16+ required. Found $(node -v)"
            missing=1
        else
            echo -e "${GREEN}✓${NC} Node.js: $(node -v)"
        fi
    else
        echo -e "${RED}✗${NC} Node.js not found"
        missing=1
    fi

    if command -v npm &> /dev/null; then
        echo -e "${GREEN}✓${NC} npm: $(npm -v)"
    else
        echo -e "${RED}✗${NC} npm not found"
        missing=1
    fi

    if command -v psql &> /dev/null; then
        echo -e "${GREEN}✓${NC} PostgreSQL client: Available"
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL client: Not found (will skip DB setup)"
    fi

    if command -v git &> /dev/null; then
        echo -e "${GREEN}✓${NC} Git: $(git --version)"
    else
        echo -e "${YELLOW}⚠${NC} Git: Not found (auto-update disabled)"
    fi

    if [ $missing -eq 1 ]; then
        echo ""
        echo -e "${RED}${BOLD}Missing required dependencies. Please install them and try again.${NC}"
        exit 1
    fi

    pause
}

get_credentials() {
    print_banner
    echo -e "${YELLOW}${BOLD}[2/7] Configuration${NC}"
    echo ""

    cd "$MAIN_DIR"

    if [ -f .env ]; then
        echo -e "${YELLOW}Existing .env found.${NC}"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Keeping existing configuration."
            return 0
        fi
    fi

    echo -e "${CYAN}Enter your Discord bot credentials:${NC}"
    echo ""

    local valid_token=false
    while [ $valid_token = false ]; do
        read -p "Bot Token: " BOT_TOKEN
        if [ -n "$BOT_TOKEN" ]; then
            valid_token=true
        else
            echo -e "${RED}Token cannot be empty.${NC}"
        fi
    done

    read -p "Client ID: " CLIENT_ID

    local valid_db=false
    while [ $valid_db = false ]; do
        read -p "PostgreSQL URL (postgres://user:pass@localhost/db): " DATABASE_URL
        if [ -n "$DATABASE_URL" ]; then
            valid_db=true
        else
            echo -e "${RED}Database URL cannot be empty.${NC}"
        fi
    done

    read -p "Tax Collector User ID (optional): " TAX_COLLECTOR_ID

    cat > .env <<EOF
BOT_TOKEN=$BOT_TOKEN
CLIENT_ID=$CLIENT_ID
DATABASE_URL=$DATABASE_URL
TAX_COLLECTOR_ID=$TAX_COLLECTOR_ID
EOF

    echo -e "${GREEN}✓${NC} Configuration saved to .env"
    pause
}

install_dependencies() {
    print_banner
    echo -e "${YELLOW}${BOLD}[3/7] Installing Dependencies...${NC}"
    echo ""

    cd "$MAIN_DIR"

    echo "Installing npm packages..."
    npm install discord.js @discordjs/rest discord-api-types pg ts-node dotenv 2>&1 | while IFS= read -r line; do
        echo -e "\r  $line"
    done

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Dependencies installed successfully"
    else
        echo -e "${RED}✗${NC} Failed to install dependencies"
        exit 1
    fi

    pause
}

setup_directories() {
    print_banner
    echo -e "${YELLOW}${BOLD}[4/7] Setting Up Directories...${NC}"
    echo ""

    cd "$MAIN_DIR"

    mkdir -p commands addons notes scripts

    echo -e "${GREEN}✓${NC} Directories created"

    if [ ! -f addons/manifest.json ]; then
        cat > addons/manifest.json <<'EOF'
{
    "addons": {}
}
EOF
        echo -e "${GREEN}✓${NC} Root manifest created"
    fi

    pause
}

setup_database() {
    print_banner
    echo -e "${YELLOW}${BOLD}[5/7] Database Setup${NC}"
    echo ""

    cd "$MAIN_DIR"

    cat > schema.sql <<'EOF'
-- Grant usage on public schema if needed
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT CREATE ON SCHEMA public TO PUBLIC;

CREATE TABLE IF NOT EXISTS economy (
    uid VARCHAR(20) PRIMARY KEY,
    coins BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warnings (
    id SERIAL PRIMARY KEY,
    uid VARCHAR(20),
    reason TEXT,
    ts TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cooldowns (
    uid VARCHAR(20),
    command VARCHAR(50),
    last_used TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (uid, command)
);

-- Grant permissions on tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
EOF

    echo -e "Schema file created: ${GREEN}✓${NC}"

    if command -v psql &> /dev/null; then
        if [ -n "$DATABASE_URL" ]; then
            echo ""
            echo -e "${CYAN}PostgreSQL is available. Run schema now?${NC}"
            read -p "Apply schema to database? (Y/n): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                # First try to grant schema permissions
                psql "$DATABASE_URL" -c "GRANT USAGE ON SCHEMA public TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;" 2>/dev/null || true
                
                if psql "$DATABASE_URL" -f schema.sql 2>&1; then
                    echo -e "${GREEN}✓${NC} Database schema applied"
                else
                    echo -e "${YELLOW}⚠${NC} Schema apply failed (table may already exist or no permissions)"
                    echo -e "${YELLOW}  Your database user may need superuser privileges.${NC}"
                    echo -e "${CYAN}  Options:${NC}"
                    echo "    1. Ask your DB admin to run: GRANT ALL ON SCHEMA public TO your_user"
                    echo "    2. Or manually run: psql \$DATABASE_URL -f schema.sql"
                fi
            else
                echo "Skipped. Run manually: psql \$DATABASE_URL -f schema.sql"
            fi
        fi
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL client not found."
        echo "  Please run schema.sql manually: psql \$DATABASE_URL -f schema.sql"
    fi

    pause
}

setup_autostart() {
    print_banner
    echo -e "${YELLOW}${BOLD}[6/7] Auto-Start Setup (Optional)${NC}"
    echo ""

    if [ "$(uname)" != "Linux" ]; then
        echo -e "${YELLOW}Auto-start is only available on Linux.${NC}"
        pause
        return 0
    fi

    echo "This will create a systemd service to run the bot on boot."
    echo ""

    read -p "Enable auto-start? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Bot install path [/home/z3r0/loop/main]: " INSTALL_PATH
        INSTALL_PATH=${INSTALL_PATH:-/home/z3r0/loop/main}

        cat > loopconomy.service <<EOF
[Unit]
Description=Loopconomy Discord Bot
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_PATH
ExecStart=$(which node) main.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

        echo -e "${GREEN}✓${NC} Service file created: loopconomy.service"
        echo ""
        echo "To enable auto-start, run:"
        echo -e "  ${CYAN}sudo cp loopconomy.service /etc/systemd/system/${NC}"
        echo -e "  ${CYAN}sudo systemctl daemon-reload${NC}"
        echo -e "  ${CYAN}sudo systemctl enable loopconomy${NC}"
    else
        echo "Auto-start disabled."
    fi

    pause
}

finalize() {
    print_banner
    echo -e "${YELLOW}${BOLD}[7/7] Complete!${NC}"
    echo ""

    cd "$MAIN_DIR"

    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Installation Complete!          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Run: cd $MAIN_DIR"
    echo "  2. Start: node main.js"
    echo "  3. Or use: ./scripts/quickstart.sh"
    echo ""
    echo -e "${YELLOW}Management commands:${NC}"
    echo "  ./scripts/manage.sh      - TUI management"
    echo ""
    echo -e "${BLUE}Docs: ${NC} $MAIN_DIR/DOCS.md"
    echo ""
    read -p "Start the bot now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$MAIN_DIR"
        node main.js
    fi
}

show_menu() {
    print_banner
    echo -e "${CYAN}${BOLD}        ╔════════════════════════════════╗${NC}"
    echo -e "${CYAN}${BOLD}        ║    Loopconomy Setup Menu        ║${NC}"
    echo -e "${CYAN}${BOLD}        ╚════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BOLD}1.${NC} Install / Update"
    echo -e "  ${BOLD}2.${NC} Quick Start (run bot)"
    echo -e "  ${BOLD}3.${NC} Manage Bot (TUI)"
    echo -e "  ${BOLD}4.${NC} View Documentation"
    echo -e "  ${BOLD}5.${NC} Exit"
    echo ""
}

main() {
    if [ "$1" = "--unattended" ]; then
        check_dependencies
        get_credentials
        install_dependencies
        setup_directories
        setup_database
        finalize
        return 0
    fi

    while true; do
        show_menu
        read -p "Select option: " choice
        echo ""

        case $choice in
            1)
                check_dependencies
                get_credentials
                install_dependencies
                setup_directories
                setup_database
                setup_autostart
                finalize
                ;;
            2)
                cd "$MAIN_DIR"
                node main.js
                ;;
            3)
                bash "$SCRIPT_DIR/manage.sh"
                ;;
            4)
                if [ -f "$MAIN_DIR/DOCS.md" ]; then
                    less "$MAIN_DIR/DOCS.md"
                else
                    echo "Documentation not found."
                    pause
                fi
                ;;
            5)
                echo "Goodbye!"
                exit 0
                ;;
            *)
                echo "Invalid option."
                pause
                ;;
        esac
    done
}

main "$@"