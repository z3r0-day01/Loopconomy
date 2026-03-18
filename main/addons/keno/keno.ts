import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const PAYOUTS: { [hits: number]: number } = {
    0: 0, 1: 0, 2: 0, 3: 1, 4: 2, 5: 5, 6: 10, 7: 25, 8: 100, 9: 500, 10: 1000
};

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('keno')
            .setDescription('Play Keno - pick numbers and win!')
            .addIntegerOption(opt =>
                opt.setName('bet')
                    .setDescription('Amount to bet')
                    .setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName('spots')
                    .setDescription('Number of spots to pick (3-10)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');
            const spots = interaction.options.getInteger('spots') || 4;

            if (bet <= 0) {
                return interaction.reply({ content: 'Please enter a valid bet.', ephemeral: true });
            }

            if (spots < 3 || spots > 10) {
                return interaction.reply({ content: 'Please pick between 3 and 10 spots.', ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: `Insufficient funds. Balance: ${balance}`, ephemeral: true });
            }

            await api.subCoins(interaction.user.id, bet);

            const numbers: number[] = [];
            while (numbers.length < 20) {
                const num = Math.floor(Math.random() * 80) + 1;
                if (!numbers.includes(num)) numbers.push(num);
            }

            const playerPicks: number[] = [];
            const allNumbers = Array.from({ length: 80 }, (_, i) => i + 1);
            
            for (let i = 0; i < spots; i++) {
                const idx = Math.floor(Math.random() * allNumbers.length);
                playerPicks.push(allNumbers.splice(idx, 1)[0]);
            }

            const hits = playerPicks.filter(n => numbers.slice(0, 20).includes(n)).length;
            const multiplier = PAYOUTS[hits] || 0;
            const winAmount = bet * multiplier;

            if (winAmount > 0) {
                await api.addCoins(interaction.user.id, winAmount);
            }

            const newBalance = await api.getBalance(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('🎱 Keno Results')
                .setColor(winAmount > 0 ? '#00FF00' : '#FF0000')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎯 Your Picks', value: playerPicks.sort((a, b) => a - b).join(', '), inline: false },
                    { name: '🎰 Drawn Numbers', value: numbers.slice(0, 20).sort((a, b) => a - b).join(', '), inline: false },
                    { name: '🎉 Hits', value: `${hits}/${spots}`, inline: true },
                    { name: '💰 Payout', value: `${multiplier}x`, inline: true },
                    { name: '💵 Won', value: winAmount.toLocaleString(), inline: true },
                    { name: '💳 Balance', value: newBalance.toLocaleString(), inline: true }
                )
                .setFooter({ text: winAmount > 0 ? 'Congratulations!' : 'Better luck next time!' });

            await interaction.reply({ embeds: [embed] });
        }
    }
];

export const init = async (api: any) => {
    api.log("Keno Module Loaded.");
};
