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
                .setDescription('Number of players to show (default 10, max 25)')
                .setRequired(false)),

    async execute(interaction) {
        const api = interaction.client.api;
        const count = Math.min(interaction.options.getInteger('count') || 10, 25);
        const userId = interaction.user.id;
        
        let top = [];
        
        try {
            top = await api.getTopBalances(count + 1);
        } catch (e) {
            const data = getDataJson();
            top = Object.entries(data)
                .map(([uid, val]) => ({ uid, coins: val.money || 0 }))
                .sort((a, b) => b.coins - a.coins)
                .slice(0, count + 1);
        }
        
        if (top.length < count) {
            const data = getDataJson();
            const dbUids = new Set(top.map(u => u.uid));
            const jsonTop = Object.entries(data)
                .filter(([uid]) => !dbUids.has(uid))
                .map(([uid, val]) => ({ uid, coins: val.money || 0 }))
                .sort((a, b) => b.coins - a.coins)
                .slice(0, count - top.length + 1);
            top = [...top, ...jsonTop];
        }

        if (top.length === 0) {
            return interaction.reply({ content: '❌ No players yet. Use /beg to get started!', ephemeral: true });
        }

        const userRank = top.findIndex(u => u.uid === userId);
        
        const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
                        '1️⃣1️⃣', '1️⃣2️⃣', '1️⃣3️⃣', '1️⃣4️⃣', '1️⃣5️⃣', '1️⃣6️⃣', '1️⃣7️⃣', '1️⃣8️⃣', '1️⃣9️⃣', '2️⃣0️⃣',
                        '2️⃣1️⃣', '2️⃣2️⃣', '2️⃣3️⃣', '2️⃣4️⃣', '2️⃣5️⃣'];
        
        const medal = emojis[0] === '🥇' ? emojis : emojis;
        
        const top10 = top.slice(0, 10);
        let leaderLines = '';
        
        for (let i = 0; i < top10.length; i++) {
            const { uid, coins } = top10[i];
            const rankEmoji = medal[i];
            const isUser = uid === userId;
            const highlight = isUser ? '**' : '';
            leaderLines += `${rankEmoji} ${highlight}<@${uid}>${highlight} — 💰 ${coins.toLocaleString()}\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Leaderboard')
            .setColor('#FFD700')
            .setDescription(leaderLines)
            .setThumbnail('https://i.imgur.com/tDMq.png')
            .addFields(
                { name: '📊 Total Players', value: `${top.length}`, inline: true },
                { name: '💰 Top Balance', value: `💰 ${top[0]?.coins.toLocaleString() || 0}`, inline: true },
                { name: '🎯 Your Rank', value: userRank >= 0 ? `#${userRank + 1}` : 'Not ranked', inline: true }
            )
            .setFooter({ 
                text: userRank >= 0 && userRank < top.length 
                    ? `Your balance: 💰 ${top[userRank].coins.toLocaleString()} coins` 
                    : `Use /beg or /work to earn coins!`,
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
