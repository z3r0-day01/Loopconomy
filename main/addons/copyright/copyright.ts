import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import * as path from 'path';
import * as fs from 'fs';

async function fetchWithTimeout(url: string, options: any, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

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

interface CopyrightConfig {
    smartEnabled: boolean;
    ragEnabled: boolean;
    embeddingsEnabled: boolean;
    llmModel: string;
    embeddingModel: string;
    similarityThreshold: number;
    firstOffenseWarn: boolean;
}

let copyrightConfig: CopyrightConfig;

function loadCopyrightConfig(): void {
    console.log('[Copyright-Debug] Loading config...');
    try {
        const configPath = path.join(process.cwd(), 'copyright-config.json');
        console.log('[Copyright-Debug] Config path:', configPath);
        console.log('[Copyright-Debug] Config exists:', fs.existsSync(configPath));
        if (fs.existsSync(configPath)) {
            copyrightConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            copyrightConfig = {
                smartEnabled: false,
                ragEnabled: false,
                embeddingsEnabled: false,
                llmModel: 'granite4:350m-h-q8_0',
                embeddingModel: 'granite-embedding:278m-fp16',
                similarityThreshold: 0.75,
                firstOffenseWarn: true
            };
            fs.writeFileSync(configPath, JSON.stringify(copyrightConfig, null, 2));
        }
    } catch (e) {
        copyrightConfig = {
            smartEnabled: false,
            ragEnabled: false,
            embeddingsEnabled: false,
            llmModel: 'granite4:350m-h-q8_0',
            embeddingModel: 'granite-embedding:278m-fp16',
            similarityThreshold: 0.75,
            firstOffenseWarn: true
        };
    }
}

function saveCopyrightConfig(): void {
    const configPath = path.join(process.cwd(), 'copyright-config.json');
    fs.writeFileSync(configPath, JSON.stringify(copyrightConfig, null, 2));
}

async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await fetchWithTimeout('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: copyrightConfig.embeddingModel, prompt: text })
        }, 10000);
        const data: any = await response.json();
        return data.embedding || [];
    } catch (e: any) {
        console.log('[Copyright-Embed] Embedding failed:', e.message);
        return [];
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function smartAnalyze(content: string, existingTerm: string): Promise<{ isMatch: boolean; confidence: number; reasoning: string }> {
    try {
        const response = await fetchWithTimeout('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: copyrightConfig.llmModel,
                messages: [
                    { role: 'system', content: 'You are a copyright detection AI. Analyze if the message content violates the copyrighted term. Respond ONLY with JSON: {"match": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}' },
                    { role: 'user', content: `Copyrighted term: "${existingTerm}"\n\nMessage: "${content}"` }
                ],
                stream: false
            })
        }, 15000);
        const data: any = await response.json();
        const result = JSON.parse(data.message?.content || '{"match":false,"confidence":0,"reasoning":"Parse error"}');
        return { isMatch: result.match, confidence: result.confidence, reasoning: result.reasoning };
    } catch (e: any) {
        console.log('[Copyright-Smart] Analysis failed:', e.message);
        return { isMatch: false, confidence: 0, reasoning: 'AI unavailable' };
    }
}

async function checkSmartViolation(content: string, userId: string, pool: any): Promise<{ violated: boolean; term?: string; isFirstOffense?: boolean; reasoning?: string }> {
    const result = await pool.query('SELECT * FROM copyrights WHERE enabled = true');
    
    for (const row of result.rows) {
        const offenseCheck = await pool.query(
            'SELECT COUNT(*) FROM copyright_offenses WHERE uid = $1 AND copyright_id = $2',
            [userId, row.id]
        );
        const hasPriorOffense = parseInt(offenseCheck.rows[0].count) > 0;
        
        if (copyrightConfig.embeddingsEnabled && row.embedding) {
            const contentEmb = await getEmbedding(content);
            const sim = cosineSimilarity(contentEmb, row.embedding);
            if (sim >= copyrightConfig.similarityThreshold) {
                return { violated: true, term: row.term, isFirstOffense: !hasPriorOffense, reasoning: `Similarity: ${(sim * 100).toFixed(1)}%` };
            }
        }
        
        if (copyrightConfig.smartEnabled) {
            const analysis = await smartAnalyze(content, row.term);
            if (analysis.isMatch) {
                return { violated: true, term: row.term, isFirstOffense: !hasPriorOffense, reasoning: analysis.reasoning };
            }
        }
        
        if (content.toLowerCase().includes(row.term.toLowerCase())) {
            return { violated: true, term: row.term, isFirstOffense: !hasPriorOffense, reasoning: 'Exact match' };
        }
    }
    
    return { violated: false };
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
            )
            .addSubcommand(sub =>
                sub.setName('smartclaim')
                    .setDescription('Configure smart copyright detection')
                    .addStringOption(opt =>
                        opt.setName('action')
                            .setDescription('Action')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Enable', value: 'enable' },
                                { name: 'Disable', value: 'disable' },
                                { name: 'RAG Enable', value: 'rag-enable' },
                                { name: 'RAG Disable', value: 'rag-disable' },
                                { name: 'Embeddings Enable', value: 'embeddings-enable' },
                                { name: 'Embeddings Disable', value: 'embeddings-disable' },
                                { name: 'Status', value: 'status' },
                                { name: 'Select Model', value: 'select-model' },
                                { name: 'Embeddings Select Model', value: 'embeddings-select-model' }
                            )
                    )
                    .addStringOption(opt =>
                        opt.setName('model')
                            .setDescription('Model name (for Select Model actions)')
                            .setRequired(false)
                    )
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
                case 'smartclaim': {
                    loadCopyrightConfig();
                    const action = interaction.options.getString('action');
                    const model = interaction.options.getString('model');
                    console.log('[Copyright-Debug] SmartClaim triggered, action:', action);
                    
                    switch (action) {
                        case 'enable':
                            copyrightConfig.smartEnabled = true;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '✅ Smart copyright detection **ENABLED**', ephemeral: true });
                            break;
                        case 'disable':
                            copyrightConfig.smartEnabled = false;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '❌ Smart copyright detection **DISABLED**', ephemeral: true });
                            break;
                        case 'rag-enable':
                            copyrightConfig.ragEnabled = true;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '✅ RAG contextual analysis **ENABLED**', ephemeral: true });
                            break;
                        case 'rag-disable':
                            copyrightConfig.ragEnabled = false;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '❌ RAG contextual analysis **DISABLED**', ephemeral: true });
                            break;
                        case 'embeddings-enable':
                            copyrightConfig.embeddingsEnabled = true;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '✅ Embeddings detection **ENABLED**', ephemeral: true });
                            break;
                        case 'embeddings-disable':
                            copyrightConfig.embeddingsEnabled = false;
                            saveCopyrightConfig();
                            await interaction.reply({ content: '❌ Embeddings detection **DISABLED**', ephemeral: true });
                            break;
                        case 'select-model':
                            if (model) {
                                copyrightConfig.llmModel = model;
                                saveCopyrightConfig();
                                await interaction.reply({ content: `✅ LLM model set to **${model}**`, ephemeral: true });
                            } else {
                                await interaction.reply({ content: 'Please provide a model name', ephemeral: true });
                            }
                            break;
                        case 'embeddings-select-model':
                            if (model) {
                                copyrightConfig.embeddingModel = model;
                                saveCopyrightConfig();
                                await interaction.reply({ content: `✅ Embedding model set to **${model}**`, ephemeral: true });
                            } else {
                                await interaction.reply({ content: 'Please provide a model name', ephemeral: true });
                            }
                            break;
                        case 'status':
                            console.log('[Copyright-Debug] Status request, config:', copyrightConfig);
                            const statusEmbed = new EmbedBuilder()
                                .setTitle('🎛️ Copyright Smartclaim Status')
                                .setColor('#6366f1')
                                .setDescription('Current smart copyright configuration:')
                                .addFields(
                                    { name: '🧠 Smart Detection', value: copyrightConfig.smartEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                                    { name: '📚 RAG', value: copyrightConfig.ragEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                                    { name: '📐 Embeddings', value: copyrightConfig.embeddingsEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                                    { name: '🤖 LLM Model', value: `\`${copyrightConfig.llmModel}\``, inline: false },
                                    { name: '📏 Embedding Model', value: `\`${copyrightConfig.embeddingModel}\``, inline: false },
                                    { name: '⚡ Similarity Threshold', value: `${copyrightConfig.similarityThreshold}`, inline: true },
                                    { name: '⚠️ First Offense', value: copyrightConfig.firstOffenseWarn ? 'Warn' : 'Fine', inline: true }
                                )
                                .setTimestamp();
                            await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                            break;
                    }
                    break;
                }
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
    loadCopyrightConfig();
    api.log(`[Copyright] Smart: ${copyrightConfig.smartEnabled} | RAG: ${copyrightConfig.ragEnabled} | Embeddings: ${copyrightConfig.embeddingsEnabled}`);
    
    api.listen('messageCreate', async (msg: any) => {
        if (msg.author.bot) return;
        if (!msg.guild) return;

        const content = msg.content.trim();
        if (content.length < 2) return;

        const guildId = msg.guildId;
        const userId = msg.author.id;
        const userName = msg.author.username;

        try {
            const pool = poolRef || api.client.pool;
            if (!pool) return;

            const isSmartDetectionEnabled = copyrightConfig.smartEnabled || copyrightConfig.embeddingsEnabled;

            let violationResult: { violated: boolean; term?: string; isFirstOffense?: boolean; reasoning?: string } | null = null;

            if (isSmartDetectionEnabled) {
                violationResult = await checkSmartViolation(content, userId, pool);
            } else {
                const contentLower = content.toLowerCase();
                const copyrights = await pool.query(
                    'SELECT * FROM copyrights WHERE guild_id = $1 OR guild_id = $2',
                    [guildId, 'GLOBAL']
                );

                for (const copyright of copyrights.rows) {
                    if (contentLower.includes(copyright.term.toLowerCase())) {
                        if (copyright.owner_id === userId) continue;

                        const offenseCheck = await pool.query(
                            'SELECT COUNT(*) FROM copyright_offenses WHERE uid = $1 AND copyright_id = $2',
                            [userId, copyright.id]
                        );
                        const hasPriorOffense = parseInt(offenseCheck.rows[0].count) > 0;

                        violationResult = { violated: true, term: copyright.term, isFirstOffense: !hasPriorOffense, reasoning: 'Exact match' };
                        break;
                    }
                }
            }

            if (violationResult?.violated && violationResult.term) {
                const copyrights = await pool.query(
                    'SELECT * FROM copyrights WHERE guild_id = $1 AND term = $2 OR guild_id = $2 AND term = $1',
                    [guildId, violationResult.term]
                );

                if (copyrights.rows.length === 0) return;

                const copyright = copyrights.rows[0];
                if (copyright.owner_id === userId) return;

                const fine = copyright.fine_amount;
                const reasoning = violationResult.reasoning || 'Unknown';

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
                    ? `⚠️ <@${userId}>, "${violationResult.term}" is copyrighted by ${ownerMention}! Fine: ${fine} coins (${reasoning})`
                    : `⚠️ <@${userId}>, "${violationResult.term}" is copyrighted by ${ownerMention}! (${reasoning})`;

                try { await msg.reply(replyMsg); } catch (e) {}

                api.log(`[COPYRIGHT] ${userName} violated "${violationResult.term}" - Fine: ${fine} - ${reasoning}`);
            }
        } catch (e) {
            api.log(`[COPYRIGHT] Error checking message: ${e}`);
        }
    });

    const EXCEPTIONS = [
        "that's", "thats", "there", "their", "they're",
        "this is", "thats so", "oh thats", "no thats",
        "wait thats", "lol thats", "haha thats", "damn thats",
        "okay thats", "alright thats", "woah thats",
        "like thats", "not thats", "aint thats"
    ];
    
    function isException(content: string): boolean {
        const lower = content.toLowerCase();
        for (const exc of EXCEPTIONS) {
            if (lower.includes(exc)) return true;
        }
        return false;
    }

    const SCAN_INTERVAL = 5 * 60 * 1000;
    let scanIntervalId: NodeJS.Timeout | null = null;
    
    async function startPeriodicScan(client: any) {
        if (scanIntervalId) clearInterval(scanIntervalId);
        
        scanIntervalId = setInterval(async () => {
            if (!copyrightConfig.smartEnabled) return;
            try {
                const pool = poolRef || client?.pool;
                if (!pool) return;
                
                const guilds = client.guilds.cache;
                for (const guild of guilds.values()) {
                    const copyrights = await pool.query('SELECT * FROM copyrights WHERE guild_id = $1', [guild.id]);
                    if (copyrights.rows.length === 0) continue;
                    
                    const channels = guild.channels.cache.filter((c: any) => c.isTextBased());
                    for (const channel of channels.values()) {
                        try {
                            const messages = await channel.messages.fetch({ limit: 20 });
                            const fines: any[] = [];
                            
                            for (const msg of messages.values()) {
                                if (msg.author.bot || msg.author.id === client.user?.id) continue;
                                if (isException(msg.content)) continue;
                                
                                const result = await checkSmartViolation(msg.content, msg.author.id, pool);
                                if (result.violated && result.term) {
                                    fines.push({
                                        user: msg.author,
                                        term: result.term,
                                        message: msg.content.substring(0, 100)
                                    });
                                    
                                    const copyright = copyrights.rows.find((c: any) => c.term === result.term);
                                    if (copyright) {
                                        await pool.query(
                                            'INSERT INTO copyright_offenses (uid, copyright_id, server_id, message_content) VALUES ($1, $2, $3, $4)',
                                            [msg.author.id, copyright.id, guild.id, msg.content]
                                        );
                                    }
                                }
                            }
                            
                            if (fines.length > 0) {
                                const fineList = fines.map(f => `• ${f.user.username}: "${f.message}" - ${f.term}`).join('\n');
                                
                                const thread = await channel.threads?.create({
                                    name: `Appeals-${Date.now()}`,
                                    autoArchiveDuration: 1440
                                }).catch(() => null);
                                
                                const announceMsg = `🎭 **I have randomly fined ${fines.length} user(s) for the following messages:**\n\n${fineList}\n\n*Thread created for appeals*`;
                                
                                if (thread) {
                                    await thread.send(announceMsg);
                                    await channel.send(`🎭 I have randomly fined ${fines.length} user(s) for rule violations! Appeals thread: ${thread.url}`);
                                } else {
                                    await channel.send(announceMsg);
                                }
                            }
                        } catch (e) {
                            // Skip failed channels
                        }
                    }
                }
            } catch (e) {
                api.log(`[COPYRIGHT] Periodic scan error: ${e}`);
            }
        }, SCAN_INTERVAL);
    }
    
    api.listen('clientReady', async () => {
        await startPeriodicScan(api.client);
    });

    api.log("Copyright Management Module Loaded (v2 - Database)");
};
