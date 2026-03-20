import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logPath = path.join(process.cwd(), 'bot.log');
const configPath = path.join(process.cwd(), 'config.json');
const PID_FILE = path.join(process.cwd(), '.bot.pid');
const MAIN_JS = path.join(process.cwd(), 'main.js');

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        return { admins: [], owner: '', settings: {} };
    }
    return { admins: [], owner: '', settings: {} };
}

function isAdmin(userId: string): boolean {
    const config = loadConfig();
    return config.admins?.includes(userId) || config.owner === userId;
}

function getPid(): number | null {
    try {
        if (fs.existsSync(PID_FILE)) {
            return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
        }
    } catch (e) {}
    return null;
}

function savePid(pid: number): void {
    fs.writeFileSync(PID_FILE, pid.toString());
}

function isRunning(): boolean {
    const pid = getPid();
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function doStart(callback: (err: any) => void): void {
    if (isRunning()) {
        callback(new Error('Already running'));
        return;
    }
    const child = exec(`cd "${path.dirname(MAIN_JS)}" && nohup node main.js > bot.log 2>&1 & echo $!`, (err, stdout) => {
        if (err) return callback(err);
        const pid = parseInt(stdout.trim());
        if (pid) {
            savePid(pid);
            // Also save to .bot.pid in home for manage.py
            fs.writeFileSync(path.join(process.env.HOME || '/tmp', '.loop_bot.pid'), pid.toString());
        }
        callback(null);
    });
}

function doStop(callback: (err: any) => void): void {
    const pid = getPid();
    if (!pid) {
        // Try to find by process name
        exec(`pkill -f "node main.js"`, (err) => callback(err));
        return;
    }
    try {
        process.kill(pid, 'SIGTERM');
        setTimeout(() => {
            try { process.kill(pid, 'SIGKILL'); } catch (e) {}
        }, 2000);
        fs.unlinkSync(PID_FILE);
        callback(null);
    } catch (e: any) {
        callback(e);
    }
}

function doRestart(callback: (err: any) => void): void {
    broadcastRestartNotice();
    setTimeout(() => {
        doStop((stopErr) => {
            if (stopErr) return callback(stopErr);
            callback(null);
        });
    }, 1000);
}

function doRestartAndExit(interaction: any, callback: (err: any) => void): void {
    broadcastRestartNotice();
    setTimeout(() => {
        const pid = getPid();
            const home = process.env.HOME || '/tmp';
            const pidFile = path.join(home, '.loop_bot.pid');
            try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile); } catch {}
            try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
        exec(`pkill -f "node main.js"`, () => {
            callback(null);
            setTimeout(() => { process.exit(1); }, 2000);
        });
    }, 1000);
}

function broadcastRestartNotice(): void {
    try {
        const client = (global as any).botClient;
        if (client) {
            for (const guild of client.guilds.cache.values()) {
                const channel = guild.systemChannel || guild.channels.cache.find((c: any) => c.name === 'general');
                if (channel) {
                    channel.send('🔄 **Bot restarting...** Will be back in ~10 seconds.').catch(() => {});
                }
            }
        }
    } catch (e) {}
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('botstatus')
            .setDescription('Check bot status and stats'),
        async execute(interaction: any, api: any) {
            const client = interaction.client;
            const pool = client.pool;
            const uptime = client.uptime;
            const hours = Math.floor(uptime / 3600000);
            const minutes = Math.floor((uptime % 3600000) / 60000);
            
            const memUsage = process.memoryUsage();
            const memUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
            const memTotal = Math.round(memUsage.heapTotal / 1024 / 1024);

            try {
                const econResult = await pool.query('SELECT COUNT(*) as count, SUM(coins) as total FROM economy');
                const userCount = parseInt(econResult.rows[0].count) || 0;
                const totalCoins = parseInt(econResult.rows[0].total) || 0;

                const embed = new EmbedBuilder()
                    .setTitle('🤖 Bot Status')
                    .setColor('#00FF00')
                    .addFields(
                        { name: '📡 Status', value: '🟢 Online', inline: true },
                        { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                        { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true },
                        { name: '💾 Memory', value: `${memUsed}MB / ${memTotal}MB`, inline: true },
                        { name: '👥 Users', value: userCount.toLocaleString(), inline: true },
                        { name: '💰 Total Coins', value: totalCoins.toLocaleString(), inline: true },
                        { name: '📚 Commands', value: `${client.commands.size + client.addonCommands.size}`, inline: true }
                    )
                    .setFooter({ text: `Loopconomy Bot | PID: ${process.pid}` })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (e) {
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Bot Status')
                    .setColor('#00FF00')
                    .addFields(
                        { name: '📡 Status', value: '🟢 Online', inline: true },
                        { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                        { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true },
                        { name: '💾 Memory', value: `${memUsed}MB / ${memTotal}MB`, inline: true }
                    )
                    .setFooter({ text: `Loopconomy Bot | PID: ${process.pid}` })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botlogs')
            .setDescription('View recent bot logs')
            .addIntegerOption(opt => 
                opt.setName('lines')
                    .setDescription('Number of lines to show (default 20)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
            }
            
            const lines = interaction.options.getInteger('lines') || 20;
            
            await interaction.deferReply();
            
            exec(`tail -n ${lines} "${logPath}" 2>/dev/null || journalctl -u loopconomy --no-pager -n ${lines} 2>/dev/null || echo "No logs available"`, async (err: any, stdout: string, stderr: string) => {
                if (err && !stdout) {
                    return interaction.editReply({ content: `❌ Failed to fetch logs: ${err.message}`, ephemeral: true });
                }
                
                const logOutput = stdout.slice(-1900) || stderr.slice(-1900) || 'No recent logs.';
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Bot Logs (journalctl)')
                    .setColor('#0099ff')
                    .setDescription(`\`\`\`\n${logOutput}\n\`\`\``)
                    .setFooter({ text: `Last ${lines} lines via systemd journal` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botrestart')
            .setDescription('Restart the bot (Admin only)'),
        async execute(interaction: any, api: any) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
            }
            
            await interaction.reply({ content: '🔄 Restarting bot...' });
            
            doRestartAndExit(interaction, async (err: any) => {
                if (err) {
                    return interaction.editReply({ content: `❌ Failed: ${err.message}` });
                }
                await interaction.editReply({ content: '✅ Bot restarting...' });
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botshutdown')
            .setDescription('Shutdown the bot (Owner only)'),
        async execute(interaction: any, api: any) {
            const config = loadConfig();
            if (interaction.user.id !== config.owner) {
                return interaction.reply({ content: '❌ Only the bot owner can do this.', ephemeral: true });
            }
            
            await interaction.reply({ content: '🛑 Shutting down bot...' });
            
            doStop(async (err: any) => {
                if (err) {
                    return interaction.editReply({ content: `❌ Failed: ${err.message}` });
                }
                await interaction.editReply({ content: '✅ Bot stopped.' });
                setTimeout(() => { process.exit(0); }, 2000);
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botstart')
            .setDescription('Start the bot (Admin only)'),
        async execute(interaction: any, api: any) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
            }
            
            await interaction.reply({ content: '▶️ Starting bot...' });
            
            doStart(async (err: any) => {
                if (err) {
                    return interaction.editReply({ content: `❌ Failed: ${err.message}` });
                }
                await interaction.editReply({ content: '✅ Bot started.' });
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('botbackup')
            .setDescription('Backup the database'),
        async execute(interaction: any, api: any) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
            }
            
            await interaction.deferReply();
            
            try {
                const backupFile = `/home/z3r0/loop/main/backups/backup_${Date.now()}.sql`;
                exec(`mkdir -p /home/z3r0/loop/main/backups`, async () => {
                    const dbUrl = process.env.DATABASE_URL;
                    exec(`pg_dump "${dbUrl}" > ${backupFile}`, async (err: any) => {
                        if (err) {
                            return interaction.editReply({ content: `❌ Backup failed: ${err.message}` });
                        }
                        
                        const embed = new EmbedBuilder()
                            .setTitle('💾 Database Backup Created')
                            .setColor('#00FF00')
                            .addFields(
                                { name: '📁 File', value: path.basename(backupFile), inline: true },
                                { name: '📅 Created', value: new Date().toISOString(), inline: true }
                            );
                        
                        await interaction.editReply({ embeds: [embed] });
                    });
                });
            } catch (e: any) {
                await interaction.editReply({ content: `❌ Backup failed: ${e.message}` });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('adminlist')
            .setDescription('List bot admins'),
        async execute(interaction: any, api: any) {
            const config = loadConfig();
            
            const embed = new EmbedBuilder()
                .setTitle('👮 Bot Admins')
                .setColor('#0099ff')
                .addFields(
                    { name: '👑 Owner', value: `<@${config.owner}>`, inline: true },
                    { name: '👮 Admins', value: config.admins?.map((id: string) => `<@${id}>`).join('\n') || 'None', inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('addexistingcoins')
            .setDescription('Add coins to a user (Admin only)')
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('User to add coins to')
                    .setRequired(true)
            )
            .addIntegerOption(opt => 
                opt.setName('amount')
                    .setDescription('Amount of coins')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            if (!isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized.', ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            
            await api.addCoins(user.id, amount);
            const balance = await api.getBalance(user.id);
            
            const embed = new EmbedBuilder()
                .setTitle('💰 Coins Added')
                .setColor('#00FF00')
                .addFields(
                    { name: '👤 User', value: `${user.tag}`, inline: true },
                    { name: '➕ Added', value: `${amount.toLocaleString()}`, inline: true },
                    { name: '💳 New Balance', value: `${balance.toLocaleString()}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('reset-economy')
            .setDescription('Reset all economy data (admin only)'),
        async execute(interaction: any, api: any) {
            const hasTrust = await api.checkTrust?.(interaction.user.id, 5);
            if (!hasTrust && !isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ You are not authorized. This command requires trust level 5.', ephemeral: true });
            }
            
            const pool = api.client?.pool;
            if (!pool) {
                return interaction.reply({ content: '❌ Database pool not available.', ephemeral: true });
            }
            
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirm Economy Reset')
                .setColor('#FF0000')
                .setDescription('This will **DELETE ALL DATA** from the following tables:\n• `economy`\n• `ai_balances`\n• `ai_game_logs`\n\nThis action is **IRREVERSIBLE**!')
                .addFields(
                    { name: '⚡ Action', value: 'TRUNCATE tables with RESTART IDENTITY CASCADE', inline: false }
                );

            const confirmMsg = await interaction.reply({ 
                embeds: [confirmEmbed], 
                components: [
                    {
                        type: 1,
                        components: [
                            { type: 2, style: 5, label: 'CONFIRM RESET', custom_id: 'confirm_reset' },
                            { type: 2, style: 2, label: 'Cancel', custom_id: 'cancel_reset' }
                        ]
                    }
                ],
                fetchReply: true
            });

            try {
                const filter = (btn: any) => btn.user.id === interaction.user.id;
                const btnInteraction = await confirmMsg.awaitMessageComponent({ filter, time: 15000 });
                
                if (btnInteraction.customId === 'cancel_reset') {
                    return btnInteraction.update({ content: '❌ Reset cancelled.', embeds: [], components: [] });
                }
                
                await btnInteraction.deferReply();
                
                await pool.query('TRUNCATE economy, ai_balances, ai_game_logs RESTART IDENTITY CASCADE');
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Economy Reset Complete')
                    .setColor('#00FF00')
                    .setDescription('All economy data has been reset.')
                    .addFields(
                        { name: '🗑️ Tables Cleared', value: 'economy, ai_balances, ai_game_logs', inline: true }
                    )
                    .setTimestamp();
                
                await btnInteraction.editReply({ embeds: [successEmbed], components: [] });
            } catch (e: any) {
                if (e.message?.includes('time')) {
                    return interaction.editReply({ content: '⏱️ Confirmation timed out.', components: [] }).catch(() => {});
                }
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Reset Failed')
                    .setColor('#FF0000')
                    .setDescription(`Error: ${e.message}`)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed], components: [] }).catch(() => {});
            }
        }
    }
];

export const init = async (api: any) => {
    api.log("Bot Management Module Loaded (Trust Level 5)");
};