import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const dataPath = path.join(process.cwd(), 'copyright.json');

interface CopyrightEntry {
    messageId: string;
    channelId: string;
    guildId: string;
    userId: string;
    content: string;
    timestamp: number;
}

let copyrightData: CopyrightEntry[] = [];

function loadCopyrightData() {
    try {
        if (fs.existsSync(dataPath)) {
            copyrightData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
    } catch (e) {
        copyrightData = [];
    }
}

function saveCopyrightData() {
    fs.writeFileSync(dataPath, JSON.stringify(copyrightData, null, 2));
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('copyright')
            .setDescription('Manage copyrighted content')
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Add a message to copyright list')
                    .addStringOption(opt =>
                        opt.setName('message_id')
                            .setDescription('Message ID to copyright')
                            .setRequired(true)
                    )
                    .addStringOption(opt =>
                        opt.setName('reason')
                            .setDescription('Reason for copyright')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Remove a message from copyright list')
                    .addStringOption(opt =>
                        opt.setName('message_id')
                            .setDescription('Message ID to remove')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List all copyrighted messages')
            )
            .addSubcommand(sub =>
                sub.setName('clear')
                    .setDescription('Clear all copyrighted messages')
            ),
        async execute(interaction: any, api: any) {
            const subcommand = interaction.options.getSubcommand();
            loadCopyrightData();

            if (subcommand === 'add') {
                const messageId = interaction.options.getString('message_id');
                const reason = interaction.options.getString('reason') || 'No reason provided';

                try {
                    const channel = interaction.channel;
                    const message = await channel.messages.fetch(messageId);

                    if (!message) {
                        return interaction.reply({ content: 'Message not found.', ephemeral: true });
                    }

                    const entry: CopyrightEntry = {
                        messageId: message.id,
                        channelId: channel.id,
                        guildId: interaction.guildId,
                        userId: message.author.id,
                        content: message.content.substring(0, 500),
                        timestamp: Date.now()
                    };

                    const existingIndex = copyrightData.findIndex(e => e.messageId === messageId);
                    if (existingIndex >= 0) {
                        copyrightData[existingIndex] = entry;
                    } else {
                        copyrightData.push(entry);
                    }

                    saveCopyrightData();

                    const embed = new EmbedBuilder()
                        .setTitle('✅ Copyright Added')
                        .setColor('#00FF00')
                        .setDescription(`Message from <@${message.author.id}> has been copyrighted.`)
                        .addFields(
                            { name: '📝 Content', value: message.content.substring(0, 100) + '...', inline: false },
                            { name: '📋 Reason', value: reason, inline: true },
                            { name: '🆔 Message ID', value: messageId, inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed] });

                    try {
                        await message.react('©️');
                    } catch (e) {}

                } catch (e: any) {
                    await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
                }
            }

            if (subcommand === 'remove') {
                const messageId = interaction.options.getString('message_id');
                const index = copyrightData.findIndex(e => e.messageId === messageId);

                if (index < 0) {
                    return interaction.reply({ content: 'Message not found in copyright list.', ephemeral: true });
                }

                const removed = copyrightData.splice(index, 1)[0];
                saveCopyrightData();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Copyright Removed')
                    .setColor('#FF0000')
                    .setDescription('Message has been removed from copyright list.')
                    .addFields(
                        { name: '🆔 Message ID', value: messageId, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'list') {
                if (copyrightData.length === 0) {
                    return interaction.reply({ content: 'No copyrighted messages.', ephemeral: true });
                }

                const guildCopyrights = copyrightData.filter(e => e.guildId === interaction.guildId);
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Copyrighted Messages')
                    .setColor('#0099ff')
                    .setDescription(`Total: ${guildCopyrights.length} copyrighted message(s)`)
                    .setTimestamp();

                for (const entry of guildCopyrights.slice(0, 10)) {
                    embed.addFields({
                        name: `🆔 ${entry.messageId}`,
                        value: `By: <@${entry.userId}> | ${new Date(entry.timestamp).toLocaleDateString()}`,
                        inline: false
                    });
                }

                await interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'clear') {
                const guildCopyrights = copyrightData.filter(e => e.guildId === interaction.guildId);
                copyrightData = copyrightData.filter(e => e.guildId !== interaction.guildId);
                saveCopyrightData();

                const embed = new EmbedBuilder()
                    .setTitle('🗑️ Copyrights Cleared')
                    .setColor('#FF0000')
                    .setDescription(`Removed ${guildCopyrights.length} copyrighted message(s) from this server.`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
        }
    }
];

export const init = async (api: any) => {
    loadCopyrightData();
    api.log("Copyright Management Module Loaded.");
};
