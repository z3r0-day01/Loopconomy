import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const SLOT_SYMBOLS = ['🎉', '🧨', '🀄', '🎰', '🔮', '⚧️', '♂️', '♀️', '🔞', '🅰️', '🆎', '🅱️', '🅾️', '🆑', '🆘', '🈷️'];

const SYMBOL_CLASSES: { [key: string]: string[] } = {
    chaos: ['🎉', '🧨', '💥'],
    mystic: ['🀄', '🎰', '🔮'],
    gender: ['⚧️', '♂️', '♀️'],
    signs: ['🔞', '🅰️', '🆎', '🅱️', '🅾️', '🆑', '🆘', '🈷️']
};

const isRigged = () => Math.random() < 0.10;

function getClass(s: string): string | undefined {
    return Object.keys(SYMBOL_CLASSES).find(key => SYMBOL_CLASSES[key].includes(s));
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('daily')
            .setDescription('Claim your daily reward'),
        async execute(interaction: any, api: any) {
            const uid = interaction.user.id;
            const lastCheckKey = `last_daily_${uid}`;
            const streakKey = `streak_${uid}`;

            const lastCheck = api.readNote(lastCheckKey) || "0";
            const now = Date.now();
            const oneDay = 86400000;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setThumbnail(interaction.user.displayAvatarURL());

            if (now - parseInt(lastCheck) < oneDay) {
                await api.addCoins(uid, 1000);
                const balance = await api.getBalance(uid);
                embed.setTitle('⏳ Daily Already Claimed')
                    .setDescription(`You've already claimed your daily reward today!`)
                    .addFields(
                        { name: '🎁 Passive Bonus', value: '1,000 LoopCoins', inline: true },
                        { name: '💰 New Balance', value: `${balance.toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: 'Come back tomorrow for more!' });
            } else {
                let streak = parseInt(api.readNote(streakKey) || "0");
                
                if (now - parseInt(lastCheck) > oneDay * 2) streak = 0;

                streak++;
                const bonus = 5000 * Math.pow(1.05, streak - 1);
                const finalAmount = Math.floor(bonus);

                await api.addCoins(uid, finalAmount);
                api.writeNote(lastCheckKey, now.toString());
                api.writeNote(streakKey, streak.toString());

                const balance = await api.getBalance(uid);
                embed.setTitle('📅 Daily Reward Claimed!')
                    .setDescription(`**${interaction.user.username}** claimed their daily reward!`)
                    .addFields(
                        { name: '🔥 Streak', value: `${streak} days`, inline: true },
                        { name: '🎁 Reward', value: `${finalAmount.toLocaleString()} LoopCoins`, inline: true },
                        { name: '💰 Balance', value: `${balance.toLocaleString()} LoopCoins`, inline: true }
                    )
                    .setFooter({ text: 'Come back tomorrow to keep your streak!' });
            }

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('coinflip')
            .setDescription('Flip a coin for coins')
            .addIntegerOption(opt => 
                opt.setName('bet')
                .setDescription('Amount to bet')
                .setRequired(true)
            )
            .addStringOption(opt => 
                opt.setName('choice')
                .setDescription('Choose heads or tails')
                .setRequired(true)
                .addChoices(
                    { name: 'Heads', value: 'heads' },
                    { name: 'Tails', value: 'tails' }
                )
            ),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');
            const choice = interaction.options.getString('choice');

            if (isNaN(bet) || bet <= 0) {
                return interaction.reply({ content: "Please enter a valid bet amount.", ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: `❌ You don't have enough coins. Balance: ${balance}`, ephemeral: true });
            }

            let win = Math.random() > 0.5;
            if (isRigged()) win = false;

            const result = win ? choice : (choice === 'heads' ? 'tails' : 'heads');
            const coinEmoji = result === 'heads' ? '🪙' : '🪙';

            const embed = new EmbedBuilder()
                .setThumbnail(interaction.user.displayAvatarURL());

            if (win) {
                await api.addCoins(interaction.user.id, bet);
                const newBalance = await api.getBalance(interaction.user.id);
                embed.setTitle(`${coinEmoji} You Won!`)
                    .setColor('#00FF00')
                    .setDescription(`The coin landed on **${result}**!`)
                    .addFields(
                        { name: '🎯 Your Choice', value: choice, inline: true },
                        { name: '🎁 Won', value: `${bet.toLocaleString()}`, inline: true },
                        { name: '💰 Balance', value: `${newBalance.toLocaleString()}`, inline: true }
                    );
            } else {
                await api.subCoins(interaction.user.id, bet);
                const newBalance = await api.getBalance(interaction.user.id);
                embed.setTitle(`${coinEmoji} You Lost!`)
                    .setColor('#FF0000')
                    .setDescription(`The coin landed on **${result}**...`)
                    .addFields(
                        { name: '🎯 Your Choice', value: choice, inline: true },
                        { name: '❌ Lost', value: `${bet.toLocaleString()}`, inline: true },
                        { name: '💰 Balance', value: `${newBalance.toLocaleString()}`, inline: true }
                    );
            }

            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('slots')
            .setDescription('Play the slot machine')
            .addIntegerOption(opt => 
                opt.setName('bet')
                .setDescription('Amount to bet')
                .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');

            if (isNaN(bet) || bet <= 0) {
                return interaction.reply({ content: "Please enter a valid bet amount.", ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: `❌ Insufficient funds. Balance: ${balance}`, ephemeral: true });
            }

            await api.subCoins(interaction.user.id, bet);

            const getRow = () => [
                SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
                SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
                SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]
            ];

            let middle = getRow();
            if (isRigged()) middle = [SLOT_SYMBOLS[0], SLOT_SYMBOLS[1], SLOT_SYMBOLS[2]];

            const [s1, s2, s3] = middle;
            let multiplier = 0;

            if (s1 === s2 && s2 === s3) {
                multiplier = 5;
            } else if (s1 === s2 || s2 === s3) {
                const pair = s1 === s2 ? [s1, s2] : [s2, s3];
                if (pair[0] === pair[1]) multiplier = 3;
                else if (getClass(pair[0]) === getClass(pair[1])) multiplier = 2;
            } else if (s1 === s3) {
                multiplier = 1.5;
            }

            const winAmount = Math.floor(bet * multiplier);
            if (winAmount > 0) await api.addCoins(interaction.user.id, winAmount);

            const topRow = getRow();
            const bottomRow = getRow();
            
            const display = `┌───────┐\n│ ${topRow.join(' ')} │\n│ ${middle.join(' ')} │\n│ ${bottomRow.join(' ')} │\n└───────┘`;
            
            const newBalance = await api.getBalance(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('🎰 Slot Machine 🎰')
                .setColor(multiplier > 0 ? '#00FF00' : '#FF0000')
                .setThumbnail('https://i.imgur.com/9Z2FZ4W.png')
                .addFields(
                    { name: 'Your Bet', value: bet.toLocaleString(), inline: true },
                    { name: 'Multiplier', value: multiplier > 0 ? `${multiplier}x` : '-', inline: true },
                    { name: 'You Won', value: winAmount.toLocaleString(), inline: true },
                    { name: 'Balance', value: newBalance.toLocaleString(), inline: true }
                )
                .setDescription(`\`\`\`\n${display}\n\`\`\`\n${multiplier > 0 ? `🎉 **WINNER!**` : '💀 Better luck next time!'}`);

            await interaction.reply({ embeds: [embed] });
        }
    }
];

export const init = async (api: any) => {
    api.log("Loopconomy Gambling & Economy Module Loaded (v2 - Improved UI)");
};
