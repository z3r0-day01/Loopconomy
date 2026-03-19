const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COMMAND_CATEGORIES = {
    '🎰 Gambling': ['slots', 'coinflip', 'roulette', 'blackjack', 'poker', 'keno', 'bingo', 'wheel', 'russianroulette'],
    '💰 Economy': ['balance', 'work', 'beg', 'daily', 'pay', 'leaderboard'],
    '⚙️ Management': ['botstatus', 'botlogs', 'botrestart', 'botshutdown', 'botstart', 'botbackup', 'adminlist', 'addexistingcoins'],
    '🔧 Moderation': ['mute', 'unmute', 'automod'],
    '🏪 Marketplace': ['shop', 'copyright'],
    '🤖 AI': ['ai', 'ai-help', 'ai-toggle', 'ai-model', 'ai-manage', 'ai-agentic', 'ai-schedule', 'ai-rag', 'ai-logs'],
    'ℹ️ Info': ['help', 'about']
};

const COMMAND_DESCRIPTIONS = {
    // Gambling
    'slots': 'Play the slot machine',
    'coinflip': 'Challenge another user to a coinflip',
    'roulette': 'Play Roulette (bet on red, black, numbers)',
    'blackjack': 'Play blackjack against the dealer',
    'poker': 'High-stakes multi-mode poker',
    'keno': 'Pick numbers and win big',
    'bingo': 'Get 3 lines to win',
    'wheel': 'Spin the Wheel of Fortune',
    'russianroulette': 'Play against another player',
    // Economy
    'balance': 'Check your current balance',
    'work': 'Work to earn coins (12h cooldown)',
    'beg': 'Beg for money (60s cooldown)',
    'daily': 'Claim your daily reward (24h cooldown)',
    'pay': 'Pay another user some coins',
    'leaderboard': 'Top richest players',
    // Management
    'botstatus': 'Check bot status and stats',
    'botlogs': 'View recent bot logs',
    'botrestart': 'Restart the bot (Admin)',
    'botshutdown': 'Shutdown the bot (Owner)',
    'botstart': 'Start the bot (Admin)',
    'botbackup': 'Backup the database',
    'adminlist': 'List bot admins',
    'addexistingcoins': 'Add coins to a user (Admin)',
    // Moderation
    'mute': 'Mute a user for a time',
    'unmute': 'Unmute a user',
    'automod': 'Configure AutoMod settings',
    // Marketplace
    'shop': 'Buy and sell items in the marketplace',
    'copyright': 'Manage copyrighted terms',
    // AI
    'ai': 'Chat with the AI',
    'ai-help': 'Show AI help and commands',
    'ai-toggle': 'Enable/disable AI in channel',
    'ai-model': 'Check or set AI model',
    'ai-manage': 'Manage AI settings',
    'ai-agentic': 'Toggle agentic mode',
    'ai-schedule': 'Schedule AI messages',
    'ai-rag': 'Manage AI knowledge base',
    'ai-logs': 'View AI conversation logs',
    // Info
    'help': 'Get help with bot commands',
    'about': 'Learn more about Loopconomy'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with bot commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get help for a specific command')
                .setRequired(false)
                .addChoices(
                    { name: '🎰 Slots', value: 'slots' },
                    { name: '💰 Balance', value: 'balance' },
                    { name: '🎲 Roulette', value: 'roulette' },
                    { name: '🃏 Blackjack', value: 'blackjack' },
                    { name: '🃟 Poker', value: 'poker' },
                    { name: '🎯 Keno', value: 'keno' },
                    { name: '🎱 Bingo', value: 'bingo' },
                    { name: '🎡 Wheel', value: 'wheel' },
                    { name: '🔫 Russian Roulette', value: 'russianroulette' },
                    { name: '💵 Pay', value: 'pay' },
                    { name: '📊 Leaderboard', value: 'leaderboard' },
                    { name: '🏪 Shop', value: 'shop' },
                    { name: '©️ Copyright', value: 'copyright' },
                    { name: '🤖 AI', value: 'ai' },
                    { name: '⚙️ AutoMod', value: 'automod' }
                )),

    async execute(interaction) {
        const command = interaction.options.getString('command');
        
        if (command) {
            const description = COMMAND_DESCRIPTIONS[command] || 'No description available';
            const embed = new EmbedBuilder()
                .setTitle(`/${command}`)
                .setColor('Blue')
                .setDescription(description);
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const allBase = [...interaction.client.commands.keys()].sort();
        const allAddon = [...interaction.client.addonCommands.keys()].sort();
        
        const embed = new EmbedBuilder()
            .setTitle('📚 Loopconomy Commands')
            .setColor('Blue')
            .setFooter({ text: 'Use /help <command> for detailed help | Full docs: Admin Panel → Documentation' });

        const categories = Object.keys(COMMAND_CATEGORIES);
        
        for (const cat of categories) {
            const cmds = COMMAND_CATEGORIES[cat];
            const available = cmds.filter(c => allBase.includes(c) || allAddon.includes(c));
            if (available.length > 0) {
                const cmdList = available.map(c => {
                    const desc = COMMAND_DESCRIPTIONS[c] || '';
                    return `\`/${c}\` - ${desc}`;
                }).join('\n');
                embed.addFields({
                    name: cat,
                    value: cmdList,
                    inline: false
                });
            }
        }

        await interaction.reply({ embeds: [embed] });
    }
};