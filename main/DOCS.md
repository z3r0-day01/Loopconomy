# Loopconomy Bot Documentation

## Table of Contents
1. [Trust Level System](#trust-level-system)
2. [API Reference](#api-reference)
3. [Manifest System](#manifest-system)
4. [Creating Addons](#creating-addons)
5. [Command Structure](#command-structure)

---

## Trust Level System

The bot uses a **Trust Level** system (1-5) to control what API methods are available to addons. Each addon is assigned a trust level in its manifest, and only methods at or below that level are accessible.

| Level | Description | Capabilities |
|-------|-------------|--------------|
| 1 | **Basic** | Read-only info, utilities |
| 2 | **Economy** | Economy, notes, embeddings |
| 3 | **Moderation** | User moderation, polls |
| 4 | **Admin** | Role/channel management, bans |
| 5 | **System** | Shell, reload, shutdown |

---

## API Reference

### Base Essentials (All Levels)

| Method | Description |
|--------|-------------|
| `listen(event, fn)` | Register event listener |
| `speak(chanId, content)` | Send message to channel |
| `reply(msg, content)` | Reply to a message |
| `react(msg, emoji)` | React to a message |
| `delete(msg)` | Delete a message (Level 3+ for others' messages) |
| `log(txt)` | Log with addon prefix |

---

### Level 1: Basic

| Method | Description |
|--------|-------------|
| `getUptime()` | Bot uptime in milliseconds |
| `getPing()` | WebSocket ping in ms |
| `getAvatar(user)` | User's display avatar URL |
| `findMember(guild, query)` | Find member by username or ID |
| `formatDate(date)` | Format date to en-US locale |

---

### Level 2: Economy

| Method | Description |
|--------|-------------|
| `getBalance(uid)` | Get user's coin balance |
| `addCoins(uid, amt)` | Add coins to user (creates entry if not exists) |
| `subCoins(uid, amt)` | Subtract coins (fails if insufficient) |
| `transferCoins(fromUid, toUid, amount)` | Transfer coins between users |
| `getTopBalances(limit)` | Get top balances (default 10) |
| `createEmbed(title, desc, color)` | Create Discord embed |
| `writeNote(name, content)` | Write note to file |
| `readNote(name)` | Read note from file |
| `getUser(userId)` | Fetch user by ID |
| `getGuild(guildId)` | Fetch guild by ID |
| `getChannel(channelId)` | Fetch channel by ID |

---

### Level 3: Moderation

| Method | Description |
|--------|-------------|
| `kick(member, reason)` | Kick member from guild |
| `mute(member, minutes, reason)` | Timeout member |
| `purge(channel, limit)` | Bulk delete messages |
| `warn(uid, reason)` | Add warning to user |
| `getWarnings(uid)` | Get all warnings for user |
| `clearWarnings(uid)` | Clear all warnings for user |
| `setSlowmode(channel, seconds)` | Set channel slowmode |
| `createPoll(channel, question, options)` | Create interactive poll |

---

### Level 4: Admin

| Method | Description |
|--------|-------------|
| `addRole(member, roleId)` | Add role to member |
| `removeRole(member, roleId)` | Remove role from member |
| `createRole(guild, data)` | Create new role |
| `lockChannel(channel)` | Disable send messages |
| `unlockChannel(channel)` | Enable send messages |
| `ban(user, reason)` | Ban user from guild |
| `unban(guild, userId)` | Unban user from guild |
| `createChannel(guild, name, type)` | Create text or voice channel |

---

### Level 5: System

| Method | Description |
|--------|-------------|
| `shell(cmd)` | Execute shell command |
| `hotReload()` | Reload all addons |
| `shutdown()` | Stop the bot |
| `broadcast(guild, msg)` | Send to general/main channel |
| `getSystemStats()` | System info (platform, arch, memory) |

---

## Manifest System

### Root Manifest (`addons/manifest.json`)

The root manifest controls which addons are loaded and their trust levels:

```json
{
    "addons": {
        "addon's folder name": {
            "enabled": true,
            "trustLevel": 2,
            "commandList": ["command1", "command2"]
        }
    }
}
```

### Sub-Manifest (`addons/<name>/manifest.json`)

Each addon has its own manifest for security verification:

```json
{
    "name": "Addon's Display Name",
    "description": "What it does",
    "version": "1.0.0",
    "entry": "filename.ts",
    "trustLevel": 2,
    "commandList": ["command1", "command2"]
}
```

**Security:** The root manifest is the source of truth. If sub-manifest values differ, the root values are used and a warning is logged.

---

## Creating Addons

### 1. Create Folder
Create `addons/<your-addon>/`

### 2. Create Sub-Manifest
File: `addons/<your-addon>/manifest.json`

```json
{
    "name": "My Addon",
    "description": "Description here",
    "version": "1.0.0",
    "entry": "index.ts",
    "trustLevel": 2,
    "commandList": ["mycommand"]
}
```

### 3. Create Entry File
File: `addons/<your-addon>/index.ts`

```typescript
import { SlashCommandBuilder } from 'discord.js';

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('mycommand')
            .setDescription('My first command'),
        async execute(interaction: any, api: any) {
            await interaction.reply({ content: 'Hello from my addon!' });
        }
    }
];

export const init = async (api: any) => {
    api.log('My addon initialized!');
    // Set up event listeners, etc.
};
```

### 4. Register in Root Manifest
Add to `addons/manifest.json`:
```json
{
    "addons": {
        "your-addon": {
            "enabled": true,
            "trustLevel": 2,
            "commandList": ["mycommand"]
        }
    }
}
```

---

## Command Structure

### Slash Commands
- Located in `commands/` (base commands)
- Located in `addons/<name>/` (addon commands)
- Base commands: `.js` files only
- Addon commands: `.ts` files, registered via addon system

### Message Commands
Legacy commands triggered by prefix (e.g., `!daily`):

```typescript
export const onMessage = async (msg: Message, api: any) => {
    if (msg.content.startsWith('!hello')) {
        await api.reply(msg, 'Hello!');
    }
};
```

---

## Base Commands (Included)

| Command | Description |
|---------|-------------|
| `/beg` | Beg for coins |
| `/balance` | Check your balance |
| `/leaderboard` | Top 10 richest players |
| `/help` | Show help |
| `/mute` | Mute a user |
| `/copyright` | Show copyright info |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Discord bot token |
| `CLIENT_ID` | Discord application client ID |
| `DATABASE_URL` | PostgreSQL connection string |
| `TAX_COLLECTOR_ID` | User ID for tax collection |

---

## File Structure

```
main/
├── commands/           # Base slash commands (.js)
│   └── gambling/
├── addons/            # Addon system
│   ├── manifest.json   # Root manifest
│   ├── blackjack/
│   ├── poker/
│   ├── gambling/
│   ├── copyright/     # Copyright enforcement system
│   └── ai/           # AI with 4-pass reasoning
├── notes/             # Note storage (api.writeNote/readNote)
├── scripts/           # Install & management scripts
├── main.js           # Bot entry point
├── schema.sql        # Database schema (generated by installer)
└── package.json
```

---

## Copyright System

### Overview
The copyright system allows users to register terms/words that are protected. When someone uses a copyrighted term, they receive a fine (if set) and the owner gets 80% of the fine, with 20% going to the server treasury.

### Commands

| Command | Description |
|---------|-------------|
| `/copyright add <term> [--fine <amount>]` | Register a new copyrighted term |
| `/copyright register <message_id>` | Copyright an existing message |
| `/copyright remove <term>` | Remove your copyrighted term |
| `/copyright fine <term> <amount>` | Update fine amount |
| `/copyright list` | List all copyrights in server |
| `/copyright earnings` | View your copyright earnings |
| `/copyright shop` | Open the marketplace |
| `/copyright sell <term> <price>` | List your copyright for sale |
| `/copyright buy <listing_id>` | Buy a copyright listing |
| `/copyright treasury` | View server treasury (jackpot pool) |

### Database Tables

```sql
-- Copyright terms
CREATE TABLE copyrights (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    owner_id VARCHAR(20) NOT NULL,
    owner_name VARCHAR(100),
    term VARCHAR(500) NOT NULL,
    fine_amount BIGINT DEFAULT 100,
    is_permanent BOOLEAN DEFAULT FALSE,
    UNIQUE(guild_id, term)
);

-- Fine collection tracking
CREATE TABLE copyright_earnings (
    id SERIAL PRIMARY KEY,
    copyright_id INTEGER REFERENCES copyrights(id),
    violator_id VARCHAR(20) NOT NULL,
    violator_name VARCHAR(100),
    fine_collected BIGINT NOT NULL,
    owner_share BIGINT NOT NULL,
    treasury_share BIGINT NOT NULL
);

-- Marketplace listings
CREATE TABLE copyright_shop_listings (
    id SERIAL PRIMARY KEY,
    copyright_id INTEGER REFERENCES copyrights(id),
    seller_id VARCHAR(20) NOT NULL,
    seller_name VARCHAR(100),
    price BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    royalty_end_date TIMESTAMP,
    original_owner_id VARCHAR(20),
    original_owner_name VARCHAR(100)
);

-- Server treasury (jackpot pool)
CREATE TABLE server_treasury (
    guild_id VARCHAR(20) PRIMARY KEY,
    balance BIGINT DEFAULT 0,
    jackpot_threshold BIGINT DEFAULT 50000
);
```

### Treasury & Jackpot
- 20% of all fines go to the server treasury
- When treasury >= jackpot threshold (default 50,000), keno/lottery winners can win the jackpot
- Configurable via `/copyright treasury` (admin only)

### Shop System
- Users can list their copyrights for sale
- Buyers pay the listed price
- 3-day royalty period: original owner gets 10% of fines collected during this time
- Listings are per-server

### Permanent Copyrights
- System copyrights that cannot be modified
- Seeded on install:
  - "anyways" - owned by Lyrics_loop
  - "yayy" - owned by Cookie

---

## AI System (mgmtsh)

### 4-Pass Reasoning

The AI uses a 4-pass reasoning system:

| Pass | Action | UI Behavior |
|------|--------|-------------|
| **1** | Reason: Should I respond? | No thinking message yet |
| **2** | YES → Show thinking | ✅ "AI is thinking..." visible |
| | NO → Add to passive RAG | Silent |
| **3** | Reason + use tools | ✅ Thinking message visible |
| | (max 3 tool calls) | |
| **4** | Finalize response | Clean, no tags |

### Agentic Mode
In agentic mode, the AI selectively responds to conversations. It decides:
- **ALWAYS respond**: mentioned, replied to, direct question
- **USUALLY respond**: games/economy topic, funny moment
- **NEVER respond**: heated argument, goodbye, not directed at you

### AI Tools (for Pass 3)

| Tool | Parameters | Description |
|------|------------|-------------|
| `send_message` | channel, message | Send message |
| `broadcast` | message | Broadcast to all servers |
| `get_balance` | user | Check balance |
| `add_coins` | user, amount | Give coins |
| `remove_coins` | user, amount | Remove coins |
| `get_copyrights` | - | Get server copyrights |
| `play_slots` | bet_amount | Play slots |
| `play_keno` | bet_amount, pick_count | Play keno |
| `mute_user` | user, time, reason | Mute user |

### Passive RAG
When AI decides NOT to respond (Pass 1 = NO):
- Message is stored in `passive_rag` table
- Auto-expires after 3 days
- Injected into future conversations as context
- AI can search it with `search_passive_context` tool

### Database Tables

```sql
-- Passive RAG for "no" responses
CREATE TABLE passive_rag (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '3 days')
);
```

---

## Web API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/status` | GET | No | Bot status |
| `/api/docs` | GET | No | Documentation |
| `/api/shell/*` | POST | Yes | Shell commands |
| `/api/login` | POST | No | Login |
| `/api/change-password` | POST | Yes | Change password |

### Shell Commands (Auth Required)

| Command | Description |
|---------|-------------|
| `say` | Send message to channel |
| `broadcast` | Broadcast to all servers |
| `addcoins` | Add coins to user |
| `removecoins` | Remove coins |
| `balance` | Check balance |
| `servers` | List connected servers |
| `logs` | Get bot logs |
| `status` | Bot status |
| `restart` | Restart bot |
| `shutdown` | Stop bot |

---

## Verbose Startup Logging

The bot now logs detailed startup information:

```
[BOOT] Kernel Online: Loopconomy#2596
[BOOT] Loading environment... OK
[BOOT] Database: Connecting...
[BOOT] Database: Connected
[BOOT] Registering base commands...
[BOOT] Base commands: 15 loaded
[BOOT] Loading addons...
[LOADER] ai.ts ✓ (20 RAG entries)
[LOADER] copyright.ts ✓
[LOADER] management.ts ✓
[BOOT] Addons: 25 commands registered
[BOOT] Registering slash commands...
[BOOT] ═══════════════════════════════════════════════════════════════
[BOOT] ✅ Bot ready! | Servers: 2 | Commands: 40
[BOOT] ═══════════════════════════════════════════════════════════════
```

---

## Admin Panel (mgmtsh)

The web-based admin panel provides:

- **Console**: Interactive shell commands
- **Logs**: Real-time bot logs
- **Stats**: Server/user/command counts
- **Servers**: Connected server list
- **Quick Actions**: Restart, Stop, Start

Access via MainPage.html → Admin Panel button

### Auth
- Username/password from `auth.json`
- Basic HTTP auth for API calls
- Session stored in localStorage

---

## v1.1.0 Release Notes

### New Features
- Copyright system with marketplace
- Server treasury with jackpot system
- AI passive RAG for "no" responses
- 4-pass reasoning with tool enforcement
- Verbose startup logging
- Documentation modal
- Admin panel fixes

### Breaking Changes
- Legacy `commands/copyright.js` removed
- Copyright now requires database tables
- AI system prompt updated

### Database Migration
Run the following to add new tables:

```sql
CREATE TABLE IF NOT EXISTS copyrights (...);
CREATE TABLE IF NOT EXISTS copyright_earnings (...);
CREATE TABLE IF NOT EXISTS copyright_shop_listings (...);
CREATE TABLE IF NOT EXISTS server_treasury (...);
CREATE TABLE IF NOT EXISTS passive_rag (...);
```