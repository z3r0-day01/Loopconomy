import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const BINGO_PAYOUTS: { [pattern: string]: number } = {
    'line': 2,
    'two': 5,
    'full': 20
};

function generateCard(): number[] {
    const card: number[] = [];
    const ranges = [1-15, 16-30, 31-45, 46-60, 61-75];
    
    for (const range of ranges) {
        const [min, max] = range.toString().split('-').map(Number);
        const col: number[] = [];
        while (col.length < 5) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!col.includes(num)) col.push(num);
        }
        card.push(...col);
    }
    
    card[12] = 0;
    return card;
}

function checkBingo(card: number[], called: number[]): { lines: number; full: boolean } {
    const indices = called.filter(n => card.includes(n));
    let lines = 0;
    
    const rows = [
        [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24]
    ];
    const cols = [
        [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24]
    ];
    const diagonals = [[0,6,12,18,24], [4,8,12,16,20]];
    
    for (const row of rows) {
        if (row.every(i => indices.includes(card[i]))) lines++;
    }
    for (const col of cols) {
        if (col.every(i => indices.includes(card[i]))) lines++;
    }
    for (const diag of diagonals) {
        if (diag.every(i => indices.includes(card[i]) && card[i] !== 0)) lines++;
    }
    
    return { lines, full: lines >= 3 };
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('bingo')
            .setDescription('Play Bingo - get 3 lines to win!')
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

            const card = generateCard();
            const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
            const called: number[] = [];
            let result = { lines: 0, full: false };

            const embed = new EmbedBuilder()
                .setTitle('🎯 Bingo')
                .setColor('#0099ff')
                .setDescription('Drawing numbers...')
                .setFooter({ text: 'This may take a moment...' });

            await interaction.reply({ embeds: [embed] });

            for (let i = 0; i < 75; i++) {
                const idx = Math.floor(Math.random() * allNumbers.length);
                const num = allNumbers.splice(idx, 1)[0];
                called.push(num);

                result = checkBingo(card, called);
                
                if (result.full) break;
            }

            const displayCard = card.map(n => n === 0 ? 'FREE' : called.includes(n) ? `~~${n.toString().padStart(2, '0')}~~` : n.toString().padStart(2, '0')).join(' ');
            const cardDisplay = `B   I   N   G   O\n${displayCard}`;

            let totalWin = 0;
            if (result.full) {
                totalWin = bet * BINGO_PAYOUTS.full;
            } else if (result.lines >= 2) {
                totalWin = bet * BINGO_PAYOUTS.two;
            } else if (result.lines >= 1) {
                totalWin = bet * BINGO_PAYOUTS.line;
            }

            if (totalWin > 0) {
                await api.addCoins(interaction.user.id, totalWin);
            }

            const newBalance = await api.getBalance(interaction.user.id);

            const resultEmbed = new EmbedBuilder()
                .setTitle('🎯 Bingo Results')
                .setColor(totalWin > 0 ? '#00FF00' : '#FF0000')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '🎴 Your Card', value: `\`\`\`\n${cardDisplay}\n\`\`\``, inline: false },
                    { name: '📢 Numbers Called', value: called.slice(-10).join(', ') + (called.length > 10 ? '...' : ''), inline: false },
                    { name: '🎉 Lines', value: result.lines.toString(), inline: true },
                    { name: '💰 Won', value: totalWin.toLocaleString(), inline: true },
                    { name: '💳 Balance', value: newBalance.toLocaleString(), inline: true }
                )
                .setFooter({ text: totalWin > 0 ? 'BINGO! You won!' : 'No luck this time.' });

            await interaction.editReply({ embeds: [resultEmbed] });
        }
    }
];

export const init = async (api: any) => {
    api.log("Bingo Module Loaded.");
};
