import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

interface ShopListing {
    id: number;
    item_type: string;
    item_id: number;
    item_name: string;
    item_description: string;
    seller_id: string;
    seller_name: string;
    price: number;
    is_active: boolean;
    created_at: Date;
}

let poolRef: any = null;

const ITEM_TYPES = {
    copyright: {
        name: 'Copyright',
        emoji: '©️',
        description: 'A copyrighted term that generates fines',
        table: 'copyrights',
        price_field: null
    }
};

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('shop')
            .setDescription('Marketplace - buy and sell items')
            .addSubcommand(sub =>
                sub.setName('copyright')
                    .setDescription('Browse copyright marketplace')
            )
            .addSubcommand(sub =>
                sub.setName('sell')
                    .setDescription('List an item for sale')
                    .addStringOption(opt =>
                        opt.setName('type')
                            .setDescription('Item type to sell')
                            .setRequired(true)
                            .addChoices(
                                { name: '©️ Copyright', value: 'copyright' }
                            )
                    )
                    .addStringOption(opt =>
                        opt.setName('term')
                            .setDescription('The copyright term to sell')
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
                    .setDescription('Purchase a listing')
                    .addStringOption(opt =>
                        opt.setName('listing_id')
                            .setDescription('Listing ID to purchase')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('View active listings')
                    .addStringOption(opt =>
                        opt.setName('type')
                            .setDescription('Filter by item type')
                            .setRequired(false)
                            .addChoices(
                                { name: '©️ Copyright', value: 'copyright' }
                            )
                    )
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('Show listings by specific user')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('mylistings')
                    .setDescription('View your active listings')
            )
            .addSubcommand(sub =>
                sub.setName('delist')
                    .setDescription('Remove your listing')
                    .addStringOption(opt =>
                        opt.setName('listing_id')
                            .setDescription('Listing ID to remove')
                            .setRequired(true)
                    )
            ),
        async execute(interaction: any, api: any) {
            const pool = poolRef || interaction.client.pool;
            if (!pool) {
                return interaction.reply({ content: 'Database not connected', ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();
            const userId = interaction.user.id;
            const userName = interaction.user.username;
            const guildId = interaction.guildId;

            switch (subcommand) {
                case 'copyright':
                case 'list': {
                    const itemType = interaction.options.getString('type') || 'copyright';
                    const targetUser = interaction.options.getUser('user');

                    let query = `
                        SELECT * FROM shop_listings 
                        WHERE is_active = TRUE AND item_type = $1 AND guild_id = $2
                    `;
                    const params = [itemType, guildId];

                    if (targetUser) {
                        query += ` AND seller_id = $3`;
                        params.push(targetUser.id);
                    }

                    query += ` ORDER BY created_at DESC LIMIT 20`;

                    try {
                        const result = await pool.query(query, params);
                        const listings = result.rows;

                        if (listings.length === 0) {
                            const typeName = ITEM_TYPES[itemType]?.name || itemType;
                            const embed = new EmbedBuilder()
                                .setTitle(`🏪 ${typeName} Shop`)
                                .setColor('#0099ff')
                                .setDescription(`No active ${typeName.toLowerCase()} listings. Use \`/shop sell\` to create one!`);

                            return interaction.reply({ embeds: [embed], ephemeral: true });
                        }

                        const typeInfo = ITEM_TYPES[itemType] || { name: itemType, emoji: '📦' };
                        
                        const embed = new EmbedBuilder()
                            .setTitle(`${typeInfo.emoji} ${typeInfo.name} Marketplace`)
                            .setColor('#0099ff')
                            .setDescription(`**${listings.length} active listing${listings.length !== 1 ? 's' : ''}**`)
                            .setFooter({ text: `Use /shop buy <id> to purchase | Page 1/1` });

                        for (const listing of listings) {
                            const priceEmoji = listing.price >= 10000 ? '💰' : listing.price >= 1000 ? '🪙' : '💵';
                            embed.addFields({
                                name: `ID: ${listing.id} | ${listing.item_name}`,
                                value: `Seller: ${listing.seller_name} | ${priceEmoji} ${listing.price.toLocaleString()} coins\n${listing.item_description || 'No description'}`,
                                inline: false
                            });
                        }

                        const components = [];
                        if (listings.length >= 5) {
                            const row = new ActionRowBuilder<ButtonBuilder>()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('shop_prev')
                                        .setLabel('◀ Prev')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setDisabled(true),
                                    new ButtonBuilder()
                                        .setCustomId('shop_next')
                                        .setLabel('Next ▶')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setDisabled(listings.length < 6)
                                );
                            components.push(row);
                        }

                        await interaction.reply({ embeds: [embed], components, ephemeral: true });
                    } catch (e: any) {
                        console.error('[SHOP] Error fetching listings:', e);
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'sell': {
                    const itemType = interaction.options.getString('type');
                    const term = interaction.options.getString('term')?.toLowerCase().trim();
                    const price = interaction.options.getInteger('price');

                    if (price < 1) {
                        return interaction.reply({ content: 'Price must be at least 1 coin', ephemeral: true });
                    }

                    if (term.length < 2 || term.length > 500) {
                        return interaction.reply({ content: 'Term must be 2-500 characters', ephemeral: true });
                    }

                    try {
                        if (itemType === 'copyright') {
                            const existing = await pool.query(
                                `SELECT * FROM copyrights 
                                 WHERE guild_id = $1 AND term = $2 AND owner_id = $3 AND is_permanent = FALSE`,
                                [guildId, term, userId]
                            );

                            if (existing.rows.length === 0) {
                                return interaction.reply({ 
                                    content: 'You don\'t own this copyright or it\'s permanent and cannot be sold', 
                                    ephemeral: true 
                                });
                            }

                            const copyright = existing.rows[0];
                            
                            await pool.query(`
                                INSERT INTO shop_listings 
                                (guild_id, item_type, item_id, item_name, item_description, seller_id, seller_name, price)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            `, [
                                guildId, 
                                'copyright', 
                                copyright.id, 
                                `"${term}"`,
                                `Copyright fine: ${copyright.fine_amount} coins`,
                                userId, 
                                userName, 
                                price
                            ]);

                            const embed = new EmbedBuilder()
                                .setTitle('✅ Listed on Shop!')
                                .setColor('#00ff00')
                                .setDescription(`Your copyright is now for sale!`)
                                .addFields(
                                    { name: 'Term', value: `"${term}"`, inline: true },
                                    { name: 'Price', value: `${price.toLocaleString()} coins`, inline: true }
                                );

                            await interaction.reply({ embeds: [embed], ephemeral: true });
                        }
                    } catch (e: any) {
                        console.error('[SHOP] Error listing item:', e);
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'buy': {
                    const listingId = interaction.options.getString('listing_id');

                    try {
                        const listing = await pool.query(
                            `SELECT * FROM shop_listings WHERE id = $1 AND is_active = TRUE`,
                            [listingId]
                        );

                        if (listing.rows.length === 0) {
                            return interaction.reply({ content: 'Listing not found or already sold', ephemeral: true });
                        }

                        const item = listing.rows[0];

                        if (item.seller_id === userId) {
                            return interaction.reply({ content: 'You cannot buy your own listing!', ephemeral: true });
                        }

                        if (item.guild_id !== guildId) {
                            return interaction.reply({ content: 'This listing is from a different server', ephemeral: true });
                        }

                        const buyerBalance = await api.getBalance(userId);
                        if (buyerBalance < item.price) {
                            return interaction.reply({ 
                                content: `Insufficient funds! Need ${item.price.toLocaleString()}, have ${buyerBalance.toLocaleString()}`, 
                                ephemeral: true 
                            });
                        }

                        const buyerTag = interaction.user.username;

                        await pool.query('BEGIN');

                        if (item.item_type === 'copyright') {
                            await pool.query('UPDATE economy SET coins = coins - $1 WHERE uid = $2', [item.price, userId]);
                            await pool.query('UPDATE economy SET coins = coins + $1 WHERE uid = $2', [item.price, item.seller_id]);

                            await pool.query(
                                `UPDATE copyrights SET owner_id = $1, owner_name = $2 WHERE id = $3`,
                                [userId, buyerTag, item.item_id]
                            );

                            const royaltyEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                            await pool.query(
                                `INSERT INTO copyright_earnings (copyright_id, violator_id, violator_name, fine_collected, owner_share, treasury_share)
                                 VALUES ($1, $2, $3, $4, $5, $6)`,
                                [item.item_id, userId, buyerTag, 0, 0, 0]
                            );

                            await pool.query(
                                `UPDATE shop_listings SET is_active = FALSE WHERE id = $1`,
                                [listingId]
                            );
                        }

                        await pool.query('COMMIT');

                        const typeInfo = ITEM_TYPES[item.item_type] || { name: item.item_type, emoji: '📦' };
                        const embed = new EmbedBuilder()
                            .setTitle(`✅ Purchase Complete!`)
                            .setColor('#00ff00')
                            .setDescription(`You bought **${item.item_name}** from ${item.seller_name}!`)
                            .addFields(
                                { name: 'Price Paid', value: `${item.price.toLocaleString()} coins`, inline: true },
                                { name: 'New Balance', value: `${(buyerBalance - item.price).toLocaleString()} coins`, inline: true }
                            );

                        await interaction.reply({ embeds: [embed], ephemeral: true });

                        api.log(`[SHOP] ${buyerTag} bought ${item.item_type} #${item.item_id} for ${item.price} coins`);

                    } catch (e: any) {
                        await pool.query('ROLLBACK');
                        console.error('[SHOP] Error buying item:', e);
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'mylistings': {
                    try {
                        const result = await pool.query(
                            `SELECT * FROM shop_listings WHERE seller_id = $1 AND guild_id = $2 AND is_active = TRUE ORDER BY created_at DESC`,
                            [userId, guildId]
                        );

                        if (result.rows.length === 0) {
                            const embed = new EmbedBuilder()
                                .setTitle('📦 My Listings')
                                .setColor('#e5c07b')
                                .setDescription('You have no active listings.\nUse `/shop sell` to create one!');

                            return interaction.reply({ embeds: [embed], ephemeral: true });
                        }

                        const embed = new EmbedBuilder()
                            .setTitle('📦 My Listings')
                            .setColor('#e5c07b')
                            .setDescription(`**${result.rows.length} active listing${result.rows.length !== 1 ? 's' : ''}**`);

                        for (const listing of result.rows) {
                            const typeInfo = ITEM_TYPES[listing.item_type] || { emoji: '📦' };
                            embed.addFields({
                                name: `ID: ${listing.id} | ${typeInfo.emoji} ${listing.item_name}`,
                                value: `Price: ${listing.price.toLocaleString()} coins`,
                                inline: false
                            });
                        }

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }

                case 'delist': {
                    const listingId = interaction.options.getString('listing_id');

                    try {
                        const existing = await pool.query(
                            `SELECT * FROM shop_listings WHERE id = $1 AND seller_id = $2 AND is_active = TRUE`,
                            [listingId, userId]
                        );

                        if (existing.rows.length === 0) {
                            return interaction.reply({ content: 'Listing not found or not owned by you', ephemeral: true });
                        }

                        await pool.query(
                            `UPDATE shop_listings SET is_active = FALSE WHERE id = $1`,
                            [listingId]
                        );

                        const typeInfo = ITEM_TYPES[existing.rows[0].item_type] || { emoji: '📦' };
                        await interaction.reply({ 
                            content: `✅ Removed listing: ${typeInfo.emoji} ${existing.rows[0].item_name}`, 
                            ephemeral: true 
                        });
                    } catch (e: any) {
                        await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                    }
                    break;
                }
            }
        }
    }
];

export const init = async (api: any) => {
    poolRef = api.client?.pool || api.pool;
    
    api.log('Shop Module Loaded (v1.0.0)');
};
