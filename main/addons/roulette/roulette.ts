import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const ROULETTE_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

const BET_TYPES = {
    'straight': { payout: 35, description: 'Single number (0-36)' },
    'red': { payout: 1, description: 'All red numbers' },
    'black': { payout: 1, description: 'All black numbers' },
    'even': { payout: 1, description: 'All even numbers' },
    'odd': { payout: 1, description: 'All odd numbers' },
    '1-18': { payout: 1, description: 'Numbers 1-18' },
    '19-36': { payout: 1, description: 'Numbers 19-36' },
    'dozen1': { payout: 2, description: 'Numbers 1-12' },
    'dozen2': { payout: 2, description: 'Numbers 13-24' },
    'dozen3': { payout: 2, description: 'Numbers 25-36' },
    'column1': { payout: 2, description: 'Column 1 (1,4,7...34)' },
    'column2': { payout: 2, description: 'Column 2 (2,5,8...35)' },
    'column3': { payout: 2, description: 'Column 3 (3,6,9...36)' }
};

function spinWheel(): { number: number; color: string; parity: string; range: string; dozen: string; column: string } {
    const number = ROULETTE_NUMBERS[Math.floor(Math.random() * ROULETTE_NUMBERS.length)];
    const color = number === 0 ? 'green' : (RED_NUMBERS.includes(number) ? 'red' : 'black');
    const parity = number === 0 ? 'zero' : (number % 2 === 0 ? 'even' : 'odd');
    const range = number === 0 ? 'zero' : (number <= 18 ? '1-18' : '19-36');
    const dozen = number === 0 ? 'zero' : (number <= 12 ? 'dozen1' : number <= 24 ? 'dozen2' : 'dozen3');
    const column = number === 0 ? 'zero' : (number % 3 === 1 ? 'column1' : number % 3 === 2 ? 'column2' : 'column3');

    return { number, color, parity, range, dozen, column };
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('roulette')
            .setDescription('Play Roulette')
            .addIntegerOption(opt =>
                opt.setName('bet')
                    .setDescription('Amount to bet')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('bet_type')
                    .setDescription('Type of bet')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Red', value: 'red' },
                        { name: 'Black', value: 'black' },
                        { name: 'Even', value: 'even' },
                        { name: 'Odd', value: 'odd' },
                        { name: '1-18 (Low)', value: '1-18' },
                        { name: '19-36 (High)', value: '19-36' },
                        { name: 'Dozen 1 (1-12)', value: 'dozen1' },
                        { name: 'Dozen 2 (13-24)', value: 'dozen2' },
                        { name: 'Dozen 3 (25-36)', value: 'dozen3' },
                        { name: 'Straight (single)', value: 'straight' }
                    )
            )
            .addIntegerOption(opt =>
                opt.setName('number')
                    .setDescription('Number for straight bet (0-36)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');
            const betType = interaction.options.getString('bet_type');
            const number = interaction.options.getInteger('number');

            if (bet <= 0) {
                return interaction.reply({ content: 'Please enter a valid bet.', ephemeral: true });
            }

            if (betType === 'straight' && (number < 0 || number > 36)) {
                return interaction.reply({ content: 'Please enter a valid number (0-36).', ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: `Insufficient funds. Balance: ${balance}`, ephemeral: true });
            }

            await api.subCoins(interaction.user.id, bet);

            const result = spinWheel();
            const betInfo = BET_TYPES[betType as keyof typeof BET_TYPES];
            
            let won = false;
            if (betType === 'straight') {
                won = result.number === number;
            } else if (betType === 'red') {
                won = result.color === 'red';
            } else if (betType === 'black') {
                won = result.color === 'black';
            } else if (betType === 'even') {
                won = result.parity === 'even';
            } else if (betType === 'odd') {
                won = result.parity === 'odd';
            } else if (betType === '1-18') {
                won = result.range === '1-18';
            } else if (betType === '19-36') {
                won = result.range === '19-36';
            } else if (betType.startsWith('dozen')) {
                won = result.dozen === betType;
            } else if (betType.startsWith('column')) {
                won = result.column === betType;
            }

            const winAmount = won ? bet * (betInfo.payout + 1) : 0;
            if (winAmount > 0) {
                await api.addCoins(interaction.user.id, winAmount);
            }

            const newBalance = await api.getBalance(interaction.user.id);

            const colorHex = result.color === 'red' ? '#FF0000' : result.color === 'black' ? '#000000' : '#00FF00';

            const embed = new EmbedBuilder()
                .setTitle('🎡 Roulette')
                .setColor(won ? '#00FF00' : '#FF0000')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎰 Result', value: `**${result.number}** (${result.color})`, inline: true },
                    { name: '🎯 Your Bet', value: `${betType}${number ? ` (${number})` : ''}`, inline: true },
                    { name: '💰 Bet', value: bet.toLocaleString(), inline: true },
                    { name: won ? '🎉 Won' : '❌ Lost', value: winAmount.toLocaleString(), inline: true },
                    { name: '💳 Balance', value: newBalance.toLocaleString(), inline: true }
                )
                .setFooter({ text: won ? `You won ${betInfo.payout}x!` : 'Better luck next time!' });

            await interaction.reply({ embeds: [embed] });
        }
    }
];

export const init = async (api: any) => {
    api.log("Roulette Module Loaded.");
};
