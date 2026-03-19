const { Client, IntentsBitField, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const https = require('https');
require('ts-node').register();
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const IPC_PORT = process.env.IPC_PORT || 8080;
const WEB_PORT = process.env.WEB_PORT || 8080;

if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

// --- Process Lock: Prevent multiple instances ---
const LOCK_FILE = path.join(__dirname, '.bot.lock');
const PID = process.pid.toString();

if (fs.existsSync(LOCK_FILE)) {
    const oldPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    try {
        process.kill(parseInt(oldPid), 0);
        console.error(`❌ Bot already running (PID: ${oldPid}). Exit first or kill the process.`);
        process.exit(1);
    } catch (e) {
        console.log('Stale lock file found. Removing...');
        fs.unlinkSync(LOCK_FILE);
    }
}

fs.writeFileSync(LOCK_FILE, PID);

process.on('exit', () => {
    if (fs.existsSync(LOCK_FILE) && fs.readFileSync(LOCK_FILE, 'utf8') === PID) {
        fs.unlinkSync(LOCK_FILE);
    }
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

// PostgreSQL pool
const pool = new Pool({ connectionString: DATABASE_URL });

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ]
});
client.pool = pool;

// Collections
client.commands = new Collection();
client.addonCommands = new Collection();
client.messageCommands = [];

// --- Web Server ---
const SSL_KEY = path.join(__dirname, 'ssl', 'key.pem');
const SSL_CERT = path.join(__dirname, 'ssl', 'cert.pem');
const MAIN_PAGE = path.join(__dirname, 'MainPage.html');
const AUTH_FILE = path.join(__dirname, 'auth.json');

function loadAuth() {
    try {
        if (fs.existsSync(AUTH_FILE)) {
            return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        }
    } catch (e) {}
    return { username: 'admin', password: 'admin', mustChangePassword: true };
}

function saveAuth(auth) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
}

function checkAuth(authHeader) {
    if (!authHeader || !authHeader.startsWith('Basic ')) return null;
    const encoded = authHeader.slice(6);
    const decoded = Buffer.from(encoded, 'base64').toString();
    const [user, pass] = decoded.split(':');
    const auth = loadAuth();
    if (user === auth.username && pass === auth.password) {
        return { user, mustChange: auth.mustChangePassword };
    }
    return null;
}

function createWebServer() {
    const mimeTypes = {
        '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
    };

    const serverHandler = (req, res) => {
        if (req.url.startsWith('/api/')) {
            if (req.url === '/api/login' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const { username, password } = JSON.parse(body);
                        const auth = loadAuth();
                        if (username === auth.username && password === auth.password) {
                            const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ token, mustChangePassword: auth.mustChangePassword, username: auth.username }));
                        } else {
                            res.writeHead(401, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid credentials' }));
                        }
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid request' }));
                    }
                });
                return;
            }

            if (req.url === '/api/change-password' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const { currentPassword, newPassword, username } = JSON.parse(body);
                        const auth = loadAuth();
                        if (currentPassword !== auth.password || username !== auth.username) {
                            res.writeHead(401, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid credentials' }));
                            return;
                        }
                        auth.password = newPassword;
                        auth.mustChangePassword = false;
                        saveAuth(auth);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid request' }));
                    }
                });
                return;
            }

            if (req.url === '/api/auth-status' && req.method === 'GET') {
                const auth = checkAuth(req.headers.authorization);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(auth ? { authenticated: true, mustChangePassword: auth.mustChange } : { authenticated: false }));
                return;
            }

            if (req.url === '/api/docs' && req.method === 'GET') {
                const docsPath = path.join(__dirname, 'DOCS.md');
                fs.readFile(docsPath, 'utf8', (err, data) => {
                    if (err) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('Documentation not found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/markdown' });
                        res.end(data);
                    }
                });
                return;
            }

            if (req.url === '/api/status') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    temp: Math.floor(Math.random() * 20) + 45,
                    ram: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
                    ping: client.ws.ping,
                    uptime: formatUptime(client.uptime),
                    servers: client.guilds.cache.size,
                    users: client.users.cache.size,
                    commands: client.addonCommands.size + client.commands.size
                }));
                return;
            }

            if (req.url.startsWith('/api/shell/')) {
                const auth = checkAuth(req.headers.authorization);
                if (!auth) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Unauthorized' }));
                    return;
                }
                if (auth.mustChange) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Must change password first' }));
                    return;
                }

                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const data = body ? JSON.parse(body) : {};
                        const endpoint = req.url.replace('/api/shell/', '');

                        switch (endpoint) {
                            case 'say':
                                if (!data.channel || !data.message) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing channel or message' }));
                                    return;
                                }
                                const channel = client.channels.cache.get(data.channel) || client.channels.cache.find(c => c.name === data.channel.replace('#', ''));
                                if (channel) {
                                    await channel.send(data.message);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, message: `Sent to ${data.channel}` }));
                                } else {
                                    res.writeHead(404, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Channel not found' }));
                                }
                                break;
                            case 'broadcast':
                                if (!data.message) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing message' }));
                                    return;
                                }
                                let count = 0;
                                for (const guild of client.guilds.cache.values()) {
                                    const chan = guild.channels.cache.find(c => c.name === 'general' || c.name === 'main');
                                    if (chan) { await chan.send(data.message); count++; }
                                }
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, servers: count }));
                                break;
                            case 'servers':
                                const servers = [];
                                for (const guild of client.guilds.cache.values()) {
                                    servers.push({
                                        id: guild.id,
                                        name: guild.name,
                                        memberCount: guild.memberCount
                                    });
                                }
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ servers }));
                                break;
                            case 'addcoins':
                                if (!data.user || !data.amount) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing user or amount' }));
                                    return;
                                }
                                try {
                                    await pool.query('INSERT INTO economy (uid, coins) VALUES ($1, $2) ON CONFLICT (uid) DO UPDATE SET coins = economy.coins + $2', [data.user, parseInt(data.amount)]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, user: data.user, amount: data.amount }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'removecoins':
                                if (!data.user || !data.amount) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing user or amount' }));
                                    return;
                                }
                                try {
                                    await pool.query('UPDATE economy SET coins = GREATEST(0, coins - $2) WHERE uid = $1', [data.user, parseInt(data.amount)]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, user: data.user, amount: data.amount }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'balance':
                                if (!data.user) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing user' }));
                                    return;
                                }
                                try {
                                    const result = await pool.query('SELECT coins FROM economy WHERE uid = $1', [data.user]);
                                    const coins = result.rows[0]?.coins || 0;
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ user: data.user, coins }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'mute':
                                if (!data.user || !data.time) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing user or time' }));
                                    return;
                                }
                                const timeMatch = data.time.match(/^(\d+)([smhd])$/);
                                if (!timeMatch) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Invalid time format. Use: 30s, 5m, 1h, 1d' }));
                                    return;
                                }
                                const timeValue = parseInt(timeMatch[1]);
                                const timeUnit = timeMatch[2];
                                const minutes = timeUnit === 's' ? timeValue / 60 : timeUnit === 'm' ? timeValue : timeUnit === 'h' ? timeValue * 60 : timeValue * 60 * 24;
                                const guild = client.guilds.cache.first();
                                if (guild) {
                                    const member = await guild.members.fetch(data.user).catch(() => null);
                                    if (member) {
                                        await member.timeout(minutes * 60 * 1000, data.reason || 'Muted via shell');
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: true, user: data.user, time: data.time }));
                                    } else {
                                        res.writeHead(404, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: 'User not found' }));
                                    }
                                } else {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'No guild found' }));
                                }
                                break;
                            case 'unmute':
                                if (!data.user) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Missing user' }));
                                    return;
                                }
                                const guild2 = client.guilds.cache.first();
                                if (guild2) {
                                    const member = await guild2.members.fetch(data.user).catch(() => null);
                                    if (member) {
                                        await member.timeout(null, 'Unmuted via shell');
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: true, user: data.user }));
                                    } else {
                                        res.writeHead(404, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: 'User not found' }));
                                    }
                                }
                                break;
                            case 'set-auto-accept':
                                const configPath = path.join(__dirname, '.loop_config');
                                let configContent = {};
                                if (fs.existsSync(configPath)) {
                                    const existing = fs.readFileSync(configPath, 'utf8');
                                    existing.split('\n').forEach(line => {
                                        const [key, value] = line.split('=');
                                        if (key && value) configContent[key] = value;
                                    });
                                }
                                configContent.AUTO_ACCEPT_GAMES = data.enabled ? 'true' : 'false';
                                fs.writeFileSync(configPath, Object.entries(configContent).map(([k,v]) => `${k}=${v}`).join('\n'));
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, autoAccept: data.enabled }));
                                break;
                            case 'set-clear-days':
                                const configPath2 = path.join(__dirname, '.loop_config');
                                let configContent2 = {};
                                if (fs.existsSync(configPath2)) {
                                    const existing = fs.readFileSync(configPath2, 'utf8');
                                    existing.split('\n').forEach(line => {
                                        const [key, value] = line.split('=');
                                        if (key && value) configContent2[key] = value;
                                    });
                                }
                                configContent2.CLEAR_DAYS = data.days || '0';
                                fs.writeFileSync(configPath2, Object.entries(configContent2).map(([k,v]) => `${k}=${v}`).join('\n'));
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, clearDays: data.days }));
                                break;
                            case 'status':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    running: client.ready,
                                    uptime: formatUptime(client.uptime),
                                    servers: client.guilds.cache.size,
                                    users: client.users.cache.size,
                                    ping: client.ws.ping,
                                    ram: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)
                                }));
                                break;
                            case 'logs':
                                if (fs.existsSync(path.join(__dirname, 'bot.log'))) {
                                    const logData = fs.readFileSync(path.join(__dirname, 'bot.log'), 'utf8');
                                    const lines = logData.split('\n').slice(-(data.lines || 50)).join('\n');
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ logs: lines }));
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ logs: 'No logs found' }));
                                }
                                break;
                            case 'restart':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Restarting bot...' }));
                                setTimeout(() => { process.exit(1); }, 1000);
                                break;
                            case 'shutdown':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Shutting down bot...' }));
                                setTimeout(() => { process.exit(0); }, 1000);
                                break;
                            // ===== GAME ENDPOINTS =====
                            case 'ai-balance':
                                try {
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    const result = await pool.query('SELECT coins FROM ai_balances WHERE server_id = $1', [serverId]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ server_id: serverId, coins: result.rows[0]?.coins || 1000 }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'ai-add-coins':
                                try {
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    await pool.query('INSERT INTO ai_balances (server_id, coins) VALUES ($1, $2) ON CONFLICT (server_id) DO UPDATE SET coins = ai_balances.coins + $2, updated_at = NOW()', [serverId, data.amount]);
                                    const result = await pool.query('SELECT coins FROM ai_balances WHERE server_id = $1', [serverId]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, coins: result.rows[0].coins }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'ai-spend':
                                try {
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    const result = await pool.query('SELECT coins FROM ai_balances WHERE server_id = $1', [serverId]);
                                    const currentCoins = result.rows[0]?.coins || 1000;
                                    if (currentCoins < data.amount) {
                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: 'Insufficient balance', coins: currentCoins }));
                                        return;
                                    }
                                    await pool.query('UPDATE ai_balances SET coins = coins - $1, updated_at = NOW() WHERE server_id = $2', [data.amount, serverId]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, spent: data.amount, coins: currentCoins - data.amount }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'ai-win':
                                try {
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    await pool.query('INSERT INTO ai_balances (server_id, coins) VALUES ($1, $2) ON CONFLICT (server_id) DO UPDATE SET coins = ai_balances.coins + $2, updated_at = NOW()', [serverId, data.amount]);
                                    const result = await pool.query('SELECT coins FROM ai_balances WHERE server_id = $1', [serverId]);
                                    await pool.query('INSERT INTO ai_game_logs (server_id, game_type, bet_amount, outcome, payout) VALUES ($1, $2, $3, $4, $5)', [serverId, data.game_type, data.bet_amount || 0, 'win', data.amount]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, won: data.amount, coins: result.rows[0].coins }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'ai-lose':
                                try {
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    await pool.query('UPDATE ai_balances SET coins = GREATEST(0, coins - $1), updated_at = NOW() WHERE server_id = $2', [data.amount, serverId]);
                                    const result = await pool.query('SELECT coins FROM ai_balances WHERE server_id = $1', [serverId]);
                                    await pool.query('INSERT INTO ai_game_logs (server_id, game_type, bet_amount, outcome, payout) VALUES ($1, $2, $3, $4, $5)', [serverId, data.game_type, data.bet_amount || 0, 'lose', 0]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, lost: data.amount, coins: result.rows[0].coins }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            // ===== LOG ENDPOINTS =====
                            case 'log-conversation':
                                try {
                                    await pool.query('INSERT INTO ai_conversations (server_id, channel_id, user_id, user_tag, role, content) VALUES ($1, $2, $3, $4, $5, $6)', 
                                        [data.server_id, data.channel_id, data.user_id, data.user_tag, data.role, data.content]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'log-tui':
                                try {
                                    await pool.query('INSERT INTO tui_logs (username, command, output, server_context) VALUES ($1, $2, $3, $4)', 
                                        [data.username, data.command, data.output, data.server_context]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            // ===== RAG ENDPOINTS =====
                            case 'rag-list':
                                try {
                                    const result = await pool.query('SELECT * FROM rag_registry WHERE enabled = TRUE ORDER BY indexed_at DESC');
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ files: result.rows }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'rag-add':
                                try {
                                    await pool.query('INSERT INTO rag_registry (file_path, description, added_by) VALUES ($1, $2, $3) ON CONFLICT (file_path) DO UPDATE SET enabled = TRUE, indexed_at = NOW(), added_by = $3', 
                                        [data.file_path, data.description || '', data.added_by || 'admin']);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'rag-remove':
                                try {
                                    await pool.query('UPDATE rag_registry SET enabled = FALSE WHERE file_path = $1', [data.file_path]);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            // ===== SERVER ENDPOINTS =====
                            case 'servers':
                                try {
                                    const servers = [];
                                    for (const guild of client.guilds.cache.values()) {
                                        servers.push({
                                            id: guild.id,
                                            name: guild.name,
                                            memberCount: guild.memberCount
                                        });
                                    }
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ servers }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            // ===== LOG RETRIEVAL =====
                            case 'get-logs':
                                try {
                                    let query, params;
                                    if (data.type === 'conversations') {
                                        query = 'SELECT * FROM ai_conversations WHERE server_id = $1 AND channel_id = $2 ORDER BY timestamp DESC LIMIT $3';
                                        params = [data.server_id, data.channel_id, data.limit || 50];
                                    } else if (data.type === 'tui') {
                                        query = 'SELECT * FROM tui_logs ORDER BY timestamp DESC LIMIT $1';
                                        params = [data.limit || 50];
                                    } else if (data.type === 'games') {
                                        query = 'SELECT * FROM ai_game_logs WHERE server_id = $1 ORDER BY timestamp DESC LIMIT $2';
                                        params = [data.server_id, data.limit || 50];
                                    } else {
                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: 'Invalid log type' }));
                                        return;
                                    }
                                    const result = await pool.query(query, params);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ logs: result.rows }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            case 'log-conversation':
                                try {
                                    const { server_id, channel_id, user_id, user_tag, role, content } = data;
                                    await pool.query(
                                        'INSERT INTO ai_conversations (server_id, channel_id, user_id, user_tag, role, content) VALUES ($1, $2, $3, $4, $5, $6)',
                                        [server_id || null, channel_id || null, user_id || null, user_tag || null, role, content]
                                    );
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            // ===== SHELL CONTROL =====
                            case 'status':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    servers: client.guilds.cache.size,
                                    users: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
                                    uptime: formatUptime(client.uptime),
                                    ping: client.ws.ping,
                                    ram: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                                    commands: client.commands.size + client.addonCommands.size
                                }));
                                break;
                            case 'logs':
                                try {
                                    const lines = parseInt(data.lines) || 50;
                                    const logPath = path.join(__dirname, 'bot.log');
                                    exec(`tail -n ${lines} "${logPath}"`, (err, stdout) => {
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ logs: stdout || 'No logs available' }));
                                    });
                                } catch (e) {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ logs: 'Failed to read logs' }));
                                }
                                break;
                            case 'stop':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Bot stopping...' }));
                                broadcastRestart();
                                setTimeout(() => { process.exit(0); }, 2000);
                                break;
                            case 'restart':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Bot restarting...' }));
                                broadcastRestart();
                                setTimeout(() => { process.exit(1); }, 2000);
                                break;
                            case 'restart':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Bot restarting...' }));
                                broadcastRestart();
                                setTimeout(() => { process.exit(1); }, 2000);
                                break;
                            case 'start':
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ message: 'Bot is running (use stop/restart to control)' }));
                                break;
                            case 'game-play':
                                try {
                                    const game = data.game_type?.toLowerCase();
                                    const bet = parseInt(data.bet_amount) || 100;
                                    const betType = data.bet_type || 'red';
                                    const specificBet = data.specific_bet;
                                    
                                    let result = { game, bet, betType, won: false, payout: 0, details: '' };
                                    
                                    if (game === 'roulette') {
                                        const ROULETTE_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
                                        const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
                                        const number = ROULETTE_NUMBERS[Math.floor(Math.random() * ROULETTE_NUMBERS.length)];
                                        const color = number === 0 ? 'green' : (RED_NUMBERS.includes(number) ? 'red' : 'black');
                                        const parity = number === 0 ? 'zero' : (number % 2 === 0 ? 'even' : 'odd');
                                        const range = number === 0 ? 'zero' : (number <= 18 ? '1-18' : '19-36');
                                        
                                        let playerWon = false;
                                        if (betType === 'red' && color === 'red') playerWon = true;
                                        else if (betType === 'black' && color === 'black') playerWon = true;
                                        else if (betType === 'even' && parity === 'even') playerWon = true;
                                        else if (betType === 'odd' && parity === 'odd') playerWon = true;
                                        else if (betType === '1-18' && range === '1-18') playerWon = true;
                                        else if (betType === '19-36' && range === '19-36') playerWon = true;
                                        else if (betType === 'straight' && specificBet === number) playerWon = true;
                                        
                                        result.number = number;
                                        result.color = color;
                                        result.won = playerWon;
                                        result.payout = playerWon ? bet * (betType === 'straight' ? 35 : 2) : 0;
                                        result.details = `Ball landed on ${number} (${color}). ${playerWon ? 'WIN!' : 'Lose.'}`;
                                        
                                    } else if (game === 'slots') {
                                        const emojis = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
                                        const roll = () => emojis[Math.floor(Math.random() * emojis.length)];
                                        const r1 = roll(), r2 = roll(), r3 = roll();
                                        result.roll = [r1, r2, r3];
                                        const won = r1 === r2 && r2 === r3;
                                        result.won = won;
                                        result.payout = won ? bet * 10 : 0;
                                        result.details = `${r1} ${r2} ${r3} - ${won ? 'JACKPOT!' : 'No match.'}`;
                                        
                                    } else if (game === 'blackjack') {
                                        const RANKS = ['A','2','3','4','5','6','7','8','9','T','J','Q','K'];
                                        const SUITS = ['♠','♥','♦','♣'];
                                        const makeCard = () => RANKS[Math.floor(Math.random()*RANKS.length)] + SUITS[Math.floor(Math.random()*4)];
                                        const cardVal = (c) => { if(c[0]==='A')return 11; if(['J','Q','K'].includes(c[0]))return 10; return parseInt(c[0]); };
                                        const playerHand = [makeCard(), makeCard()];
                                        const dealerHand = [makeCard(), makeCard()];
                                        let playerTotal = cardVal(playerHand[0]) + cardVal(playerHand[1]);
                                        let dealerTotal = cardVal(dealerHand[0]) + cardVal(dealerHand[1]);
                                        while (playerTotal < 17 && Math.random() < 0.5) { const c = makeCard(); playerHand.push(c); playerTotal += cardVal(c); }
                                        while (dealerTotal < 17) { const c = makeCard(); dealerHand.push(c); dealerTotal += cardVal(c); }
                                        const won = playerTotal <= 21 && (dealerTotal > 21 || playerTotal > dealerTotal);
                                        const bust = playerTotal > 21;
                                        result.won = won;
                                        result.payout = won ? bet * 2 : 0;
                                        result.player_hand = playerHand.join(' ');
                                        result.dealer_hand = dealerHand.join(' ');
                                        result.player_total = playerTotal;
                                        result.dealer_total = dealerTotal;
                                        result.bust = bust;
                                        result.game_over = true;
                                        if (bust) result.details = `BUST! You went over 21 with ${playerTotal}.`;
                                        else if (dealerTotal > 21) result.details = `Dealer busts with ${dealerTotal}! You win ${bet * 2}!`;
                                        else if (playerTotal > dealerTotal) result.details = `You win ${playerTotal} vs ${dealerTotal}! +${bet * 2} coins`;
                                        else if (playerTotal === dealerTotal) result.details = `Push! Both have ${playerTotal}. Bet returned.`;
                                        else result.details = `You lose. ${playerTotal} vs ${dealerTotal}.`;
                                        
                                    } else if (game === 'coinflip') {
                                        const flip = Math.random() < 0.5 ? 'heads' : 'tails';
                                        const playerPick = data.player_choice?.toLowerCase() || 'heads';
                                        result.won = flip === playerPick;
                                        result.payout = result.won ? bet : 0;
                                        result.flip = flip;
                                        result.details = `Flipped ${flip}. ${result.won ? 'You win!' : 'You lose.'}`;
                                        
                                    } else if (game === 'keno') {
                                        const pickCount = Math.min(parseInt(data.pick_count) || 5, 10);
                                        const playerPicks = data.picks || [];
                                        const drawn = [];
                                        while (drawn.length < 10) {
                                            const n = Math.floor(Math.random() * 80) + 1;
                                            if (!drawn.includes(n)) drawn.push(n);
                                        }
                                        const matches = playerPicks.filter(p => drawn.includes(p)).length;
                                        const payouts = [0, 0, 0, 1, 2, 5, 10, 25, 100, 500, 2000];
                                        const payoutMultiplier = payouts[Math.min(matches, 10)];
                                        result.won = matches >= 3;
                                        result.payout = result.won ? bet * payoutMultiplier : 0;
                                        result.drawn = drawn;
                                        result.matches = matches;
                                        result.details = `Drew: ${drawn.slice(0, 10).join(', ')}. Matched ${matches}/10. ${result.won ? 'WIN!' : 'No win.'}`;
                                        
                                    } else {
                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: 'Unknown game type' }));
                                        return;
                                    }
                                    
                                    // Log the game
                                    const serverId = data.server_id || client.guilds.cache.first()?.id;
                                    await pool.query('INSERT INTO ai_game_logs (server_id, game_type, bet_amount, outcome, payout) VALUES ($1, $2, $3, $4, $5)', 
                                        [serverId, game, bet, result.won ? 'win' : 'lose', result.payout]);
                                    
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify(result));
                                } catch (e) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: e.message }));
                                }
                                break;
                            default:
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Unknown endpoint' }));
                        }
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            const auth = checkAuth(req.headers.authorization);
            if (!auth) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            if (auth.mustChange) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Must change password first' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Admin API' }));
            return;
        }

        if (req.url === '/login' || req.url === '/change-password') {
            const page = req.url === '/login' ? 'login' : 'change-password';
            const html = `<!DOCTYPE html>
<html>
<head>
    <title>${page === 'login' ? 'Login' : 'Change Password'} - Loopconomy</title>
    <style>
        body { font-family: Arial; background: #1a1a2e; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #16213e; padding: 30px; border-radius: 10px; text-align: center; }
        input { padding: 10px; margin: 10px; width: 200px; border-radius: 5px; border: none; }
        button { padding: 10px 20px; background: #e94560; color: white; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #d63447; }
        h2 { color: #e94560; }
    </style>
</head>
<body>
    <div class="box">
        <h2>${page === 'login' ? '🔐 Login' : '🔑 Change Password'}</h2>
        <input type="text" id="username" placeholder="Username"><br>
        <input type="password" id="password" placeholder="Password"><br>
        ${page === 'change-password' ? '<input type="password" id="newPassword" placeholder="New Password"><br>' : ''}
        <button onclick="submit()">${page === 'login' ? 'Login' : 'Change Password'}</button>
        <p id="error" style="color: red;"></p>
    </div>
    <script>
        async function submit() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const newPassword = document.getElementById('newPassword')?.value;
            const url = '${page}' === 'login' ? '/api/login' : '/api/change-password';
            const body = newPassword ? { username, currentPassword: password, newPassword } : { username, password };
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (data.token || data.success) {
                localStorage.setItem('token', data.token || 'authenticated');
                window.location.href = '/';
            } else {
                document.getElementById('error').textContent = data.error;
            }
        }
    </script>
</body>
</html>`;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }

        // Admin Panel
        if (req.url === '/admin' || req.url === '/adminpanel') {
            const adminPanelPath = path.join(__dirname, 'AdminPanel.html');
            fs.readFile(adminPanelPath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Admin Panel not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
            return;
        }

        let filePath = req.url === '/' ? MAIN_PAGE : path.join(__dirname, req.url);
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'text/plain';

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('404 Not Found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    };

    if (fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
        const httpsServer = https.createServer({ key: fs.readFileSync(SSL_KEY), cert: fs.readFileSync(SSL_CERT) }, serverHandler);
        httpsServer.listen(WEB_PORT, () => console.log(`🔒 HTTPS Server running on port ${WEB_PORT}`));
    } else {
        const httpServer = http.createServer(serverHandler);
        httpServer.listen(WEB_PORT, () => console.log(`🌐 HTTP Server running on port ${WEB_PORT}`));
    }
}

function formatUptime(ms) {
    if (!ms) return 'Offline';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${m % 60}m`;
}

function broadcastRestart() {
    try {
        for (const guild of client.guilds.cache.values()) {
            const channel = guild.systemChannel || guild.channels.cache.find(c => c.name === 'general');
            if (channel) channel.send('🔄 **Bot restarting...** Back in ~10 seconds.').catch(() => {});
        }
    } catch (e) {}
}

// --- API factory (EUMI) for addons ---
function createAPI(trustLevel, addonName) {
    const api = {
        client: client,
        // Base Essentials
        listen: (event, fn) => client.on(event, fn),
        speak: (chanId, content) => client.channels.cache.get(chanId)?.send(content),
        reply: (msg, content) => msg.reply(content),
        react: (msg, emoji) => msg.react(emoji),
        delete: (msg) => {
            if (trustLevel >= 3 || msg.author.id === client.user.id) return msg.delete();
            throw new Error("Level 3 required to delete others' messages.");
        },
        log: (txt) => console.log(`[${addonName}] ${txt}`),
        getUptime: () => client.uptime,
        getPing: () => client.ws.ping,
        getAvatar: (user) => user.displayAvatarURL(),
        findMember: async (guild, query) => {
            const members = await guild.members.fetch();
            return members.find(m => m.user.username.toLowerCase().includes(query.toLowerCase()) || m.id === query);
        },
        formatDate: (date) => new Intl.DateTimeFormat('en-US').format(date),
        getBalance: async (uid) => {
            const res = await pool.query('SELECT coins FROM economy WHERE uid = $1', [uid]);
            return res.rows[0]?.coins || 0;
        },
        addCoins: async (uid, amt) => {
            await pool.query('INSERT INTO economy(uid, coins) VALUES($1, $2) ON CONFLICT(uid) DO UPDATE SET coins = economy.coins + $2', [uid, amt]);
        },
        subCoins: async (uid, amt) => {
            await pool.query('UPDATE economy SET coins = coins - $1 WHERE uid = $2 AND coins >= $1', [amt, uid]);
        },
        createEmbed: (title, desc, color = '#0099ff') => new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color),
        writeNote: (name, content) => {
            const dir = path.join(__dirname, 'notes');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            fs.writeFileSync(path.join(dir, `${name}.txt`), content);
        },
        readNote: (name) => {
            const filePath = path.join(__dirname, 'notes', `${name}.txt`);
            if (!fs.existsSync(filePath)) return null;
            return fs.readFileSync(filePath, 'utf8');
        },
        getTopBalances: async (limit = 10) => {
            const res = await pool.query('SELECT uid, coins FROM economy ORDER BY coins DESC LIMIT $1', [limit]);
            return res.rows;
        },
        transferCoins: async (fromUid, toUid, amount) => {
            const fromBal = await pool.query('SELECT coins FROM economy WHERE uid = $1', [fromUid]);
            if (!fromBal.rows[0] || fromBal.rows[0].coins < amount) return false;
            await pool.query('UPDATE economy SET coins = coins - $1 WHERE uid = $2', [amount, fromUid]);
            await pool.query('INSERT INTO economy(uid, coins) VALUES($1, $2) ON CONFLICT(uid) DO UPDATE SET coins = economy.coins + $2', [toUid, amount]);
            return true;
        },
        getUser: async (userId) => await client.users.fetch(userId).catch(() => null),
        getGuild: async (guildId) => await client.guilds.fetch(guildId).catch(() => null),
        getChannel: async (channelId) => await client.channels.fetch(channelId).catch(() => null),
        kick: (member, reason) => member.kick(reason),
        mute: (member, minutes, reason) => member.timeout(minutes * 60 * 1000, reason),
        purge: (channel, limit) => channel.bulkDelete(limit),
        warn: async (uid, reason) => {
            await pool.query('INSERT INTO warnings(uid, reason, ts) VALUES($1, $2, NOW())', [uid, reason]);
        },
        setSlowmode: (channel, seconds) => channel.setRateLimitPerUser(seconds),
        getWarnings: async (uid) => {
            const res = await pool.query('SELECT * FROM warnings WHERE uid = $1 ORDER BY ts DESC', [uid]);
            return res.rows;
        },
        clearWarnings: async (uid) => {
            await pool.query('DELETE FROM warnings WHERE uid = $1', [uid]);
        },
        createPoll: async (channel, question, options) => {
            const rows = [];
            for (let i = 0; i < options.length; i++) {
                const btn = new (require('discord.js').ButtonBuilder)()
                    .setCustomId(`poll_${i}`)
                    .setLabel(options[i])
                    .setStyle(require('discord.js').ButtonStyle.Primary);
                rows.push(new (require('discord.js').ActionRowBuilder)().addComponents(btn));
            }
            const embed = new EmbedBuilder()
                .setTitle(question)
                .setDescription(options.map((o, i) => `${i + 1}. ${o}`).join('\n'))
                .setColor('#0099ff');
            const msg = await channel.send({ embeds: [embed], components: rows });
            return msg;
        },
        addRole: (member, roleId) => member.roles.add(roleId),
        removeRole: (member, roleId) => member.roles.remove(roleId),
        createRole: (guild, data) => guild.roles.create(data),
        lockChannel: (channel) => channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false }),
        unlockChannel: (channel) => channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true }),
        ban: async (user, reason) => {
            const guild = user.guild;
            await guild.bans.create(user.id, { reason });
        },
        unban: async (guild, userId) => {
            await guild.bans.remove(userId);
        },
        createChannel: async (guild, name, type = 'text') => {
            const channelType = type === 'voice' ? 'GUILD_VOICE' : 'GUILD_TEXT';
            return await guild.channels.create({ name, type: require('discord.js').ChannelType[channelType] });
        },
        shell: (cmd) => new Promise((resolve, reject) => exec(cmd, (err, stdout) => err ? reject(err) : resolve(stdout))),
        hotReload: () => loadAllAddons(),
        shutdown: () => process.exit(),
        broadcast: (guild, msg) => {
            const gen = guild.channels.cache.find(c => c.name === 'general' || c.name === 'main');
            if (gen) gen.send(msg);
        },
        getSystemStats: () => ({ platform: process.platform, arch: process.arch, memory: process.memoryUsage() }),
    };

    const levelMethods = {
        1: ['getUptime','getPing','getAvatar','findMember','formatDate'],
        2: ['getBalance','addCoins','subCoins','createEmbed','writeNote','readNote','getTopBalances','transferCoins','getUser','getGuild','getChannel'],
        3: ['kick','mute','purge','warn','setSlowmode','getWarnings','clearWarnings','createPoll'],
        4: ['addRole','removeRole','createRole','lockChannel','unlockChannel','ban','unban','createChannel'],
        5: ['shell','hotReload','shutdown','broadcast','getSystemStats']
    };
    for (let lvl = 1; lvl <= 5; lvl++) {
        if (trustLevel < lvl) {
            levelMethods[lvl].forEach(m => delete api[m]);
        }
    }
    return api;
}

function getFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(getFiles(fullPath));
        } else if (item.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

function loadBaseCommands() {
    const commandsDir = path.join(__dirname, 'commands');
    if (!fs.existsSync(commandsDir)) return [];
    const commandFiles = getFiles(commandsDir);
    const slashCommands = [];

    for (const file of commandFiles) {
        delete require.cache[require.resolve(file)];
        const cmd = require(file);
        if (cmd.data && cmd.execute) {
            client.commands.set(cmd.data.name, cmd);
            slashCommands.push(cmd.data.toJSON());
        }
        if (cmd.onMessage) {
            client.messageCommands.push(cmd.onMessage);
            console.log(`[DEBUG] Registered base onMessage from ${path.basename(file)}`);
        }
    }
    return slashCommands;
}

async function loadAddons() {
    const addonsDir = path.join(__dirname, 'addons');
    if (!fs.existsSync(addonsDir)) return [];

    const rootManifestPath = path.join(addonsDir, 'manifest.json');
    if (!fs.existsSync(rootManifestPath)) {
        console.warn("Root manifest missing. No addons loaded.");
        return [];
    }

    let rootManifest;
    try {
        rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));
    } catch (e) {
        console.error("Failed to parse root manifest:", e);
        return [];
    }

    const addons = rootManifest.addons || {};
    const addonCommands = [];

    for (const [folderName, config] of Object.entries(addons)) {
        if (!config.enabled) {
            console.log(`Addon ${folderName} disabled.`);
            continue;
        }
        const trustLevel = config.trustLevel;
        if (typeof trustLevel !== 'number' || trustLevel < 1 || trustLevel > 5) {
            console.error(`Addon ${folderName} has invalid trustLevel. Skipping.`);
            continue;
        }
        const commandList = config.commandList || [];

        const addonFolder = path.join(addonsDir, folderName);
        if (!fs.statSync(addonFolder).isDirectory()) {
            console.error(`Addon folder ${folderName} not found.`);
            continue;
        }

        const addonManifestPath = path.join(addonFolder, 'manifest.json');
        if (!fs.existsSync(addonManifestPath)) {
            console.error(`Addon ${folderName} missing its own manifest.json.`);
            continue;
        }
        let addonManifest;
        try {
            addonManifest = JSON.parse(fs.readFileSync(addonManifestPath, 'utf8'));
        } catch (e) {
            console.error(`Failed to parse addon manifest for ${folderName}:`, e);
            continue;
        }

        if (addonManifest.trustLevel !== undefined && addonManifest.trustLevel !== trustLevel) {
            console.warn(`[SECURITY] ${folderName} sub-manifest trustLevel mismatch (root: ${trustLevel}, sub: ${addonManifest.trustLevel}). Using root value.`);
        }

        const subCmdList = addonManifest.commandList || [];
        const invalidCmds = subCmdList.filter((c) => !commandList.includes(c));
        if (invalidCmds.length > 0) {
            console.warn(`[SECURITY] ${folderName} sub-manifest has unauthorized commands: ${invalidCmds.join(', ')}. Using root commandList.`);
        }

        const entryFile = addonManifest.entry;
        if (!entryFile) {
            console.error(`Addon ${folderName} manifest missing entry.`);
            continue;
        }
        const entryPath = path.join(addonFolder, entryFile);
        if (!fs.existsSync(entryPath)) {
            console.error(`Addon ${folderName} entry file not found.`);
            continue;
        }

        try {
            delete require.cache[require.resolve(entryPath)];
            const addon = require(entryPath);

            const api = createAPI(trustLevel, folderName);

            if (addon.commands && Array.isArray(addon.commands)) {
                for (const cmd of addon.commands) {
                    if (!cmd.data || !cmd.execute) continue;
                    const cmdName = cmd.data.name;
                    if (!commandList.includes(cmdName)) {
                        console.warn(`Addon ${folderName} command ${cmdName} not in root commandList, skipping.`);
                        continue;
                    }
                    const wrappedExecute = async (interaction) => {
                        await cmd.execute(interaction, api);
                    };
                    const wrappedCmd = {
                        data: cmd.data,
                        execute: wrappedExecute,
                        addonName: folderName
                    };
                    client.addonCommands.set(cmdName, wrappedCmd);
                    addonCommands.push(cmd.data.toJSON());
                }
            }

            if (addon.init) {
                await addon.init(api);
            }

            // DEBUG: Log onMessage registration
            if (addon.onMessage) {
                client.messageCommands.push(addon.onMessage);
                console.log(`[DEBUG] Registered addon onMessage from ${folderName}`);
            } else {
                console.log(`[DEBUG] No onMessage export found in ${folderName}`);
            }

            console.log(`✅ Loaded addon: ${folderName} (trust level ${trustLevel})`);
        } catch (e) {
            console.error(`[LOADER] ❌ Failed to load addon ${folderName}: ${e.message}`);
        }
    }
    console.log(`[BOOT] Addon loading complete`);
    return addonCommands;
}

async function registerSlashCommands(baseCmds, addonCmds) {
    const allCommands = [...baseCmds, ...addonCmds];
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: allCommands });
        console.log(`✅ Registered ${allCommands.length} slash commands.`);
    } catch (err) {
        console.error("Failed to register slash commands:", err);
    }
}

setInterval(() => {
    exec('git pull', (err) => { if (!err) console.log("Git Pull: OK"); });
}, 900000);

client.once("ready", async () => {
    console.log(`[BOOT] Kernel Online: ${client.user.tag}`);
    console.log(`[BOOT] Loading environment... OK`);
    console.log(`[BOOT] Database: Connecting...`);
    
    try {
        await pool.query('SELECT 1');
        console.log(`[BOOT] Database: Connected`);
    } catch (e) {
        console.error(`[BOOT] Database: FAILED - ${e.message}`);
    }
    
    console.log(`[BOOT] Registering base commands...`);
    createWebServer();
    client.api = createAPI(2, 'core');

    const baseCmds = loadBaseCommands();
    console.log(`[BOOT] Base commands: ${baseCmds.length} loaded`);
    
    console.log(`[BOOT] Loading addons...`);
    const addonCmds = await loadAddons();
    console.log(`[BOOT] Addons: ${addonCmds.length} commands registered`);

    console.log(`[BOOT] Registering slash commands...`);
    await registerSlashCommands(baseCmds, addonCmds);
    
    console.log(`[BOOT] ═══════════════════════════════════════════════════════════════`);
    console.log(`[BOOT] ✅ Bot ready! | Servers: ${client.guilds.cache.size} | Commands: ${baseCmds.length + addonCmds.length}`);
    console.log(`[BOOT] ═══════════════════════════════════════════════════════════════`);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    let command = client.commands.get(interaction.commandName);
    if (!command) command = client.addonCommands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        interaction.reply({ content: "Error executing command.", ephemeral: true }).catch(() => {});
    }
});

// Properly pass API to message handlers
client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;

    const api = client.api || createAPI(2, 'core');

    for (const handler of client.messageCommands) {
        try {
            handler(msg, api);
        } catch (e) {
            console.error('Error in message handler:', e);
        }
    }
});

client.login(TOKEN);
