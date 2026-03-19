import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import * as path from 'path';

interface CopyrightEntry {
    id: number;
    guild_id: string;
    owner_id: string;
    owner_name: string;
    term: string;
    fine_amount: number;
    is_permanent: boolean;
    created_at: Date;
}

let db: any = null;
let poolRef: any = null;

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('copyright')
            .setDescription('Manage copyrighted content')
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Add a new copyrighted term')
                    .addStringOption(opt =>
                        opt.setName('term')
                            .setDescription('The term to copyright')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('fine')
                            .setDescription('Fine amount for violations (default: 100)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('register')
                    .setDescription('Copyright an existing message by ID')
                    .addStringOption(opt =>
                        opt.setName('message_id')
                            .setDescription('Message ID to copyright')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('fine')
                            .setDescription('Fine amount for violations (default: 100)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Remove your copyrighted term')
                    .addStringOption(opt =>
                        opt.setName('term')
                            .setDescription('The term to remove')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('fine')
                    .setDescription('Update fine amount for your copyright')
                    .addStringOption(opt =>
                        opt.setName('term')
                            .setDescription('The term to update')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('New fine amount')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List copyrighted terms in this server')
            )
            .addSubcommand(sub =>
                sub.setName('earnings')
                    .setDescription('View your copyright earnings')
            )
            .addSubcommand(sub =>
                sub.setName('shop')
                    .setDescription('Open the copyright marketplace')
            )
            .addSubcommand(sub =>
                sub.setName('sell')
                    .setDescription('List your copyright on the shop')
                    .addStringOption(opt =>
                        opt.setName('term')
                            .setDescription('The term to sell')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('price')
                            .setDescription('Selling price')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('buy')
                    .setDescription('Buy a copyright listing')
                    .addStringOption(opt =>
                        opt.setName('listing_id')
                            .setDescription('Listing ID to purchase')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('treasury')
                    .setDescription('View server treasury (jackpot pool)')
            ),
        async execute(interaction: any, api: any) {
            const subcommand = interaction.options.getSubcommand();
            const pool = poolRef || api.client.pool;
            if (!pool) {
                return interaction.reply({ content: 'Database not connected', ephemeral: true });
            }
            const userId = interaction.user.id;
            const userName = interaction.user.username;
            const guildId = interaction.guildId;

            switch (subcommand) {
                case 'add': {
                    const term = interaction.options.getString('term').toLowerCase().trim();
                    const fine = interaction.options.getInteger('fine') || 100;

                    if (term.length < 2 || term.length > 500) {
                        return interaction.reply({ content: 'Term must be 2-500 characters', ephemeral: true });
                    }

                    try {
                        await pool.query(
                            `INSERT INTO copyrights (guild_id, owner_id, owner_name, term, fine_amount, is_permanent)
                             VALUES ($1, $2, $3, $4, $5, FALSE)
                             ON CONFLICT (guild_id, term) DO UPDATE SET fine_amount = $5`,
                            [guildId, userId, userName, term, fine]
                        );

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Copyright Registered')
                            .setColor('#00FF00')
                            .setDescription(`"${term}" is now copyrighted!`)
                            .addFields(
                                { name: 'Owner', value: `<@${userId}>`, inline: true },
                                { name: 'Fine', value: `${fine} coins`, inline: true },
                                { name: 'Type', value: 'Custom term', inline: true }
                            );

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'register': {
                    const messageId = interaction.options.getString('message_id');
                    const fine = interaction.options.getInteger('fine') || 100;

                    try {
                        const channel = interaction.channel;
                        const message = await channel.messages.fetch(messageId);

                        if (!message) {
                            return interaction.reply({ content: 'Message not found', ephemeral: true });
                        }

                        const content = message.content.toLowerCase().trim();
                        if (content.length < 2) {
                            return interaction.reply({ content: 'Message content too short', ephemeral: true });
                        }

                        await pool.query(
                            `INSERT INTO copyrights (guild_id, owner_id, owner_name, term, fine_amount, is_permanent)
                             VALUES ($1, $2, $3, $4, $5, FALSE)
                             ON CONFLICT (guild_id, term) DO UPDATE SET fine_amount = $5`,
                            [guildId, userId, userName, content, fine]
                        );

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Message Copyrighted')
                            .setColor('#00FF00')
                            .setDescription(`This message is now copyrighted by <@${userId}>`)
                            .addFields(
                                { name: 'Content', value: content.substring(0, 100) + (content.length > 100 ? '...' : ''), inline: false },
                                { name: 'Fine', value: `${fine} coins`, inline: true }
                            );

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'remove': {
                    const term = interaction.options.getString('term').toLowerCase().trim();

                    try {
                        const existing = await pool.query(
                            'SELECT * FROM copyrights WHERE guild_id = $1 AND term = $2 AND owner_id = $3 AND is_permanent = FALSE',
                            [guildId, term, userId]
                        );

                        if (existing.rows.length === 0) {
                            return interaction.reply({ content: 'You can only remove your own non-permanent copyrights', ephemeral: true });
                        }

                        await pool.query('DELETE FROM copyrights WHERE id = $1', [existing.rows[0].id]);

                        await interaction.reply({ content: `✅ Removed copyright for "${term}"`, ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'fine': {
                    const term = interaction.options.getString('term').toLowerCase().trim();
                    const amount = interaction.options.getInteger('amount');

                    if (amount < 0) {
                        return interaction.reply({ content: 'Fine cannot be negative', ephemeral: true });
                    }

                    try {
                        const existing = await pool.query(
                            'SELECT * FROM copyrights WHERE guild_id = $1 AND term = $2 AND owner_id = $3',
                            [guildId, term, userId]
                        );

                        if (existing.rows.length === 0) {
                            return interaction.reply({ content: 'Copyright not found or not owned by you', ephemeral: true });
                        }

                        if (existing.rows[0].is_permanent) {
                            return interaction.reply({ content: 'Cannot modify permanent copyrights', ephemeral: true });
                        }

                        await pool.query('UPDATE copyrights SET fine_amount = $1 WHERE id = $2', [amount, existing.rows[0].id]);

                        await interaction.reply({ content: `✅ Updated fine for "${term}" to ${amount} coins`, ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'list': {
                    try {
                        const results = await pool.query(
                            'SELECT * FROM copyrights WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 25',
                            [guildId]
                        );

                        if (results.rows.length === 0) {
                            return interaction.reply({ content: 'No copyrights in this server', ephemeral: true });
                        }

                        const embeds = [];
                        for (let i = 0; i < results.rows.length; i += 10) {
                            const page = results.rows.slice(i, i + 10);
                            const embed = new EmbedBuilder()
                                .setTitle('📋 Copyrighted Terms')
                                .setColor('#0099ff')
                                .setDescription(`Total: ${results.rows.length}`)
                                .setFooter({ text: `Page ${Math.floor(i / 10) + 1}/${Math.ceil(results.rows.length / 10)}` });

                            for (const row of page) {
                                const ownerMention = `<@${row.owner_id}>`;
                                const type = row.is_permanent ? '🔒 Permanent' : '✏️ Custom';
                                embed.addFields({
                                    name: `"${row.term}"`,
                                    value: `Owner: ${ownerMention} | Fine: ${row.fine_amount} | ${type}`,
                                    inline: false
                                });
                            }
                            embeds.push(embed);
                        }

                        await interaction.reply({ embeds, ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'earnings': {
                    try {
                        const results = await pool.query(
                            `SELECT SUM(owner_share) as total FROM copyright_earnings 
                             WHERE copyright_id IN (SELECT id FROM copyrights WHERE owner_id = $1)`,
                            [userId]
                        );

                        const total = results.rows[0]?.total || 0;

                        const embed = new EmbedBuilder()
                            .setTitle('💰 Copyright Earnings')
                            .setColor('#98c379')
                            .setDescription(`Total earnings from copyright fines (80% share)`)
                            .addFields(
                                { name: 'Total Earned', value: `${total} coins`, inline: true }
                            );

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'treasury': {
                    try {
                        const result = await pool.query(
                            'SELECT balance, jackpot_threshold FROM server_treasury WHERE guild_id = $1',
                            [guildId]
                        );

                        const treasury = result.rows[0] || { balance: 0, jackpot_threshold: 50000 };

                        const embed = new EmbedBuilder()
                            .setTitle('🏦 Server Treasury')
                            .setColor('#e5c07b')
                            .setDescription(`20% of all copyright fines go here`)
                            .addFields(
                                { name: 'Current Balance', value: `${treasury.balance} coins`, inline: true },
                                { name: 'Jackpot Threshold', value: `${treasury.jackpot_threshold} coins`, inline: true }
                            );

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'shop': {
                    await showShop(interaction, pool, guildId, userId);
                    break;
                }

                case 'sell': {
                    const term = interaction.options.getString('term').toLowerCase().trim();
                    const price = interaction.options.getInteger('price');

                    if (price < 1) {
                        return interaction.reply({ content: 'Price must be at least 1 coin', ephemeral: true });
                    }

                    try {
                        const existing = await pool.query(
                            'SELECT * FROM copyrights WHERE guild_id = $1 AND term = $2 AND owner_id = $3 AND is_permanent = FALSE',
                            [guildId, term, userId]
                        );

                        if (existing.rows.length === 0) {
                            return interaction.reply({ content: 'Copyright not found or not owned by you', ephemeral: true });
                        }

                        await pool.query(
                            `INSERT INTO copyright_shop_listings (copyright_id, seller_id, seller_name, price)
                             VALUES ($1, $2, $3, $4)`,
                            [existing.rows[0].id, userId, userName, price]
                        );

                        await interaction.reply({ content: `✅ Listed "${term}" for ${price} coins!`, ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'buy': {
                    const listingId = interaction.options.getString('listing_id');

                    try {
                        const listing = await pool.query(
                            'SELECT * FROM copyright_shop_listings WHERE id = $1 AND is_active = TRUE',
                            [listingId]
                        );

                        if (listing.rows.length === 0) {
                            return interaction.reply({ content: 'Listing not found', ephemeral: true });
                        }

                        const item = listing.rows[0];

                        if (item.seller_id === userId) {
                            return interaction.reply({ content: 'You cannot buy your own listing', ephemeral: true });
                        }

                        const buyerBalance = await api.getBalance(userId);
                        if (buyerBalance < item.price) {
                            return interaction.reply({ content: `Insufficient funds (need ${item.price}, have ${buyerBalance})`, ephemeral: true });
                        }

                        const buyerTag = interaction.user.username;
                        const royaltyEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

                        await pool.query('BEGIN');
                        await pool.query('UPDATE economy SET coins = coins - $1 WHERE uid = $2', [item.price, userId]);
                        await pool.query('UPDATE economy SET coins = coins + $1 WHERE uid = $2', [item.price, item.seller_id]);
                        await pool.query('UPDATE copyrights SET owner_id = $1, owner_name = $2 WHERE id = $3', [userId, buyerTag, item.copyright_id]);
                        await pool.query(
                            'UPDATE copyright_shop_listings SET is_active = FALSE, royalty_end_date = $1, original_owner_id = $2, original_owner_name = $3 WHERE id = $4',
                            [royaltyEnd, item.seller_id, item.seller_name, listingId]
                        );
                        await pool.query('COMMIT');

                        await interaction.reply({ content: `✅ Purchased copyright! You are now the owner. Royalty period: 3 days`, ephemeral: true });
                    } catch (e: any) {
                        await pool.query('ROLLBACK');
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }
            }
        }
    }
];

async function showShop(interaction: any, pool: any, guildId: string, userId: string) {
    try {
        const listings = await pool.query(
            `SELECT l.*, c.term, c.fine_amount 
             FROM copyright_shop_listings l 
             JOIN copyrights c ON l.copyright_id = c.id 
             WHERE l.is_active = TRUE AND c.guild_id = $1
             ORDER BY l.created_at DESC LIMIT 10`,
            [guildId]
        );

        if (listings.rows.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🏪 Copyright Shop')
                .setColor('#0099ff')
                .setDescription('No active listings. Use `/copyright sell <term> <price>` to list yours!');

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏪 Copyright Marketplace')
            .setColor('#0099ff')
            .setDescription(`Active listings (${listings.rows.length})`)
            .setFooter({ text: 'Use /copyright buy <listing_id> to purchase' });

        for (const row of listings.rows) {
            embed.addFields({
                name: `ID: ${row.id} - "${row.term}"`,
                value: `Seller: ${row.seller_name} | Price: ${row.price} coins | Fine: ${row.fine_amount}`,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e: any) {
        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
    }
}

export const init = async (api: any) => {
    poolRef = api.client.pool || api.pool;
    
    api.listen('messageCreate', async (msg: any) => {
        if (msg.author.bot) return;
        if (!msg.guild) return;

        const content = msg.content.toLowerCase().trim();
        if (content.length < 2) return;

        const guildId = msg.guildId;
        const userId = msg.author.id;
        const userName = msg.author.username;

        try {
            const pool = poolRef || api.client.pool;
            if (!pool) return;

            const copyrights = await pool.query(
                'SELECT * FROM copyrights WHERE guild_id = $1 OR guild_id = $2',
                [guildId, 'GLOBAL']
            );

            for (const copyright of copyrights.rows) {
                if (content.includes(copyright.term.toLowerCase())) {
                    if (copyright.owner_id === userId) continue;

                    const fine = copyright.fine_amount;

                    if (fine > 0) {
                        const ownerShare = Math.floor(fine * 0.8);
                        const treasuryShare = Math.floor(fine * 0.2);

                        await pool.query('UPDATE economy SET coins = coins - $1 WHERE uid = $2', [fine, userId]);
                        await pool.query('UPDATE economy SET coins = coins + $1 WHERE uid = $2', [ownerShare, copyright.owner_id]);

                        await pool.query(
                            `INSERT INTO server_treasury (guild_id, balance) VALUES ($1, $2)
                             ON CONFLICT (guild_id) DO UPDATE SET balance = server_treasury.balance + $2`,
                            [guildId, treasuryShare]
                        );

                        await pool.query(
                            `INSERT INTO copyright_earnings (copyright_id, violator_id, violator_name, fine_collected, owner_share, treasury_share)
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            [copyright.id, userId, userName, fine, ownerShare, treasuryShare]
                        );
                    }

                    const ownerMention = `<@${copyright.owner_id}>`;
                    const emojis = ['⚠️', '©', '🚫'];
                    for (const emoji of emojis) {
                        try { await msg.react(emoji); } catch (e) {}
                    }

                    const replyMsg = fine > 0
                        ? `⚠️ <@${userId}>, "${copyright.term}" is copyrighted by ${ownerMention}! Fine: ${fine} coins (-80% to owner, -20% to treasury)`
                        : `⚠️ <@${userId}>, "${copyright.term}" is copyrighted by ${ownerMention}!`;

                    try { await msg.reply(replyMsg); } catch (e) {}

                    api.log(`[COPYRIGHT] ${userName} violated "${copyright.term}" - Fine: ${fine}`);
                    break;
                }
            }
        } catch (e) {
            api.log(`[COPYRIGHT] Error checking message: ${e}`);
        }
    });

    api.log("Copyright Management Module Loaded (v2 - Database)");
};
