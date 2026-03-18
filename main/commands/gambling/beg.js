const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataJsonPath = path.join(__dirname, 'data.json');
const cooldownsPath = path.join(__dirname, 'cooldowns.json');

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

function getCooldowns() {
    try {
        if (fs.existsSync(cooldownsPath)) {
            return JSON.parse(fs.readFileSync(cooldownsPath, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveCooldowns(data) {
    fs.writeFileSync(cooldownsPath, JSON.stringify(data, null, 2));
}

function checkCooldown(userId, command, cooldownMs) {
    const cooldowns = getCooldowns();
    const key = `${userId}_${command}`;
    const lastUsed = cooldowns[key];
    if (lastUsed && Date.now() - lastUsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (Date.now() - lastUsed)) / 1000);
        return remaining;
    }
    return 0;
}

function setCooldown(userId, command) {
    const cooldowns = getCooldowns();
    cooldowns[`${userId}_${command}`] = Date.now();
    saveCooldowns(cooldowns);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for money'),

    async execute(interaction) {
        const api = interaction.client.api;
        const userId = interaction.user.id;
        
        // Check cooldown (60 seconds)
        const cooldown = checkCooldown(userId, 'beg', 60000);
        if (cooldown > 0) {
            const embed = new EmbedBuilder()
                .setTitle('⏳ Cooldown')
                .setDescription(`You can beg again in **${cooldown} seconds**`)
                .setColor('#FFAA00');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        setCooldown(userId, 'beg');
        
        const amount = Math.floor(Math.random() * 100) + 1;
        
        // Try database first
        try {
            await api.addCoins(userId, amount);
        } catch (e) {
            // Fallback to data.json
            const data = getDataJson();
            if (!data[userId]) data[userId] = { money: 0 };
            data[userId].money += amount;
            saveDataJson(data);
        }
        
        let balance = 0;
        try {
            balance = await api.getBalance(userId);
        } catch (e) {
            balance = getDataJson()[userId]?.money || 0;
        }

        const embed = new EmbedBuilder()
            .setTitle('🙏 Begging Result')
            .setDescription(`You begged and received **${amount} LoopCoins**!`)
            .setColor('#00FF00')
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '💰 Received', value: `${amount}`, inline: true },
                { name: '💳 Balance', value: `${balance.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: 'Use /beg every 60 seconds!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};