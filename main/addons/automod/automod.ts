import { SlashCommandBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.join(process.cwd(), 'automod.json');

interface AutoModSettings {
    enabled: boolean;
    spam: boolean;
    links: boolean;
    caps: boolean;
    wordlist: string[];
    mentionSpam: boolean;
    mentionLimit: number;
    emojiSpam: boolean;
    emojiLimit: number;
    newlines: boolean;
    maxNewlines: number;
    whitelist: string[];
    logChannel: string | null;
    capsThreshold: number;
    strikeCount: number;
    strikes: { [userId: string]: { count: number; expires: number } };
}

interface GuildSettings {
    [guildId: string]: AutoModSettings;
}

let guildSettings: GuildSettings = {};

const defaultSettings: AutoModSettings = {
    enabled: false,
    spam: true,
    links: false,
    caps: false,
    wordlist: ['spam', 'scam', 'fake'],
    mentionSpam: false,
    mentionLimit: 5,
    emojiSpam: false,
    emojiLimit: 10,
    newlines: false,
    maxNewlines: 10,
    whitelist: [],
    logChannel: null,
    capsThreshold: 0.7,
    strikeCount: 0,
    strikes: {}
};

function loadSettings() {
    try {
        if (fs.existsSync(dataPath)) {
            guildSettings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) {
        guildSettings = {};
    }
}

function saveSettings() {
    fs.writeFileSync(dataPath, JSON.stringify(guildSettings, null, 2));
}

function getSettings(guildId: string): AutoModSettings {
    if (!guildSettings[guildId]) {
        guildSettings[guildId] = { ...defaultSettings };
    }
    return guildSettings[guildId];
}

function checkSpam(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.spam) return false;
    
    const content = message.content.toLowerCase();
    const spamPatterns = [
        /(.)\1{5,}/i,
        /[a-z]{10,}/i,
        /\b(free|money|win|prize|click|hurry)\b.{0,20}\b(free|money|win|prize|click|hurry)\b/i
    ];
    
    for (const pattern of spamPatterns) {
        if (pattern.test(content)) return true;
    }
    return false;
}

function checkLinks(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.links) return false;
    
    const whitelist = settings.whitelist || [];
    for (const whitelisted of whitelist) {
        if (message.content.includes(whitelisted)) return false;
    }
    
    const urlPattern = /https?:\/\/[^\s]+/gi;
    return urlPattern.test(message.content);
}

function checkCaps(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.caps) return false;
    
    const content = message.content.replace(/[^a-zA-Z]/g, '');
    if (content.length < 10) return false;
    
    const uppercase = content.replace(/[^A-Z]/g, '').length;
    const ratio = uppercase / content.length;
    
    return ratio >= settings.capsThreshold;
}

function checkMentionSpam(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.mentionSpam) return false;
    
    return message.mentions.users.size >= settings.mentionLimit;
}

function checkEmojiSpam(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.emojiSpam) return false;
    
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]/gu;
    const emojis = message.content.match(emojiPattern);
    
    return emojis && emojis.length >= settings.emojiLimit;
}

function checkNewlines(message: any): boolean {
    const settings = getSettings(message.guildId);
    if (!settings.newlines) return false;
    
    const newlines = (message.content.match(/\n/g) || []).length;
    return newlines >= settings.maxNewlines;
}

function checkWordlist(message: any): string | null {
    const settings = getSettings(message.guildId);
    const content = message.content.toLowerCase();
    
    for (const word of settings.wordlist) {
        if (content.includes(word.toLowerCase())) {
            return word;
        }
    }
    return null;
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('automod')
            .setDescription('Configure AutoMod')
            .addSubcommand(sub =>
                sub.setName('status')
                    .setDescription('Check AutoMod status')
            )
            .addSubcommand(sub =>
                sub.setName('enable')
                    .setDescription('Enable AutoMod')
            )
            .addSubcommand(sub =>
                sub.setName('disable')
                    .setDescription('Disable AutoMod')
            )
            .addSubcommand(sub =>
                sub.setName('spam')
                    .setDescription('Toggle spam filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('links')
                    .setDescription('Toggle link filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('caps')
                    .setDescription('Toggle caps filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('mentions')
                    .setDescription('Toggle mention spam filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('mentions_limit')
                    .setDescription('Set mention limit per message')
                    .addIntegerOption(opt =>
                        opt.setName('limit')
                            .setDescription('Max mentions allowed')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('emojis')
                    .setDescription('Toggle emoji spam filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('newlines')
                    .setDescription('Toggle excessive newline filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Enable or disable')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('whitelist')
                    .setDescription('Manage link whitelist')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Add or remove')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Add domain', value: 'add' },
                                { name: 'Remove domain', value: 'remove' },
                                { name: 'List', value: 'list' }
                            )
                    )
                    .addStringOption(opt =>
                        opt.setName('domain')
                            .setDescription('Domain to whitelist (e.g., discord.gg)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('wordlist')
                    .setDescription('Manage word filter')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Add or remove')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Add word', value: 'add' },
                                { name: 'Remove word', value: 'remove' },
                                { name: 'List words', value: 'list' }
                            )
                    )
                    .addStringOption(opt =>
                        opt.setName('word')
                            .setDescription('Word to add/remove')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('logchannel')
                    .setDescription('Set the log channel')
                    .addChannelOption(opt =>
                        opt.setName('channel')
                            .setDescription('Channel for logs (no arg to disable)')
                            .setRequired(false)
                    )
            ),
        async execute(interaction: any, api: any) {
            const subcommand = interaction.options.getSubcommand();
            const settings = getSettings(interaction.guildId);

            if (subcommand === 'status') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ AutoMod Status')
                    .setColor(settings.enabled ? '#00FF00' : '#FF0000')
                    .addFields(
                        { name: '📡 Overall', value: settings.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                        { name: '🚨 Spam', value: settings.spam ? '🟢' : '🔴', inline: true },
                        { name: '🔗 Links', value: settings.links ? '🟢' : '🔴', inline: true },
                        { name: '⬆️ Caps', value: settings.caps ? '🟢' : '🔴', inline: true },
                        { name: '@️ Mentions', value: settings.mentionSpam ? `🟢 (${settings.mentionLimit})` : '🔴', inline: true },
                        { name: '😀 Emojis', value: settings.emojiSpam ? `🟢 (${settings.emojiLimit})` : '🔴', inline: true },
                        { name: '📝 Wordlist', value: `${settings.wordlist.length} words`, inline: true },
                        { name: '📋 Whitelist', value: `${settings.whitelist.length} domains`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            if (subcommand === 'enable') {
                settings.enabled = true;
                saveSettings();
                await interaction.reply({ content: '🛡️ AutoMod has been **enabled**.', ephemeral: true });
                return;
            }

            if (subcommand === 'disable') {
                settings.enabled = false;
                saveSettings();
                await interaction.reply({ content: '🛡️ AutoMod has been **disabled**.', ephemeral: true });
                return;
            }

            if (subcommand === 'spam') {
                const action = interaction.options.getString('action');
                settings.spam = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `🚨 Spam filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'links') {
                const action = interaction.options.getString('action');
                settings.links = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `🔗 Link filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'caps') {
                const action = interaction.options.getString('action');
                settings.caps = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `⬆️ Caps filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'mentions') {
                const action = interaction.options.getString('action');
                settings.mentionSpam = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `@️ Mention spam filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'mentions_limit') {
                const limit = interaction.options.getInteger('limit');
                settings.mentionLimit = limit;
                saveSettings();
                await interaction.reply({ content: `@️ Mention limit set to **${limit}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'emojis') {
                const action = interaction.options.getString('action');
                settings.emojiSpam = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `😀 Emoji spam filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'newlines') {
                const action = interaction.options.getString('action');
                settings.newlines = action === 'enable';
                saveSettings();
                await interaction.reply({ content: `📝 Excessive newline filter **${action === 'enable' ? 'enabled' : 'disabled'}**.`, ephemeral: true });
                return;
            }

            if (subcommand === 'whitelist') {
                const action = interaction.options.getString('action');
                const domain = interaction.options.getString('domain');

                if (action === 'list') {
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Link Whitelist')
                        .setColor('#0099ff')
                        .setDescription(settings.whitelist.length > 0 ? settings.whitelist.join('\n') : 'No domains whitelisted');
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                if (action === 'add') {
                    if (!domain) {
                        return interaction.reply({ content: 'Please provide a domain.', ephemeral: true });
                    }
                    if (!settings.whitelist.includes(domain)) {
                        settings.whitelist.push(domain);
                        saveSettings();
                    }
                    await interaction.reply({ content: `✅ Added **${domain}** to whitelist.`, ephemeral: true });
                    return;
                }

                if (action === 'remove') {
                    if (!domain) {
                        return interaction.reply({ content: 'Please provide a domain.', ephemeral: true });
                    }
                    const index = settings.whitelist.indexOf(domain);
                    if (index >= 0) {
                        settings.whitelist.splice(index, 1);
                        saveSettings();
                    }
                    await interaction.reply({ content: `✅ Removed **${domain}** from whitelist.`, ephemeral: true });
                    return;
                }
            }

            if (subcommand === 'wordlist') {
                const action = interaction.options.getString('action');
                const word = interaction.options.getString('word')?.toLowerCase();

                if (action === 'list') {
                    const embed = new EmbedBuilder()
                        .setTitle('📝 AutoMod Wordlist')
                        .setColor('#0099ff')
                        .setDescription(settings.wordlist.length > 0 ? settings.wordlist.join(', ') : 'No words in list');
                    await interaction.reply({ embeds: [embed] });
                    return;
                }

                if (action === 'add') {
                    if (!word) {
                        return interaction.reply({ content: 'Please provide a word to add.', ephemeral: true });
                    }
                    if (!settings.wordlist.includes(word)) {
                        settings.wordlist.push(word);
                        saveSettings();
                    }
                    await interaction.reply({ content: `📝 Added **${word}** to wordlist.`, ephemeral: true });
                    return;
                }

                if (action === 'remove') {
                    if (!word) {
                        return interaction.reply({ content: 'Please provide a word to remove.', ephemeral: true });
                    }
                    const index = settings.wordlist.indexOf(word);
                    if (index >= 0) {
                        settings.wordlist.splice(index, 1);
                        saveSettings();
                    }
                    await interaction.reply({ content: `📝 Removed **${word}** from wordlist.`, ephemeral: true });
                    return;
                }
            }

            if (subcommand === 'logchannel') {
                const channel = interaction.options.getChannel('channel');
                settings.logChannel = channel?.id || null;
                saveSettings();
                await interaction.reply({ content: channel ? `📋 Log channel set to ${channel}` : '📋 Log channel disabled.', ephemeral: true });
            }
        }
    }
];

export const init = async (api: any) => {
    loadSettings();
    
    api.listen('messageCreate', async (message: any) => {
        if (message.author.bot) return;
        if (!message.guildId) return;
        
        const settings = getSettings(message.guildId);
        if (!settings.enabled) return;

        let shouldDelete = false;
        let reason = '';

        if (checkSpam(message)) {
            shouldDelete = true;
            reason = 'Spam detected';
        }

        if (checkLinks(message)) {
            shouldDelete = true;
            reason = 'Disallowed link';
        }

        if (checkCaps(message)) {
            shouldDelete = true;
            reason = 'Excessive caps';
        }

        if (checkMentionSpam(message)) {
            shouldDelete = true;
            reason = 'Mention spam';
        }

        if (checkEmojiSpam(message)) {
            shouldDelete = true;
            reason = 'Emoji spam';
        }

        if (checkNewlines(message)) {
            shouldDelete = true;
            reason = 'Excessive newlines';
        }

        const badWord = checkWordlist(message);
        if (badWord) {
            shouldDelete = true;
            reason = `Forbidden word: ${badWord}`;
        }

        if (shouldDelete) {
            try {
                await message.delete();
                
                if (settings.logChannel) {
                    const logChannel = message.guild.channels.cache.get(settings.logChannel);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('🛡️ AutoMod Action')
                            .setColor('#FF0000')
                            .addFields(
                                { name: 'User', value: `<@${message.author.id}>`, inline: true },
                                { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
                                { name: 'Reason', value: reason, inline: true }
                            )
                            .addFields({ name: 'Message', value: message.content.substring(0, 100) || '(empty)', inline: false })
                            .setTimestamp();

                        await (logChannel as TextChannel).send({ embeds: [embed] });
                    }
                }
            } catch (e) {
                api.log(`AutoMod failed: ${e}`);
            }
        }
    });

    api.log("AutoMod Module Loaded (Extended v2).");
};
