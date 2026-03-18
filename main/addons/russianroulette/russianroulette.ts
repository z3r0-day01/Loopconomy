import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

interface GameState {
    channelId: string;
    player1: string;
    player2: string | null;
    chamber: number;
    currentPlayer: string;
    bet: number;
    status: 'WAITING' | 'PLAYING' | 'ENDED';
}

const activeGames = new Map<string, GameState>();

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('russianroulette')
            .setDescription('Play Russian Roulette against another player!')
            .addUserOption(opt =>
                opt.setName('opponent')
                    .setDescription('User to challenge')
                    .setRequired(true)
            )
            .addIntegerOption(opt =>
                opt.setName('bet')
                    .setDescription('Bet amount')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const opponent = interaction.options.getUser('opponent');
            const bet = interaction.options.getInteger('bet');
            const challenger = interaction.user;

            if (opponent.bot) {
                return interaction.reply({ content: 'You cannot challenge a bot!', ephemeral: true });
            }

            if (opponent.id === challenger.id) {
                return interaction.reply({ content: 'You cannot challenge yourself!', ephemeral: true });
            }

            if (bet <= 0) {
                return interaction.reply({ content: 'Please enter a valid bet.', ephemeral: true });
            }

            const balance1 = await api.getBalance(challenger.id);
            const balance2 = await api.getBalance(opponent.id);

            if (balance1 < bet) {
                return interaction.reply({ content: `You don't have enough coins. Balance: ${balance1}`, ephemeral: true });
            }

            if (activeGames.has(interaction.channelId)) {
                return interaction.reply({ content: 'A game is already in progress in this channel.', ephemeral: true });
            }

            const game: GameState = {
                channelId: interaction.channelId,
                player1: challenger.id,
                player2: null,
                chamber: Math.floor(Math.random() * 6),
                currentPlayer: challenger.id,
                bet: bet,
                status: 'WAITING'
            };

            activeGames.set(interaction.channelId, game);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('rr_accept')
                    .setLabel('Accept Challenge')
                    .setStyle(ButtonStyle.Success)
            );

            const embed = new EmbedBuilder()
                .setTitle('🔫 Russian Roulette')
                .setColor('#FF0000')
                .setDescription(`${challenger} challenges ${opponent} to Russian Roulette!`)
                .addFields(
                    { name: '💰 Bet', value: bet.toLocaleString(), inline: true },
                    { name: '⏰', value: '60 seconds to accept', inline: true }
                );

            await interaction.reply({ content: `<@${opponent.id}>`, embeds: [embed], components: [row] });

            const reply = await interaction.fetchReply();
            const collector = reply.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i: any) => {
                if (i.customId === 'rr_accept') {
                    if (i.user.id !== opponent.id) {
                        return i.reply({ content: 'This challenge is not for you!', ephemeral: true });
                    }

                    if (balance2 < bet) {
                        return i.reply({ content: `You don't have enough coins. Balance: ${balance2}`, ephemeral: true });
                    }

                    game.player2 = opponent.id;
                    game.status = 'PLAYING';
                    
                    await api.subCoins(challenger.id, bet);
                    await api.subCoins(opponent.id, bet);

                    await i.update({ content: '', embeds: [embed.setDescription(`Game started! <@${challenger}> goes first.`)], components: [] });

                    await playTurn(interaction, api, game);
                }
            });

            collector.on('end', async () => {
                if (game.status === 'WAITING') {
                    activeGames.delete(interaction.channelId);
                    try {
                        await interaction.editReply({ content: 'Challenge expired.', components: [] });
                    } catch (e) {}
                }
            });
        }
    }
];

async function playTurn(interaction: any, api: any, game: GameState) {
    const player = game.currentPlayer === game.player1 ? game.player1 : game.player2;
    const playerUser = await interaction.guild.members.fetch(player);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('rr_pull')
            .setLabel('🔫 Pull Trigger')
            .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
        .setTitle('🔫 Russian Roulette')
        .setColor('#FF0000')
        .setDescription(`<@${player}>'s turn to pull the trigger...`)
        .addFields(
            { name: '🎯 Players', value: `<@${game.player1}> vs <@${game.player2}>`, inline: false },
            { name: '💰 Pot', value: (game.bet * 2).toLocaleString(), inline: true }
        );

    const msg = await interaction.channel.send({ content: `<@${player}>`, embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ time: 30000 });

    collector.on('collect', async (i: any) => {
        if (i.user.id !== player) {
            return i.reply({ content: 'Not your turn!', ephemeral: true });
        }

        game.chamber = (game.chamber + 1) % 6;

        if (game.chamber === 0) {
            game.status = 'ENDED';
            activeGames.delete(game.channelId);

            const winner = game.currentPlayer === game.player1 ? game.player2 : game.player1;
            const winAmount = game.bet * 2;

            await api.addCoins(winner, winAmount);

            const resultEmbed = new EmbedBuilder()
                .setTitle('💀 BANG!')
                .setColor('#FF0000')
                .setDescription(`<@${player}> pulled the trigger and... **BANG!**\n\n<@${winner}> wins!`)
                .addFields(
                    { name: '🎉 Winner', value: `<@${winner}>`, inline: true },
                    { name: '💰 Won', value: winAmount.toLocaleString(), inline: true }
                );

            await i.update({ embeds: [resultEmbed], components: [] });

            try {
                await playerUser.timeout(60000, 'Lost Russian Roulette');
                await interaction.channel.send(`⏱️ <@${player}> has been muted for 1 minute!`);
            } catch (e) {
                api.log(`Failed to mute player: ${e}`);
            }
        } else {
            game.currentPlayer = game.currentPlayer === game.player1 ? game.player2! : game.player1;
            
            const safeEmbed = new EmbedBuilder()
                .setTitle('🔫 *click*')
                .setColor('#00FF00')
                .setDescription(`The chamber was empty... <@${game.currentPlayer}>'s turn next.`)
                .addFields(
                    { name: '💰 Pot', value: (game.bet * 2).toLocaleString(), inline: true }
                );

            await i.update({ embeds: [safeEmbed], components: [] });

            await playTurn(interaction, api, game);
        }
    });

    collector.on('end', async () => {
        if (game.status === 'PLAYING') {
            game.status = 'ENDED';
            activeGames.delete(game.channelId);
            
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Game Ended')
                .setDescription('Player timed out.')
                .setColor('#FF0000');
            
            try {
                await msg.edit({ embeds: [timeoutEmbed], components: [] });
            } catch (e) {}
        }
    });
}

export const init = async (api: any) => {
    api.log("Russian Roulette Module Loaded.");
};
