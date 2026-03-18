const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to unmute')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.options.getMember('target');

        if (!member || !member.manageable) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Cannot Unmute')
                .setDescription('I cannot unmute this user.')
                .setColor('#FF0000');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check if user is currently timed out
        if (!member.isCommunicationDisabled()) {
            const embed = new EmbedBuilder()
                .setTitle('ℹ️ Not Muted')
                .setDescription(`${member.user.tag} is not currently muted.`)
                .setColor('#FFAA00');
            return interaction.reply({ embeds: [embed] });
        }

        await member.timeout(null, `Unmuted by ${interaction.user.tag}`);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ User Unmuted')
            .setColor('#00FF00')
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: '👤 User', value: `${member.user.tag}`, inline: true },
                { name: '👮 Unmuted by', value: `${interaction.user.tag}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};