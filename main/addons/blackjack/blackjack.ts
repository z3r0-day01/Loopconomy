import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

// Game state (per channel)
const activeTables = new Map<string, any>();

// Deck constants
const DECK_COUNT = 6;
const PENETRATION = 0.75;
const BJ_PAYOUT = 1.5;
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['♠️','♥️','♦️','♣️'];

let shoe: string[] = [];

const createShoe = () => {
    let newShoe: string[] = [];
    for (let i = 0; i < DECK_COUNT; i++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) newShoe.push(`${rank}${suit}`);
        }
    }
    // Fisher-Yates Shuffle
    for (let i = newShoe.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newShoe[i], newShoe[j]] = [newShoe[j], newShoe[i]];
    }
    return newShoe;
};

const drawCard = (api: any) => {
    if (shoe.length < (DECK_COUNT * 52 * (1 - PENETRATION))) {
        api.log("Shoe penetration reached. Reshuffling...");
        shoe = createShoe();
    }
    return shoe.pop()!;
};

const getVal = (hand: string[]) => {
    let val = 0, aces = 0;
    for (const card of hand) {
        const rank = card.slice(0, -2);
        if (rank === 'A') aces++;
        else if (['J','Q','K'].includes(rank)) val += 10;
        else val += parseInt(rank);
    }
    for (let i = 0; i < aces; i++) {
        val += (val + 11 <= 21) ? 11 : 1;
    }
    return val;
};

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('blackjack')
            .setDescription('Start a blackjack game')
            .addIntegerOption(opt => opt.setName('bet').setDescription('Your bet').setRequired(true)),
        async execute(interaction: any, api: any) {
            const bet = interaction.options.getInteger('bet');
            const channelId = interaction.channelId;

            if (activeTables.has(channelId)) {
                return interaction.reply({ content: "A game is already in progress in this channel!", ephemeral: true });
            }

            const balance = await api.getBalance(interaction.user.id);
            if (balance < bet) {
                return interaction.reply({ content: "❌ You don't have enough coins.", ephemeral: true });
            }

            const table: any = {
                players: [{
                    id: interaction.user.id,
                    tag: interaction.user.username,
                    hands: [[] as string[]],
                    bets: [bet],
                    done: false
                }],
                dealerHand: [],
                status: 'JOINING'
            };
            activeTables.set(channelId, table);

            const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('bj_join').setLabel('Join Table').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('bj_start').setLabel('Deal Now').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({
                content: `🎰 **Blackjack Table Opening!**\nHost: **${interaction.user.username}** | Bet: **${bet}**\nJoin now! Dealing in 30 seconds...`,
                components: [joinRow]
            });

            const reply = await interaction.fetchReply();
            const collector = reply.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async (i: any) => {
                if (i.customId === 'bj_join') {
                    if (table.players.some((p: any) => p.id === i.user.id)) {
                        return i.reply({ content: "You're already in!", ephemeral: true });
                    }
                    const bal = await api.getBalance(i.user.id);
                    if (bal < bet) {
                        return i.reply({ content: "You can't afford the entry bet.", ephemeral: true });
                    }
                    table.players.push({ id: i.user.id, tag: i.user.username, hands: [[]], bets: [bet], done: false });
                    await i.reply({ content: `You joined the table!`, ephemeral: true });
                }
                if (i.customId === 'bj_start' && i.user.id === interaction.user.id) {
                    collector.stop();
                }
            });

            collector.on('end', async () => {
                table.status = 'PLAYING';
                for (const p of table.players) {
                    await api.subCoins(p.id, bet);
                    (p.hands[0] as string[]) = [drawCard(api), drawCard(api)];
                }
                (table.dealerHand as string[]) = [drawCard(api), drawCard(api)];
                await runGame(interaction, table, api);
            });
        }
    }
];

async function runGame(interaction: any, table: any, api: any) {
    const dealerVal = getVal(table.dealerHand);

    // Hole Card Peek - Dealer Blackjack check
    if (dealerVal === 21) {
        return finishGame(interaction, table, api, "Dealer has Blackjack.");
    }

    // Player turns
    for (const player of table.players) {
        await playPlayer(interaction, table, player, api);
    }

    // Dealer Turn (S17 Rule: Dealer stands on all 17s)
    while (getVal(table.dealerHand) < 17) {
        table.dealerHand.push(drawCard(api));
    }

    finishGame(interaction, table, api);
}

async function playPlayer(interaction: any, table: any, player: any, api: any) {
    const channel = interaction.channel;

    for (let hIdx = 0; hIdx < player.hands.length; hIdx++) {
        let hand = player.hands[hIdx];
        let active = true;

        while (active) {
            const val = getVal(hand);
            if (val >= 21) break;

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Success),
            );

            // Split Check (Unlimited splits + different rank face cards allowed)
            const rank0 = hand[0].slice(0, -2);
            const rank1 = hand[1].slice(0, -2);
            const canSplit = hand.length === 2 && (rank0 === rank1 || (['10','J','Q','K'].includes(rank0) && ['10','J','Q','K'].includes(rank1)));
            if (canSplit) row.addComponents(new ButtonBuilder().setCustomId('split').setLabel('Split').setStyle(ButtonStyle.Primary));

            // Double Check (Any two cards)
            if (hand.length === 2) row.addComponents(new ButtonBuilder().setCustomId('double').setLabel('Double').setStyle(ButtonStyle.Danger));

            // Surrender Check (Late Surrender)
            if (hand.length === 2 && hIdx === 0) row.addComponents(new ButtonBuilder().setCustomId('surrender').setLabel('Surrender').setStyle(ButtonStyle.Secondary));

            const embed = api.createEmbed(
                `Blackjack: ${player.tag}'s Turn`,
                `Dealer Upcard: **${table.dealerHand[0]}**\n\nYour Hand: ${hand.join(' ')} (Value: **${val}**)\nBet: **${player.bets[hIdx]}**`,
                "#00ff00"
            );

            const turnMsg = await channel.send({ content: `<@${player.id}>`, embeds: [embed], components: [row] });

            try {
                const i = await turnMsg.awaitMessageComponent({ filter: (int: any) => int.user.id === player.id, time: 60000, componentType: ComponentType.Button });
                await i.deferUpdate();

                if (i.customId === 'hit') {
                    hand.push(drawCard(api));
                } else if (i.customId === 'stand') {
                    active = false;
                } else if (i.customId === 'double') {
                    const bal = await api.getBalance(player.id);
                    if (bal >= player.bets[hIdx]) {
                        await api.subCoins(player.id, player.bets[hIdx]);
                        player.bets[hIdx] *= 2;
                        hand.push(drawCard(api));
                        active = false;
                    }
                } else if (i.customId === 'split') {
                    const bal = await api.getBalance(player.id);
                    if (bal >= player.bets[hIdx]) {
                        await api.subCoins(player.id, player.bets[hIdx]);
                        const newHand = [hand.pop()!];
                        hand.push(drawCard(api));
                        newHand.push(drawCard(api));
                        player.hands.push(newHand);
                        player.bets.push(player.bets[hIdx]);
                    }
                } else if (i.customId === 'surrender') {
                    await api.addCoins(player.id, Math.floor(player.bets[hIdx] / 2));
                    player.hands[hIdx] = ['SURRENDERED'];
                    active = false;
                }
                await turnMsg.delete();
            } catch {
                active = false; // Timeout
            }
        }
    }
}

async function finishGame(interaction: any, table: any, api: any, reason = "") {
    const channel = interaction.channel;
    const dealerVal = getVal(table.dealerHand);
    let results = `**Dealer Hand:** ${table.dealerHand.join(' ')} (Value: **${dealerVal}**)\n${reason}\n\n`;

    for (const p of table.players) {
        results += `**${p.tag}:**\n`;
        for (let i = 0; i < p.hands.length; i++) {
            const hand = p.hands[i];
            if (hand[0] === 'SURRENDERED') {
                results += `  Hand ${i+1}: Surrendered (-50%)\n`;
                continue;
            }
            const val = getVal(hand);
            const bet = p.bets[i];

            if (val > 21) {
                results += `  Hand ${i+1}: ${hand.join(' ')} - **BUST** 💀\n`;
            } else if (dealerVal > 21 || val > dealerVal) {
                const win = (val === 21 && hand.length === 2) ? bet * (1 + BJ_PAYOUT) : bet * 2;
                await api.addCoins(p.id, Math.floor(win));
                results += `  Hand ${i+1}: ${hand.join(' ')} - **WIN** 🏆 (+${Math.floor(win)})\n`;
            } else if (val === dealerVal) {
                await api.addCoins(p.id, bet);
                results += `  Hand ${i+1}: ${hand.join(' ')} - **PUSH** 🤝\n`;
            } else {
                results += `  Hand ${i+1}: ${hand.join(' ')} - **LOSS** ❌\n`;
            }
        }
    }

    const embed = api.createEmbed("Table Results", results, "#ffffff");
    await channel.send({ embeds: [embed] });
    activeTables.delete(interaction.channelId);
}

export const init = async (api: any) => {
    api.log("Blackjack Pro-Rules Module Loaded.");
    shoe = createShoe();
};
