const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function parseTime(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;

    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch(unit) {
        case 's': return num * 1000;
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// Admin IDs
const ADMIN_IDS = ['1328479692394725396', 'your_id_here']; // Add lyrics_loop and jkid88 IDs

function isAdmin(userId) {
    return ADMIN_IDS.includes(userId) || userId === '1328479692394725396';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user for a time')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('10s, 5m, 1h, 1d')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for mute')
                .setRequired(false)),

    async execute(interaction) {
        const member = interaction.options.getMember('target');
        const timeStr = interaction.options.getString('time');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const timeMs = parseTime(timeStr);

        if (!timeMs) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Time Format')
                .setDescription('Use format like: `10s`, `5m`, `1h`, `1d`')
                .setColor('#FF0000');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (!member || !member.manageable) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Cannot Mute')
                .setDescription('I cannot mute this user. They may have higher permissions than me.')
                .setColor('#FF0000');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await member.timeout(timeMs, reason);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ User Muted')
            .setColor('#00FF00')
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: '👤 User', value: `${member.user.tag}`, inline: true },
                { name: '⏱️ Duration', value: timeStr, inline: true },
                { name: '📋 Reason', value: reason, inline: false }
            )
            .setFooter({ text: `Muted by ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};