import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const logPath = path.join(process.cwd(), 'bot.log');
const configPath = path.join(process.cwd(), 'config.json');

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
            
            try {
                if (!fs.existsSync(logPath)) {
                    return interaction.reply({ content: 'No log file found.', ephemeral: true });
                }

                const logContent = fs.readFileSync(logPath, 'utf8');
                const logLines = logContent.split('\n').slice(-lines);
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Bot Logs')
                    .setColor('#0099ff')
                    .setDescription(`\`\`\`\n${logLines.join('\n').slice(-1900)}\n\`\`\``)
                    .setFooter({ text: `Last ${lines} lines` })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (e: any) {
                await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
            }
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
            
            await interaction.reply({ content: '🔄 Restarting bot...', ephemeral: true });
            
            setTimeout(() => {
                exec('cd /home/z3r0/loop/main && nohup node main.js > bot.log 2>&1 &');
                process.exit(0);
            }, 1000);
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
            
            await interaction.reply({ content: '🛑 Shutting down bot...', ephemeral: true });
            setTimeout(() => process.exit(0), 1000);
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
    }
];

export const init = async (api: any) => {
    api.log("Bot Management Module Loaded (Trust Level 5)");
};