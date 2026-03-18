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
│   └── gambling/
├── notes/             # Note storage (api.writeNote/readNote)
├── scripts/           # Install & management scripts
├── main.js           # Bot entry point
├── schema.sql        # Database schema (generated by installer)
└── package.json
```