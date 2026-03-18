import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const WHEEL_SEGMENTS = [
    { value: 0.5, label: '0.5x', color: '#808080' },
    { value: 1, label: '1x', color: '#FFFFFF' },
    { value: 1.5, label: '1.5x', color: '#FF0000' },
    { value: 2, label: '2x', color: '#0000FF' },
    { value: 3, label: '3x', color: '#00FF00' },
    { value: 5, label: '5x', color: '#FFFF00' },
    { value: 10, label: '10x', color: '#FF00FF' },
    { value: 0, label: 'BANKRUPT', color: '#000000' },
];

function spinWheel(): { segment: number; multiplier: number; label: string; color: string } {
    const weights = [1, 1, 1, 1, 0.5, 0.25, 0.1, 0.5];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            return {
                segment: i,
                multiplier: WHEEL_SEGMENTS[i].value,
                label: WHEEL_SEGMENTS[i].label,
                color: WHEEL_SEGMENTS[i].color
            };
        }
    }
    
    return { segment: 0, multiplier: 1, label: '1x', color: '#FFFFFF' };
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('wheel')
            .setDescription('Spin the Wheel of Fortune!')
            .addIntegerOption(opt =>
                opt.setName('bet')
                    .setDescription('Amount to bet')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');

            if (bet <= 0) {
                return interaction.reply({ content: 'Please enter a valid bet.', ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: `Insufficient funds. Balance: ${balance}`, ephemeral: true });
            }

            await api.subCoins(interaction.user.id, bet);

            const result = spinWheel();
            
            const segments = WHEEL_SEGMENTS.map((s, i) => {
                const arrow = i === result.segment ? '👉 ' : '   ';
                return `${arrow}${s.label}`;
            }).join('\n');

            let winAmount = 0;
            let message = '';
            
            if (result.multiplier === 0) {
                message = '💀 BANKRUPT! You lost your bet!';
            } else {
                winAmount = Math.floor(bet * result.multiplier);
                await api.addCoins(interaction.user.id, winAmount);
                message = result.multiplier >= 5 ? '🎉 JACKPOT!' : '🎊 Winner!';
            }

            const newBalance = await api.getBalance(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('🎡 Wheel of Fortune')
                .setColor(result.multiplier === 0 ? '#FF0000' : result.multiplier >= 5 ? '#FFD700' : '#00FF00')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎰 Wheel', value: `\`\`\`\n${segments}\n\`\`\``, inline: false },
                    { name: '🎯 Result', value: result.label, inline: true },
                    { name: '💰 Bet', value: bet.toLocaleString(), inline: true },
                    { name: result.multiplier === 0 ? '❌ Lost' : '🎉 Won', value: bet.toLocaleString(), inline: true },
                    { name: '💳 Balance', value: newBalance.toLocaleString(), inline: true }
                )
                .setFooter({ text: message });

            await interaction.reply({ embeds: [embed] });
        }
    }
];

export const init = async (api: any) => {
    api.log("Wheel of Fortune Module Loaded.");
};
