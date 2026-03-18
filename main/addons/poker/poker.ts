import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

// Game state (per channel)
const tables = new Map<string, any>();

// Constants
const SHU_COUNT = 2;
const PENETRATION = 0.75;
const BOT_NAMES = ['Bot_Zero', 'Bot_Vegas', 'Bot_Shark', 'Bot_Moneymaker'];

// Types
interface Player {
    id: string;
    tag: string;
    chips: number;
    hand: string[];
    status: 'IN' | 'FOLDED' | 'ALLIN' | 'OUT';
    isBot: boolean;
    betThisRound: number;
}

interface Table {
    id: string;
    mode: 'NLHE' | 'PLO' | 'STUD' | 'STUD_HILO';
    players: Player[];
    deck: string[];
    pot: number;
    sidePots: { amount: number; eligible: string[] }[];
    bb: number;
    currentBet: number;
    minRaise: number;
    dealerIdx: number;
    status: 'WAITING' | 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';
    community: string[];
    lastAction: number;
    actionIndex: number;
    roundBets: number[];
    lastAggressor: number;
}

// --- DECK MANAGEMENT ---
const createShoe = () => {
    let shoe: string[] = [];
    const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    const suits = ['♠️','♥️','♦️','♣️'];
    for(let d=0; d<SHU_COUNT; d++) {
        for(let s of suits) for(let r of ranks) shoe.push(r+s);
    }
    return shoe.sort(() => Math.random() - 0.5);
};

const getCard = (table: Table) => {
    if (table.deck.length < (104 * (1 - PENETRATION))) table.deck = createShoe();
    return table.deck.pop()!;
};

// --- HAND EVALUATION ---
const handRank = (hand: string[], community: string[]): { rank: number; value: number[] } => {
    const allCards = [...hand, ...community];
    if (allCards.length < 5) return { rank: 0, value: [0] };
    const rankOrder: { [key: string]: number } = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
    const ranks = allCards.map(c => rankOrder[c[0]]).sort((a,b)=>b-a);
    return { rank: 1, value: ranks };
};

const bestHand = (player: Player, community: string[], mode: string): { rank: number; value: number[] } => {
    if (mode === 'PLO') {
        let best = { rank: 0, value: [0] };
        for (let i = 0; i < player.hand.length; i++) {
            for (let j = i+1; j < player.hand.length; j++) {
                const handTwo = [player.hand[i], player.hand[j]];
                for (let a = 0; a < community.length; a++) {
                    for (let b = a+1; b < community.length; b++) {
                        for (let c = b+1; c < community.length; c++) {
                            const five = [...handTwo, community[a], community[b], community[c]];
                            const rank = handRank(five, []);
                            if (rank.rank > best.rank || (rank.rank === best.rank && rank.value > best.value)) best = rank;
                        }
                    }
                }
            }
        }
        return best;
    } else if (mode.startsWith('STUD')) {
        let best = { rank: 0, value: [0] };
        const cards = [...player.hand, ...community];
        for (let a = 0; a < cards.length; a++) {
            for (let b = a+1; b < cards.length; b++) {
                for (let c = b+1; c < cards.length; c++) {
                    for (let d = c+1; d < cards.length; d++) {
                        for (let e = d+1; e < cards.length; e++) {
                            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                            const rank = handRank(five, []);
                            if (rank.rank > best.rank || (rank.rank === best.rank && rank.value > best.value)) best = rank;
                        }
                    }
                }
            }
        }
        return best;
    } else {
        const cards = [...player.hand, ...community];
        let best = { rank: 0, value: [0] };
        for (let a = 0; a < cards.length; a++) {
            for (let b = a+1; b < cards.length; b++) {
                for (let c = b+1; c < cards.length; c++) {
                    for (let d = c+1; d < cards.length; d++) {
                        for (let e = d+1; e < cards.length; e++) {
                            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                            const rank = handRank(five, []);
                            if (rank.rank > best.rank || (rank.rank === best.rank && rank.value > best.value)) best = rank;
                        }
                    }
                }
            }
        }
        return best;
    }
};

// --- SLASH COMMANDS ---
export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('poker')
            .setDescription('High-stakes multi-mode poker')
            .addSubcommand(sub =>
                sub.setName('create')
                    .setDescription('Create a new poker table')
                    .addStringOption(opt =>
                        opt.setName('mode')
                            .setDescription('Game mode')
                            .setRequired(true)
                            .addChoices(
                                { name: 'No Limit Hold\'em', value: 'NLHE' },
                                { name: 'Pot Limit Omaha', value: 'PLO' },
                                { name: '7-Card Stud', value: 'STUD' },
                                { name: '7-Card Stud Hi-Lo', value: 'STUD_HILO' }
                            )
                    )
                    .addIntegerOption(opt =>
                        opt.setName('buyin')
                            .setDescription('Buy-in amount (default 5000)')
                            .setRequired(false)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('bb')
                            .setDescription('Big blind amount (default 100)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('join')
                    .setDescription('Join an existing poker table')
            )
            .addSubcommand(sub =>
                sub.setName('leave')
                    .setDescription('Leave the current table (fold and forfeit)')
            ),
        async execute(interaction: any, api: any) {
            const subcommand = interaction.options.getSubcommand();
            const channelId = interaction.channelId;

            if (subcommand === 'create') {
                const mode = interaction.options.getString('mode');
                const buyin = interaction.options.getInteger('buyin') || 5000;
                const bb = interaction.options.getInteger('bb') || 100;

                if (tables.has(channelId)) {
                    return interaction.reply({ content: "❌ A poker table already exists in this channel!", ephemeral: true });
                }

                const balance = await api.getBalance(interaction.user.id);
                if (balance < buyin) {
                    return interaction.reply({ content: `❌ You need at least ${buyin} coins to create this table.`, ephemeral: true });
                }

                await api.subCoins(interaction.user.id, buyin);

                const table: Table = {
                    id: channelId,
                    mode: mode as any,
                    players: [{
                        id: interaction.user.id,
                        tag: interaction.user.username,
                        chips: buyin,
                        hand: [],
                        status: 'IN',
                        isBot: false,
                        betThisRound: 0
                    }],
                    deck: createShoe(),
                    pot: 0,
                    sidePots: [],
                    bb: bb,
                    currentBet: 0,
                    minRaise: bb,
                    dealerIdx: 0,
                    status: 'WAITING',
                    community: [],
                    lastAction: Date.now(),
                    actionIndex: 0,
                    roundBets: [],
                    lastAggressor: 0
                };
                tables.set(channelId, table);

                const joinRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId('poker_join').setLabel('Join Table').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('poker_start').setLabel('Start Now').setStyle(ButtonStyle.Success)
                );

                await interaction.reply({
                    content: `♦️ **${mode} Table Created!**\nHost: **${interaction.user.username}** | Buy-in: **${buyin}** | BB: **${bb}**\nWaiting for players... Bots will fill to 5 in 2 minutes.`,
                    components: [joinRow]
                });

                const reply = await interaction.fetchReply();
                const collector = reply.createMessageComponentCollector({ time: 120000 });

                collector.on('collect', async (i: any) => {
                    if (i.customId === 'poker_join') {
                        if (table.players.some((p: Player) => p.id === i.user.id)) {
                            return i.reply({ content: "You're already at the table!", ephemeral: true });
                        }
                        if (table.status !== 'WAITING') {
                            return i.reply({ content: "Game already started!", ephemeral: true });
                        }
                        const bal = await api.getBalance(i.user.id);
                        if (bal < buyin) {
                            return i.reply({ content: `You need ${buyin} coins to join.`, ephemeral: true });
                        }
                        await api.subCoins(i.user.id, buyin);
                        table.players.push({
                            id: i.user.id,
                            tag: i.user.username,
                            chips: buyin,
                            hand: [],
                            status: 'IN',
                            isBot: false,
                            betThisRound: 0
                        });
                        await i.reply({ content: `You joined the table! (${table.players.length}/9)`, ephemeral: true });
                    }
                    if (i.customId === 'poker_start' && i.user.id === interaction.user.id) {
                        collector.stop();
                    }
                });

                collector.on('end', async () => {
                    if (table.status !== 'WAITING') return;

                    // Fill with bots to minimum 5
                    while (table.players.length < 5) {
                        const name = BOT_NAMES[table.players.length % BOT_NAMES.length] + Math.floor(Math.random()*99);
                        table.players.push({
                            id: 'BOT_'+name,
                            tag: name,
                            chips: buyin * 2,
                            hand: [],
                            status: 'IN',
                            isBot: true,
                            betThisRound: 0
                        });
                    }

                    await interaction.channel.send("🤖 Bots have filled the empty seats. Starting game...");
                    await startRound(table, interaction, api);
                });
            }

            else if (subcommand === 'join') {
                const table = tables.get(channelId);
                if (!table || table.status !== 'WAITING') {
                    return interaction.reply({ content: "No active join phase in this channel.", ephemeral: true });
                }
                if (table.players.some((p: Player) => p.id === interaction.user.id)) {
                    return interaction.reply({ content: "You're already at the table!", ephemeral: true });
                }

                const buyin = table.players[0].chips;
                const balance = await api.getBalance(interaction.user.id);
                if (balance < buyin) {
                    return interaction.reply({ content: `You need ${buyin} coins to join.`, ephemeral: true });
                }

                await api.subCoins(interaction.user.id, buyin);
                table.players.push({
                    id: interaction.user.id,
                    tag: interaction.user.username,
                    chips: buyin,
                    hand: [],
                    status: 'IN',
                    isBot: false,
                    betThisRound: 0
                });

                await interaction.reply({ content: `✅ ${interaction.user.username} joined the table! (${table.players.length}/9)` });
            }

            else if (subcommand === 'leave') {
                const table = tables.get(channelId);
                if (!table) {
                    return interaction.reply({ content: "No active table in this channel.", ephemeral: true });
                }
                const playerIdx = table.players.findIndex((p: Player) => p.id === interaction.user.id);
                if (playerIdx === -1) {
                    return interaction.reply({ content: "You're not at this table.", ephemeral: true });
                }

                // Fold if in hand
                if (table.status !== 'WAITING' && table.players[playerIdx].status === 'IN') {
                    table.players[playerIdx].status = 'FOLDED';
                    await interaction.channel.send(`💨 **${interaction.user.username}** leaves and folds their hand.`);
                } else {
                    await interaction.reply({ content: "You left the table.", ephemeral: true });
                }

                // Remove from table
                table.players.splice(playerIdx, 1);

                if (table.players.length < 2) {
                    await interaction.channel.send("❌ Not enough players. Table closed.");
                    tables.delete(channelId);
                }
            }
        }
    }
];

// --- GAME LOGIC ---
async function startRound(table: Table, interaction: any, api: any) {
    table.status = 'PREFLOP';
    table.pot = 0;
    table.sidePots = [];
    table.community = [];
    table.currentBet = 0;
    table.minRaise = table.bb;
    table.roundBets = new Array(table.players.length).fill(0);
    table.actionIndex = 0;
    table.lastAggressor = -1;

    // Deal cards based on mode
    for (const p of table.players) {
        p.hand = [];
        p.status = 'IN';
        p.betThisRound = 0;
        let count = (table.mode === 'PLO') ? 4 : (table.mode.startsWith('STUD')) ? 3 : 2;
        for (let i = 0; i < count; i++) p.hand.push(getCard(table));

        if (!p.isBot) {
            try {
                const user = await interaction.client.users.fetch(p.id);
                await user.send(`🎴 **Your Hand (${table.mode}):** ${p.hand.join(' ')}\nTable: <#${table.id}>`);
            } catch {}
        }
    }

    // Apply Blinds/Antes
    if (table.mode.startsWith('STUD')) {
        const ante = Math.floor(table.bb * 0.1);
        table.players.forEach(p => {
            const anteAmount = Math.min(ante, p.chips);
            p.chips -= anteAmount;
            table.pot += anteAmount;
        });
        await api.speak(table.id, `🃏 **7-Card Stud Start.** Antes collected. Bring-in starts...`);
        table.actionIndex = 0;
        table.currentBet = Math.floor(table.bb / 4);
        table.minRaise = table.bb;
        await runBettingRound(table, interaction, api);
    } else {
        const sbIdx = (table.dealerIdx + 1) % table.players.length;
        const bbIdx = (table.dealerIdx + 2) % table.players.length;
        const sbP = table.players[sbIdx];
        const bbP = table.players[bbIdx];

        const sbAmount = Math.min(table.bb / 2, sbP.chips);
        const bbAmount = Math.min(table.bb, bbP.chips);

        sbP.chips -= sbAmount;
        bbP.chips -= bbAmount;
        table.pot += (sbAmount + bbAmount);
        sbP.betThisRound = sbAmount;
        bbP.betThisRound = bbAmount;
        table.roundBets[sbIdx] = sbAmount;
        table.roundBets[bbIdx] = bbAmount;
        table.currentBet = bbAmount;
        table.actionIndex = (bbIdx + 1) % table.players.length;
        table.lastAggressor = bbIdx;

        await api.speak(table.id, `💸 Blinds: **${sbP.tag}** (SB: ${sbAmount}) and **${bbP.tag}** (BB: ${bbAmount}).`);
        await runBettingRound(table, interaction, api);
    }
}

async function runBettingRound(table: Table, interaction: any, api: any) {
    if (table.status === 'SHOWDOWN') return;

    let activeCount = table.players.filter(p => p.status === 'IN' && p.chips > 0).length;
    if (activeCount <= 1) {
        const winner = table.players.find((p: Player) => p.status === 'IN' && p.chips >= 0);
        if (winner) {
            winner.chips += table.pot;
            await api.speak(table.id, `🏆 **${winner.tag}** wins the pot of **${table.pot}** (others folded).`);
            table.pot = 0;
            endRound(table, interaction, api);
        }
        return;
    }

    let betsEqual = false;
    let firstToAct = table.actionIndex;
    let actedThisRound = new Array(table.players.length).fill(false);

    while (!betsEqual) {
        const player = table.players[table.actionIndex];
        if (player.status !== 'IN' || player.chips === 0) {
            table.actionIndex = (table.actionIndex + 1) % table.players.length;
            if (table.actionIndex === firstToAct) break;
            continue;
        }

        const toCall = table.currentBet - player.betThisRound;
        const canCheck = toCall === 0;

        let action: { type: 'fold' | 'call' | 'raise' | 'check'; amount?: number };
        if (player.isBot) {
            action = botDecision(player, table, toCall, canCheck);
        } else {
            action = await getHumanAction(interaction, player, table, toCall, canCheck, api);
            if (!action) action = { type: 'fold' };
        }

        switch (action.type) {
            case 'fold':
                player.status = 'FOLDED';
                await api.speak(table.id, `${player.tag} folds.`);
                break;
            case 'check':
                await api.speak(table.id, `${player.tag} checks.`);
                break;
            case 'call':
                if (player.chips <= toCall) {
                    const callAmount = player.chips;
                    player.chips = 0;
                    player.status = 'ALLIN';
                    player.betThisRound += callAmount;
                    table.roundBets[table.actionIndex] += callAmount;
                    table.pot += callAmount;
                    await api.speak(table.id, `${player.tag} calls all-in (${callAmount}).`);
                } else {
                    player.chips -= toCall;
                    player.betThisRound += toCall;
                    table.roundBets[table.actionIndex] += toCall;
                    table.pot += toCall;
                    await api.speak(table.id, `${player.tag} calls ${toCall}.`);
                }
                break;
            case 'raise':
                const raiseAmount = action.amount!;
                const totalBet = player.betThisRound + toCall + raiseAmount;
                if (totalBet >= player.chips) {
                    const allInAmount = player.chips;
                    player.chips = 0;
                    player.status = 'ALLIN';
                    player.betThisRound += allInAmount;
                    table.roundBets[table.actionIndex] += allInAmount;
                    table.pot += allInAmount;
                    table.currentBet = player.betThisRound;
                    table.minRaise = raiseAmount;
                    table.lastAggressor = table.actionIndex;
                    await api.speak(table.id, `${player.tag} raises all-in (${allInAmount}).`);
                } else {
                    player.chips -= totalBet;
                    player.betThisRound = totalBet;
                    table.roundBets[table.actionIndex] = totalBet;
                    table.pot += totalBet;
                    table.currentBet = totalBet;
                    table.minRaise = raiseAmount;
                    table.lastAggressor = table.actionIndex;
                    await api.speak(table.id, `${player.tag} raises to ${totalBet}.`);
                }
                break;
        }

        actedThisRound[table.actionIndex] = true;
        table.actionIndex = (table.actionIndex + 1) % table.players.length;

        const activePlayers = table.players.filter(p => p.status === 'IN' || p.status === 'ALLIN');
        const allBetsEqual = activePlayers.every(p => p.betThisRound === table.currentBet || p.status === 'ALLIN' || p.chips === 0);
        const allActed = activePlayers.every(p => actedThisRound[table.players.indexOf(p)]);
        const aggressorActed = table.lastAggressor === -1 || actedThisRound[table.lastAggressor];

        if (allBetsEqual && allActed && aggressorActed) {
            betsEqual = true;
            break;
        }

        if (table.actionIndex === firstToAct && table.lastAggressor === -1) {
            betsEqual = true;
            break;
        }
    }

    table.players.forEach(p => p.betThisRound = 0);
    table.currentBet = 0;
    table.minRaise = table.bb;
    table.lastAggressor = -1;

    await progressStreet(table, interaction, api);
}

async function getHumanAction(interaction: any, player: Player, table: Table, toCall: number, canCheck: boolean, api: any): Promise<any> {
    const channel = interaction.channel;
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (canCheck) {
        row.addComponents(new ButtonBuilder().setCustomId('check').setLabel('Check').setStyle(ButtonStyle.Success));
    } else {
        row.addComponents(new ButtonBuilder().setCustomId('call').setLabel(`Call ${toCall}`).setStyle(ButtonStyle.Primary));
    }
    row.addComponents(new ButtonBuilder().setCustomId('fold').setLabel('Fold').setStyle(ButtonStyle.Danger));

    if (!canCheck && player.chips >= toCall + table.minRaise) {
        row.addComponents(new ButtonBuilder().setCustomId('raise').setLabel(`Raise to ${toCall + table.minRaise}`).setStyle(ButtonStyle.Secondary));
    }

    const embed = api.createEmbed(
        `${player.tag}'s Turn`,
        `**Mode:** ${table.mode}\n**Pot:** ${table.pot}\n**Current Bet:** ${table.currentBet}\n**Your Hand:** ${player.hand.join(' ')}\n**Community:** ${table.community.length ? table.community.join(' ') : 'None'}\n**Your Chips:** ${player.chips}`,
        '#00ff00'
    );

    const turnMsg = await channel.send({ content: `<@${player.id}>`, embeds: [embed], components: [row] });
    try {
        const i = await turnMsg.awaitMessageComponent({ filter: (int: any) => int.user.id === player.id, time: 60000, componentType: ComponentType.Button });
        await i.deferUpdate();
        await turnMsg.delete();
        if (i.customId === 'fold') return { type: 'fold' };
        if (i.customId === 'check') return { type: 'check' };
        if (i.customId === 'call') return { type: 'call' };
        if (i.customId === 'raise') return { type: 'raise', amount: table.minRaise };
    } catch {
        await turnMsg.delete();
        return null;
    }
}

function botDecision(player: Player, table: Table, toCall: number, canCheck: boolean): any {
    if (canCheck) return { type: 'check' };
    const rand = Math.random();
    if (rand < 0.7) return { type: 'call' };
    if (rand < 0.9 && player.chips >= toCall + table.minRaise) return { type: 'raise', amount: table.minRaise };
    return { type: 'fold' };
}

async function progressStreet(table: Table, interaction: any, api: any) {
    if (table.status === 'PREFLOP') {
        table.status = 'FLOP';
        if (!table.mode.startsWith('STUD')) {
            table.community.push(getCard(table), getCard(table), getCard(table));
            await api.speak(table.id, `🌊 **The Flop:** ${table.community.join(' ')}`);
            table.actionIndex = (table.dealerIdx + 1) % table.players.length;
            await runBettingRound(table, interaction, api);
        } else {
            for (const p of table.players) {
                if (p.status === 'IN' || p.status === 'ALLIN') p.hand.push(getCard(table));
            }
            await api.speak(table.id, `🃏 **4th Street:** Cards dealt.`);
            table.actionIndex = (table.dealerIdx + 1) % table.players.length;
            await runBettingRound(table, interaction, api);
        }
    } else if (table.status === 'FLOP') {
        table.status = 'TURN';
        table.community.push(getCard(table));
        await api.speak(table.id, `🃏 **The Turn:** ${table.community.join(' ')}`);
        table.actionIndex = (table.dealerIdx + 1) % table.players.length;
        await runBettingRound(table, interaction, api);
    } else if (table.status === 'TURN') {
        table.status = 'RIVER';
        table.community.push(getCard(table));
        await api.speak(table.id, `🌊 **The River:** ${table.community.join(' ')}`);
        table.actionIndex = (table.dealerIdx + 1) % table.players.length;
        await runBettingRound(table, interaction, api);
    } else {
        table.status = 'SHOWDOWN';
        await determineWinner(table, interaction, api);
    }
}

async function determineWinner(table: Table, interaction: any, api: any) {
    const activePlayers = table.players.filter(p => p.status !== 'FOLDED' && p.chips >= 0);
    if (activePlayers.length === 0) {
        endRound(table, interaction, api);
        return;
    }

    const mainPot = table.pot;
    const winners: { player: Player; share: number }[] = [];

    if (table.mode === 'STUD_HILO') {
        const share = Math.floor(mainPot / activePlayers.length);
        for (const p of activePlayers) {
            await api.addCoins(p.id, share);
            winners.push({ player: p, share });
        }
    } else {
        let bestRank = -1;
        let bestValue: number[] = [];
        for (const p of activePlayers) {
            const rank = bestHand(p, table.community, table.mode);
            if (rank.rank > bestRank || (rank.rank === bestRank && rank.value > bestValue)) {
                bestRank = rank.rank;
                bestValue = rank.value;
            }
        }
        const bestPlayers = activePlayers.filter(p => {
            const rank = bestHand(p, table.community, table.mode);
            return rank.rank === bestRank && rank.value.join() === bestValue.join();
        });
        const share = Math.floor(mainPot / bestPlayers.length);
        for (const p of bestPlayers) {
            await api.addCoins(p.id, share);
            winners.push({ player: p, share });
        }
    }

    let result = `🏁 **Showdown!**\n`;
    for (const w of winners) {
        result += `🏆 **${w.player.tag}** wins **${w.share}** with hand: ${w.player.hand.join(' ')}\n`;
    }
    await api.speak(table.id, result);
    endRound(table, interaction, api);
}

function endRound(table: Table, interaction: any, api: any) {
    table.status = 'WAITING';
    table.dealerIdx = (table.dealerIdx + 1) % table.players.length;
    table.players = table.players.filter(p => p.chips > 0);

    if (table.players.length < 2) {
        api.speak(table.id, "❌ Not enough players. Table closed.");
        tables.delete(table.id);
    } else {
        api.speak(table.id, "🔄 New round starts in 30 seconds...");
        setTimeout(() => startRound(table, interaction, api), 30000);
    }
}

export const init = async (api: any) => {
    api.log("High-Stakes Multi-Mode Poker Module Loaded.");
};
