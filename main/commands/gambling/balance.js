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

function saveDataJson(data) {
    fs.writeFileSync(dataJsonPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance'),

    async execute(interaction) {
        const api = interaction.client.api;
        const userId = interaction.user.id;
        
        let balance = 0;
        
        // Try database first
        try {
            balance = await api.getBalance(userId);
        } catch (e) {
            // Fallback to data.json
            const data = getDataJson();
            balance = data[userId]?.money || 0;
        }

        // If database has nothing, check data.json for backwards compatibility
        if (balance === 0) {
            const data = getDataJson();
            if (data[userId]) {
                balance = data[userId].money || 0;
                // Sync to database
                try {
                    await api.addCoins(userId, balance);
                } catch (e) {}
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('💰 Your Balance')
            .setDescription(`You currently have **${balance.toLocaleString()} LoopCoins**.`)
            .setColor('#00FF00')
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '💵 Balance', value: `${balance.toLocaleString()}`, inline: true },
                { name: '📈 Rank', value: '#' + (await getRank(userId, api)), inline: true }
            )
            .setFooter({ text: 'Use /beg to earn more! Use /daily for bonus!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};

async function getRank(userId, api) {
    try {
        const top = await api.getTopBalances(100);
        const rank = top.findIndex(u => u.uid === userId);
        return rank >= 0 ? rank + 1 : 'N/A';
    } catch (e) {
        return 'N/A';
    }
}