#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const BOT_ROOT = '/home/z3r0/loop/main';
const API_URL = 'http://localhost:8080';

let state = {
    mode: 'normal',
    authenticated: false,
    username: 'guest',
    password: '',
    currentServer: 'main',
    servers: [{ name: 'Dev', id: 'main', online: true }],
    history: [],
    historyIndex: -1,
    nexon: []
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

function apiCall(endpoint, method = 'GET', body = null) {
    const curl = ['curl', '-s', '-X', method];
    if (state.authenticated) {
        curl.push('-u', `${state.username}:${state.password}`);
    }
    if (body) {
        curl.push('-H', 'Content-Type: application/json');
        curl.push('-d', JSON.stringify(body));
    }
    curl.push(`${API_URL}${endpoint}`);
    try {
        const result = execSync(curl.join(' '), { encoding: 'utf8' });
        return JSON.parse(result);
    } catch (e) {
        return { error: e.message };
    }
}

function apiCallRaw(endpoint, method = 'GET', body = null) {
    const curl = ['curl', '-s', '-X', method];
    if (state.authenticated) {
        curl.push('-u', `${state.username}:${state.password}`);
    }
    if (body) {
        curl.push('-H', 'Content-Type: application/json');
        curl.push('-d', JSON.stringify(body));
    }
    curl.push(`${API_URL}${endpoint}`);
    try {
        return execSync(curl.join(' '), { encoding: 'utf8' });
    } catch (e) {
        return `Error: ${e.message}`;
    }
}

function getTime() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function getPrompt() {
    const time = getTime();
    switch (state.mode) {
        case 'login':
            return `${COLORS.yellow}Login: ${COLORS.reset}`;
        case 'nesh':
        case 'nes':
            return `${COLORS.cyan}Eden(${time}): ${COLORS.reset}`;
        case 'nec':
            return `${COLORS.magenta}NeC> ${COLORS.reset}`;
        case 'nexe':
            return `${COLORS.green}NeXe> ${COLORS.reset}`;
        default:
            return `${COLORS.green}LOOP(${time})${COLORS.white}[${state.username}@${state.currentServer}]:${COLORS.reset} `;
    }
}

async function handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (state.mode === 'login') {
        if (!state.username || state.username === 'guest') {
            state.username = cmd.trim();
            if (state.username) {
                process.stdout.write(`${COLORS.yellow}Password: ${COLORS.reset}`);
                state.mode = 'login_password';
            }
            return;
        }
    }

    if (state.mode === 'login_password') {
        state.password = cmd.trim();
        const result = apiCall('/api/login', 'POST', { username: state.username, password: state.password });
        if (result.token || result.success) {
            state.authenticated = true;
            state.mode = 'normal';
            console.log(`${COLORS.green}Login successful!${COLORS.reset}`);
        } else {
            console.log(`${COLORS.red}Login failed: ${result.error || 'Invalid credentials'}${COLORS.reset}`);
            state.username = 'guest';
            state.password = '';
        }
        return;
    }

    if (command === '') return;

    switch (command) {
        case 'help':
        case '?':
            console.log(`
${COLORS.cyan}╔════════════════════════════════════════╗${COLORS.reset}
${COLORS.cyan}║           LUMA Commands                ║${COLORS.reset}
${COLORS.cyan}╚════════════════════════════════════════╝${COLORS.reset}

${COLORS.yellow}Auth:${COLORS.reset}
  login <user>  - Login (then enter password)
  logout        - Logout
  
${COLORS.yellow}Bot Control:${COLORS.reset}
  status        - Bot status
  start         - Start bot
  stop          - Stop bot  
  restart       - Restart bot
  logs [n]      - View logs (default 50 lines)
  
${COLORS.yellow}Messaging:${COLORS.reset}
  say <msg>     - Send message to channel
  broadcast    - Broadcast to all servers
  
${COLORS.yellow}Server:${COLORS.reset}
  servers      - List servers
  connect <id> - Connect to server
  
${COLORS.yellow}Filesystem:${COLORS.reset}
  ls [path]     - List files
  cat <file>    - Read file
  mkdir <dir>  - Create directory
  touch <file> - Create file
  rm <path>     - Remove file/dir
  
${COLORS.yellow}System:${COLORS.reset}
  whoami        - Current user
  pwd           - Working directory
  date          - Current date/time
  uname         - System info
  hostname      - Hostname
  
${COLORS.yellow}Modes:${COLORS.reset}
  ne            - Enter Neon Shell (NeSH)
  nec           - Enter Neon-Carbon BASIC
  nexe          - Enter Neon Xenon
  
${COLORS.yellow}Other:${COLORS.reset}
  clear         - Clear screen
  exit/quit     - Exit LUMA
  sh <cmd>      - Run shell command
`);
            break;

        case 'login':
            if (args.length === 0) {
                process.stdout.write(`${COLORS.yellow}Username: ${COLORS.reset}`);
                state.mode = 'login';
            } else {
                state.username = args[0];
                process.stdout.write(`${COLORS.yellow}Password: ${COLORS.reset}`);
                state.mode = 'login_password';
            }
            break;

        case 'logs':
            const lines = args[0] || 50;
            const logPath = path.join(BOT_ROOT, 'bot.log');
            if (fs.existsSync(logPath)) {
                const content = fs.readFileSync(logPath, 'utf8');
                const logLines = content.split('\n').slice(-lines);
                console.log(logLines.join('\n'));
            } else {
                console.log(`${COLORS.red}No logs found.${COLORS.reset}`);
            }
            break;

        case 'say':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: say <message>${COLORS.reset}`);
                return;
            }
            const sayResult = apiCall('/api/shell/say', 'POST', { message: args.join(' '), server_id: state.currentServer });
            console.log(sayResult.output || sayResult.error || 'Message sent.');
            break;

        case 'broadcast':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: broadcast <message>${COLORS.reset}`);
                return;
            }
            const broadResult = apiCall('/api/shell/broadcast', 'POST', { message: args.join(' ') });
            console.log(broadResult.output || broadResult.error || 'Broadcast sent.');
            break;

        case 'servers':
            console.log(`${COLORS.cyan}Available servers:${COLORS.reset}`);
            for (const server of state.servers) {
                const status = server.online ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.red}○${COLORS.reset}`;
                console.log(`  ${status} ${server.name} (${server.id})${server.id === state.currentServer ? ' (current)' : ''}`);
            }
            break;

        case 'connect':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: connect <server-id>${COLORS.reset}`);
                return;
            }
            const server = state.servers.find(s => s.id === args[0]);
            if (server) {
                state.currentServer = args[0];
                console.log(`${COLORS.green}Connected to server: ${args[0]}${COLORS.reset}`);
            } else {
                console.log(`${COLORS.red}Server not found.${COLORS.reset}`);
            }
            break;

        case 'ls':
            const lsPath = args.length > 0 ? path.join(BOT_ROOT, args.join('/')) : BOT_ROOT;
            try {
                const items = fs.readdirSync(lsPath);
                for (const item of items.sort()) {
                    const itemPath = path.join(lsPath, item);
                    const stat = fs.statSync(itemPath);
                    const color = stat.isDirectory() ? COLORS.cyan : COLORS.white;
                    console.log(`${color}${item}${COLORS.reset}${stat.isDirectory() ? '/' : ''}`);
                }
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'cat':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: cat <file>${COLORS.reset}`);
                return;
            }
            const catPath = path.join(BOT_ROOT, args.join('/'));
            try {
                console.log(fs.readFileSync(catPath, 'utf8'));
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'mkdir':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: mkdir <directory>${COLORS.reset}`);
                return;
            }
            const mkdirPath = path.join(BOT_ROOT, args.join('/'));
            try {
                fs.mkdirSync(mkdirPath, { recursive: true });
                console.log(`${COLORS.green}Created: ${args.join('/')}${COLORS.reset}`);
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'touch':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: touch <file>${COLORS.reset}`);
                return;
            }
            const touchPath = path.join(BOT_ROOT, args.join('/'));
            try {
                fs.closeSync(fs.openSync(touchPath, 'a'));
                console.log(`${COLORS.green}Created: ${args.join('/')}${COLORS.reset}`);
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'rm':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: rm <path>${COLORS.reset}`);
                return;
            }
            const rmPath = path.join(BOT_ROOT, args.join('/'));
            try {
                const stat = fs.statSync(rmPath);
                if (stat.isDirectory()) {
                    fs.rmSync(rmPath, { recursive: true });
                } else {
                    fs.unlinkSync(rmPath);
                }
                console.log(`${COLORS.green}Removed: ${args.join('/')}${COLORS.reset}`);
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'whoami':
            console.log(state.username);
            break;

        case 'pwd':
            console.log('/home/eden');
            break;

        case 'date':
            console.log(new Date().toFormatString || new Date().toString());
            break;

        case 'uname':
            console.log('EdenOS v1.1.2-r2-1');
            break;

        case 'hostname':
            console.log('eden.local');
            break;

        case 'clear':
        case 'cls':
            console.clear();
            break;

        case 'ne':
            state.mode = 'nesh';
            console.log(`${COLORS.cyan}Entered Neon Shell (NeSH). Type 'exit' to return.${COLORS.reset}`);
            break;

        case 'nec':
            state.mode = 'nec';
            console.log(`${COLORS.magenta}Entered Neon-Carbon BASIC.${COLORS.reset}`);
            console.log(`${COLORS.magenta}Commands: EDIT, LIST, RUN, NEW, CLEAR${COLORS.reset}`);
            break;

        case 'nexe':
            state.mode = 'nexe';
            console.log(`${COLORS.green}Neon Xenon Graphics Mode${COLORS.reset}`);
            console.log(`${COLORS.green}(Limited terminal graphics available)${COLORS.reset}`);
            break;

        case 'sh':
            if (args.length === 0) {
                console.log(`${COLORS.red}Usage: sh <command>${COLORS.reset}`);
                return;
            }
            try {
                console.log(execSync(args.join(' '), { encoding: 'utf8', cwd: BOT_ROOT }));
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
            break;

        case 'exit':
        case 'quit':
        case 'q':
            console.log(`${COLORS.yellow}Use Ctrl+C to exit LUMA.${COLORS.reset}`);
            break;

        default:
            console.log(`${COLORS.red}Unknown command: ${command}. Type 'help' for available commands.${COLORS.reset}`);
    }
}

function handleNeSH(cmd) {
    if (cmd.trim() === 'exit') {
        state.mode = 'normal';
        console.log(`${COLORS.green}Exited NeSH.${COLORS.reset}`);
        return;
    }
    
    if (cmd.includes('|')) {
        const parts = cmd.split('|');
        let result = '';
        for (const part of parts) {
            const cmdPart = part.trim();
            result = apiCallRaw('/api/shell/exec', 'POST', { 
                command: cmdPart, 
                server_id: state.currentServer,
                args: cmdPart 
            });
        }
        console.log(result);
    } else if (cmd.startsWith('interface ')) {
        const mode = cmd.split(' ')[1]?.toLowerCase();
        if (mode === 'ne') { state.mode = 'nesh'; console.log('Switched to NeSH'); }
        else if (mode === 'nes') { state.mode = 'nes'; console.log('Switched to NeS'); }
        else if (mode === 'nec') { state.mode = 'nec'; console.log('Switched to NeC'); }
        else if (mode === 'nexe') { state.mode = 'nexe'; console.log('Switched to NeXe'); }
        else console.log(`${COLORS.red}Usage: interface <Ne/NeS/NeC/NeXe>${COLORS.reset}`);
    } else if (cmd.startsWith('SET_ENV ') || cmd.startsWith('SET_CMD ') || cmd.startsWith('LNK_ENV ')) {
        console.log(`${COLORS.yellow}(NeSH environment command - stored)${COLORS.reset}`);
    } else {
        const result = apiCallRaw('/api/shell/exec', 'POST', { 
            command: cmd, 
            server_id: state.currentServer,
            args: cmd 
        });
        console.log(result);
    }
}

function handleNeC(cmd) {
    const c = cmd.trim().toUpperCase();
    
    if (c === 'NEW' || c === 'CLEAR') {
        console.log(`${COLORS.yellow}Program cleared.${COLORS.reset}`);
    } else if (c === 'LIST') {
        console.log(`${COLORS.yellow}(No program loaded)${COLORS.reset}`);
    } else if (c === 'RUN') {
        console.log(`${COLORS.green}Running...${COLORS.reset}`);
    } else if (c === 'EDIT') {
        console.log(`${COLORS.yellow}Editor mode (not implemented in CLI)${COLORS.reset}`);
    } else if (c.startsWith('PRINT') || c.startsWith('O:')) {
        console.log(`${COLORS.cyan}Output: ${cmd.replace(/^(PRINT|O:)\s*/i, '')}${COLORS.reset}`);
    } else if (c.startsWith('GOTO') || c === 'END') {
        console.log(`${COLORS.yellow}(BASIC command - no-op in CLI)${COLORS.reset}`);
    } else if (c === 'EXIT') {
        state.mode = 'normal';
        console.log(`${COLORS.green}Exited NeC.${COLORS.reset}`);
    } else {
        console.log(`${COLORS.gray}NeC BASIC: ${cmd}${COLORS.reset}`);
    }
}

function handleNeXe(cmd) {
    if (cmd.trim() === 'exit' || cmd.trim() === 'quit') {
        state.mode = 'normal';
        console.log(`${COLORS.green}Exited NeXe.${COLORS.reset}`);
        return;
    }
    
    console.log(`${COLORS.green}NeXe Desktop Mode${COLORS.reset}`);
    console.log(`
${COLORS.cyan}Window Management:${COLORS.reset}
  apps              - List applications
  taskbar           - Show taskbar
  processes         - Show process list
  network           - Show network info
  files             - File manager
  calculator        - Calculator
  terminal          - Terminal
  settings          - Settings
  exit              - Exit to normal mode
`);
}

async function main() {
    console.clear();
    console.log(`${COLORS.cyan}
╔════════════════════════════════════════╗
║         LUMA v2.0 (Node.js)             ║
║   Loopconomy Unified Manager App        ║
╚════════════════════════════════════════╝${COLORS.reset}

Type ${COLORS.green}help${COLORS.reset} for available commands.
Login with: ${COLORS.yellow}login <username>${COLORS.reset}
`);

    rl.on('line', async (line) => {
        const cmd = line.trim();
        
        if (cmd) {
            state.history.push(cmd);
            state.historyIndex = state.history.length;
            
            try {
                if (state.mode === 'nesh' || state.mode === 'nes') {
                    await handleNeSH(cmd);
                } else if (state.mode === 'nec') {
                    handleNeC(cmd);
                } else if (state.mode === 'nexe') {
                    handleNeXe(cmd);
                } else {
                    await handleCommand(cmd);
                }
            } catch (e) {
                console.log(`${COLORS.red}Error: ${e.message}${COLORS.reset}`);
            }
        }
        
        process.stdout.write(getPrompt());
    });

    process.stdout.write(getPrompt());

    process.on('SIGINT', () => {
        console.log(`\n${COLORS.yellow}LUMA exited.${COLORS.reset}`);
        process.exit(0);
    });
}

main();
