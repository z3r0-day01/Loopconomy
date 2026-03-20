#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_DIR="$(dirname "$SCRIPT_DIR")"
LOCK_FILE="$MAIN_DIR/.bot.lock"
PID_FILE="$MAIN_DIR/.watchdog.pid"
BOT_PID_FILE="$MAIN_DIR/.bot.pid"
LOG_FILE="$MAIN_DIR/logs/watchdog.log"
CMD_PIPE="$MAIN_DIR/.watchdog.cmd"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

is_bot_running() {
    [ -f "$BOT_PID_FILE" ] && kill -0 "$(cat "$BOT_PID_FILE")" 2>/dev/null
}

get_bot_pid() {
    [ -f "$BOT_PID_FILE" ] && cat "$BOT_PID_FILE"
}

start_bot() {
    if is_bot_running; then
        log "Bot is already running (PID: $(get_bot_pid))"
        return 0
    fi

    log "Starting bot..."
    cd "$MAIN_DIR"
    nohup node index.js > /dev/null 2>&1 &
    sleep 2

    if is_bot_running; then
        log "Bot started successfully (PID: $(get_bot_pid))"
        return 0
    else
        log "Failed to start bot"
        return 1
    fi
}

stop_bot() {
    local bot_pid
    bot_pid=$(get_bot_pid)
    if [ -n "$bot_pid" ] && kill -0 "$bot_pid" 2>/dev/null; then
        log "Stopping bot (PID: $bot_pid)..."
        kill "$bot_pid" 2>/dev/null
        sleep 1
        if kill -0 "$bot_pid" 2>/dev/null; then
            kill -9 "$bot_pid" 2>/dev/null
        fi
        rm -f "$BOT_PID_FILE"
        log "Bot stopped"
    else
        rm -f "$BOT_PID_FILE"
        log "Bot was not running"
    fi
}

start_watchdog() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Watchdog is already running (PID: $(cat "$PID_FILE"))"
        return 1
    fi

    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$(dirname "$CMD_PIPE")"

    if [ ! -p "$CMD_PIPE" ]; then
        mkfifo "$CMD_PIPE"
    fi

    log "Starting watchdog daemon..."

    (
        while true; do
            if read -t 5 cmd < "$CMD_PIPE" 2>/dev/null; then
                case "$cmd" in
                    /start)
                        if is_bot_running; then
                            log "Received /start - bot already running"
                            echo "Bot is already running"
                        else
                            log "Received /start - starting bot"
                            start_bot
                            if is_bot_running; then
                                echo "Bot started successfully"
                            else
                                echo "Error: Bot Offline. Try again later!"
                            fi
                        fi
                        ;;
                    /stop)
                        log "Received /stop - stopping bot"
                        stop_bot
                        echo "Bot stopped"
                        ;;
                    *)
                        log "Unknown command: $cmd"
                        ;;
                esac
            fi

            if ! is_bot_running && [ -f "$LOCK_FILE" ]; then
                log "Bot process died, removing lock file"
                rm -f "$LOCK_FILE"
            fi
        done
    ) &

    echo $! > "$PID_FILE"
    log "Watchdog started (PID: $(cat "$PID_FILE"))"
    echo "Watchdog started (PID: $(cat "$PID_FILE"))"
}

stop_watchdog() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Watchdog is not running"
        return 1
    fi

    local watchdog_pid
    watchdog_pid=$(cat "$PID_FILE")

    if ! kill -0 "$watchdog_pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        echo "Watchdog is not running"
        return 1
    fi

    stop_bot
    kill "$watchdog_pid" 2>/dev/null
    rm -f "$PID_FILE"
    rm -f "$CMD_PIPE"
    log "Watchdog stopped"
    echo "Watchdog stopped"
}

status_watchdog() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Watchdog is not running"
        return 1
    fi

    local watchdog_pid
    watchdog_pid=$(cat "$PID_FILE")

    if ! kill -0 "$watchdog_pid" 2>/dev/null; then
        echo "Watchdog is not running (stale PID file)"
        rm -f "$PID_FILE"
        return 1
    fi

    echo "Watchdog is running (PID: $watchdog_pid)"

    if is_bot_running; then
        echo "Bot is running (PID: $(get_bot_pid))"
    else
        echo "Bot is not running"
    fi
}

case "$1" in
    start)
        start_watchdog
        ;;
    stop)
        stop_watchdog
        ;;
    status)
        status_watchdog
        ;;
    /start)
        if [ -p "$CMD_PIPE" ]; then
            echo "/start" > "$CMD_PIPE"
        else
            if is_bot_running; then
                echo "Bot is already running"
            else
                start_bot
                if is_bot_running; then
                    echo "Bot started successfully"
                else
                    echo "Error: Bot Offline. Try again later!"
                fi
            fi
        fi
        ;;
    /stop)
        if [ -p "$CMD_PIPE" ]; then
            echo "/stop" > "$CMD_PIPE"
        else
            stop_bot
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|status|/start|/stop}"
        ;;
esac