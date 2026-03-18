const { Client, IntentsBitField, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('ts-node').register();
require('dotenv').config();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
    console.error("Missing required environment variables.");
    process.exit(1);
}

// PostgreSQL pool – attach to client so base commands can use it directly
const pool = new Pool({ connectionString: DATABASE_URL });

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ]
});
client.pool = pool; // for base commands

// Collections
client.commands = new Collection();          // base slash commands
client.addonCommands = new Collection();     // addon slash commands (with their scoped API)
client.messageCommands = [];                  // legacy onMessage handlers

// --- API factory (EUMI) for addons ---
function createAPI(trustLevel, addonName) {
    const api = {
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

        // Level 1
        getUptime: () => client.uptime,
        getPing: () => client.ws.ping,
        getAvatar: (user) => user.displayAvatarURL(),
        findMember: async (guild, query) => {
            const members = await guild.members.fetch();
            return members.find(m => m.user.username.toLowerCase().includes(query.toLowerCase()) || m.id === query);
        },
        formatDate: (date) => new Intl.DateTimeFormat('en-US').format(date),

        // Level 2
        getBalance: async (uid) => {
            const res = await pool.query('SELECT coins FROM economy WHERE uid = $1', [uid]);
            return res.rows[0]?.coins || 0;
        },
        addCoins: async (uid, amt) => {
            await pool.query(
                'INSERT INTO economy(uid, coins) VALUES($1, $2) ON CONFLICT(uid) DO UPDATE SET coins = economy.coins + $2',
                [uid, amt]
            );
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
            await pool.query(
                'INSERT INTO economy(uid, coins) VALUES($1, $2) ON CONFLICT(uid) DO UPDATE SET coins = economy.coins + $2',
                [toUid, amount]
            );
            return true;
        },
        getUser: async (userId) => {
            return await client.users.fetch(userId).catch(() => null);
        },
        getGuild: async (guildId) => {
            return await client.guilds.fetch(guildId).catch(() => null);
        },
        getChannel: async (channelId) => {
            return await client.channels.fetch(channelId).catch(() => null);
        },

        // Level 3
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

        // Level 4
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
            return await guild.channels.create({
                name,
                type: require('discord.js').ChannelType[channelType]
            });
        },

        // Level 5
        shell: (cmd) => new Promise((resolve, reject) => exec(cmd, (err, stdout) => err ? reject(err) : resolve(stdout))),
        hotReload: () => loadAllAddons(),
        shutdown: () => process.exit(),
        broadcast: (guild, msg) => {
            const gen = guild.channels.cache.find(c => c.name === 'general' || c.name === 'main');
            if (gen) gen.send(msg);
        },
        getSystemStats: () => ({ platform: process.platform, arch: process.arch, memory: process.memoryUsage() }),
    };

    // Remove methods above trustLevel
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

// --- Recursive file finder ---
function getFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(getFiles(fullPath));
        } else if (item.endsWith('.js')) { // base commands are only .js
            files.push(fullPath);
        }
    }
    return files;
}

// --- Load base commands from /commands ---
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
        }
    }
    return slashCommands;
}

// --- Load addons with root manifest control ---
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

        // Security: verify sub-manifest trustLevel matches root
        if (addonManifest.trustLevel !== undefined && addonManifest.trustLevel !== trustLevel) {
            console.warn(`[SECURITY] ${folderName} sub-manifest trustLevel mismatch (root: ${trustLevel}, sub: ${addonManifest.trustLevel}). Using root value.`);
        }
        
        // Security: verify sub-manifest commandList is subset of root
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

            // Create scoped API for this addon
            const api = createAPI(trustLevel, folderName);

            // Register commands from the addon, but only those in commandList
            if (addon.commands && Array.isArray(addon.commands)) {
                for (const cmd of addon.commands) {
                    if (!cmd.data || !cmd.execute) continue;
                    const cmdName = cmd.data.name;
                    if (!commandList.includes(cmdName)) {
                        console.warn(`Addon ${folderName} command ${cmdName} not in root commandList, skipping.`);
                        continue;
                    }
                    // Wrap execute to pass the scoped API
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

            // Call init if present
            if (addon.init) {
                await addon.init(api);
            }

            console.log(`✅ Loaded addon: ${folderName} (trust level ${trustLevel})`);
        } catch (e) {
            console.error(`Failed to load addon ${folderName}:`, e);
        }
    }
    return addonCommands;
}

// --- Register all slash commands ---
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

// --- Auto-update ---
setInterval(() => {
    exec('git pull', (err) => { if (!err) console.log("Git Pull: OK"); });
}, 900000);

// --- Ready ---
client.once("ready", async () => {
    console.log(`✅ Kernel Online: ${client.user.tag}`);
    
    // Create global API for base commands (trust level 2)
    client.api = createAPI(2, 'core');
    
    const baseCmds = loadBaseCommands();
    const addonCmds = await loadAddons();
    await registerSlashCommands(baseCmds, addonCmds);
    console.log(`Base commands: ${baseCmds.length}, Addon commands: ${addonCmds.length}`);
});

// --- InteractionCreate: handle slash commands ---
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

// --- MessageCreate: handle legacy onMessage commands ---
client.on("messageCreate", (msg) => {
    if (msg.author.bot) return;
    for (const handler of client.messageCommands) {
        try { handler(msg); } catch (e) { console.error(e); }
    }
});

client.login(TOKEN);