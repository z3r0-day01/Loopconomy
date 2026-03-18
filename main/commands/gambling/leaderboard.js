const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataJsonPath = path.join(__dirname, 'data.json');

function getDataJson() {
    try {
        if (fs.existsSync(dataJsonPath)) {
            return JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Top richest players')
        .addIntegerOption(opt =>
            opt.setName('count')
                .setDescription('Number of players to show (default 10)')
                .setRequired(false)),

    async execute(interaction) {
        const api = interaction.client.api;
        const count = Math.min(interaction.options.getInteger('count') || 10, 25);
        
        let top = [];
        
        // Try database first
        try {
            top = await api.getTopBalances(count);
        } catch (e) {
            // Fallback to data.json
            const data = getDataJson();
            top = Object.entries(data)
                .map(([uid, val]) => ({ uid, coins: val.money || 0 }))
                .sort((a, b) => b.coins - a.coins)
                .slice(0, count);
        }
        
        // Merge with data.json if database has less
        if (top.length < count) {
            const data = getDataJson();
            const dbUids = new Set(top.map(u => u.uid));
            const jsonTop = Object.entries(data)
                .filter(([uid]) => !dbUids.has(uid))
                .map(([uid, val]) => ({ uid, coins: val.money || 0 }))
                .sort((a, b) => b.coins - a.coins)
                .slice(0, count - top.length);
            top = [...top, ...jsonTop];
        }

        if (top.length === 0) {
            return interaction.reply({ content: 'No players yet. Use /beg to get started!', ephemeral: true });
        }

        let description = '';
        const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        
        for (let i = 0; i < top.length; i++) {
            const { uid, coins } = top[i];
            const medal = emojis[i] || '🏅';
            description += `${medal} **${i + 1}.** <@${uid}> — ${coins.toLocaleString()} coins\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Leaderboard')
            .setDescription(description)
            .setColor('#FFD700')
            .setThumbnail('https://i.imgur.com/tDMq.png')
            .addFields(
                { name: '📊 Total Players', value: `${top.length}`, inline: true },
                { name: '💰 Top Balance', value: `${top[0]?.coins.toLocaleString() || 0}`, inline: true }
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};