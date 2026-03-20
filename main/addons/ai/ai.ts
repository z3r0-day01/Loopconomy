import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const AI_CONFIG_FILE = 'ai-config.json';
const MEMORY_LIMIT = 60;
const BASE_DIR = process.cwd();

const THINKING_MESSAGES = [
    "Processing neural pathways...",
    "Running cognitive protocols...",
    "Consulting the oracle...",
    "Calculating probability matrices...",
    "Accessing Super Secret Files...",
    "Running 3 Million Poker Simulations",
    "Decrypting the cosmic code...",
    "Analyzing quantum possibilities...",
    "Consulting the blockchain...",
    "Downloading more RAM...",
    "Reticulating splines...",
    "Generating witty response...",
    " consulting the void...",
    "Establishing connection to the mainframe..."
];

const FUN_MESSAGES: Record<string, string> = {
    send_message: "Posted to the void...",
    broadcast: "Broadcasting to all realms...",
    get_balance: "Accessing restricted financial records...",
    add_coins: "Crediting to the economy matrix...",
    remove_coins: "Debiting from the central bank...",
    get_ai_balance: "Consulting the cosmic ledger...",
    play_blackjack: "Shuffling the cosmic deck...",
    play_poker: "Dealing the cards of fate...",
    play_roulette: "Spinning the wheel of destiny...",
    play_slots: "Pulling the lever of fortune...",
    play_keno: "Selecting the sacred numbers...",
    play_bingo: "Marking the divine cards...",
    play_russianroulette: "Chamber loaded. Fortune decides...",
    play_wheel: "The wheel spins with purpose...",
    mute_user: "Silencing the troublemaker...",
    unmute_user: "Restoring voice to the silenced...",
    get_status: "Querying the mainframe...",
    get_logs: "Accessing the archives...",
    search_knowledge: "Accessing the neural database...",
    should_respond: "Timing check...",
    log_interaction: "Recording to the eternal scrolls..."
};

const INTEREST_MESSAGES = [
    "Hmm, interesting...",
    "Speaking of which...",
    "On a related note...",
    "That reminds me...",
    "By the way...",
    "Random thought..."
];

interface AIConfig {
    enabled: boolean;
    model: string;
    ollamaUrl: string;
    systemPrompt: string;
    enabledChannels: string[];
    scheduledMessages: ScheduledMessage[];
    embeddingModel: string;
    similarityThreshold: number;
    maxContextMessages: number;
    agenticMode: {
        enabled: boolean;
        maxContext: number;
        reasoningEnabled: boolean;
        timingEnabled: boolean;
    };
}

interface ScheduledMessage {
    id: string;
    channelId: string;
    cron: string;
    prompt: string;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
}

interface MemoryEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface CodeRAGEntry {
    file_path: string;
    content: string;
    embedding: number[];
}

let apiInstance: any = null;
let poolRef: any = null;
let aiConfig: AIConfig;
let codeRAG: CodeRAGEntry[] = [];
const channelMemory = new Map<string, MemoryEntry[]>();

function loadConfig(): void {
    try {
        const configPath = path.join(BASE_DIR, AI_CONFIG_FILE);
        if (fs.existsSync(configPath)) {
            aiConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            aiConfig = getDefaultConfig();
            saveConfig();
        }
    } catch (e) {
        aiConfig = getDefaultConfig();
    }
}

function getDefaultConfig(): AIConfig {
    return {
        enabled: true,
        model: 'qwen3:0.6b',
        ollamaUrl: 'http://localhost:11434',
        systemPrompt: 'You are LOOP, an AI in the Loopconomy Discord bot.',
        enabledChannels: [],
        scheduledMessages: [],
        embeddingModel: 'qwen3-embedding:0.6b',
        similarityThreshold: 0.7,
        maxContextMessages: 50,
        agenticMode: {
            enabled: false,
            maxContext: 100,
            reasoningEnabled: true,
            timingEnabled: true
        }
    };
}

function saveConfig(): void {
    const configPath = path.join(BASE_DIR, AI_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(aiConfig, null, 2));
}

function isChannelEnabled(channelId: string): boolean {
    if (!aiConfig.enabled) return false;
    if (aiConfig.enabledChannels.length === 0) return true;
    return aiConfig.enabledChannels.includes(channelId);
}

function addToMemory(channelId: string, role: 'user' | 'assistant', content: string): void {
    const mem = channelMemory.get(channelId) || [];
    mem.push({ role, content, timestamp: Date.now() });
    while (mem.length > MEMORY_LIMIT) {
        mem.shift();
    }
    channelMemory.set(channelId, mem);
}

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

async function getEmbedding(text: string): Promise<number[]> {
    try {
        const response = await fetchWithTimeout(aiConfig.ollamaUrl + '/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: aiConfig.embeddingModel, prompt: text })
        }, 10000);
        const data: any = await response.json();
        return data.embedding || [];
    } catch (e) {
        console.log('[AI] Embedding fetch failed, skipping RAG');
        return [];
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function findRelevantContext(channelId: string, query: string): Promise<MemoryEntry[]> {
    const mem = channelMemory.get(channelId) || [];
    if (mem.length === 0) return [];
    
    try {
        const queryEmbedding = await getEmbedding(query);
        const scored = mem.map(entry => ({
            entry,
            score: cosineSimilarity(queryEmbedding, [0]) 
        }));
        
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 10).map(s => s.entry);
    } catch (e) {
        return mem.slice(-10);
    }
}

async function loadCodeRAG(): Promise<void> {
    codeRAG = [];
    const defaultFiles = [
        'main.js',
        'addons/copyright/copyright.ts',
        'commands/gambling/balance.js',
        'commands/gambling/leaderboard.js'
    ];
    
    for (const file of defaultFiles) {
        const filePath = path.join(BASE_DIR, file);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const embedding = await getEmbedding(content.substring(0, 5000));
                codeRAG.push({ file_path: file, content, embedding });
            } catch (e) {}
        }
    }
    console.log('[AI-RAG] Loaded ' + codeRAG.length + ' entries');
}

async function searchCodeRAG(query: string): Promise<string> {
    try {
        const queryEmbedding = await getEmbedding(query);
        let best: CodeRAGEntry | null = null;
        let bestScore = 0;
        
        for (const entry of codeRAG) {
            const score = cosineSimilarity(queryEmbedding, entry.embedding);
            if (score > bestScore && score > aiConfig.similarityThreshold) {
                bestScore = score;
                best = entry;
            }
        }
        
        if (best) {
            return 'Relevant code from ' + best.file_path + ':\n' + best.content.substring(0, 2000);
        }
    } catch (e) {}
    return '';
}

async function chatWithAI(messages: any[], systemPrompt: string, channelId: string): Promise<string> {
    try {
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-20)
        ];
        
        const response = await fetchWithTimeout(aiConfig.ollamaUrl + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: fullMessages,
                stream: false
            })
        }, 30000);
        
        const data: any = await response.json();
        return data.message?.content || '';
    } catch (e) {
        return 'AI timed out or unavailable';
    }
}

function getDefaultSystemPrompt(): string {
    return 'You are LOOP, an AI in the Loopconomy Discord bot. Be helpful, concise, and occasionally witty.';
}

function getAgenticSystemPrompt(): string {
    return 'You are LOOP, an AI in LISTENING MODE. Be selective about responding. Keep responses short (1-3 sentences).';
}

function cleanResponse(text: string): string {
    let cleaned = text;
    cleaned = cleaned.replace(/\[TOOL_CALL\]/g, '');
    cleaned = cleaned.replace(/\[\/TOOL_CALL\]/g, '');
    cleaned = cleaned.replace(/\[\/?(?:REASONING|TOOL_CALL)\]/gi, '');
    return cleaned.replace(/^\s*\[?\s*YES\s*\]?\s*$/gim, '').replace(/^\s*\[?\s*NO\s*\]?\s*$/gim, '').trim();
}

function parseToolCalls(response: string): { tool: string; params: any }[] {
    const calls: { tool: string; params: any }[] = [];
    const toolRegex = /\[TOOL_CALL\]\s*({[\s\S]*?})\s*\[\/TOOL_CALL\]/gi;
    let match;
    
    while ((match = toolRegex.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.tool) {
                calls.push(parsed);
            }
        } catch (e) {}
    }
    
    return calls;
}

async function executeToolCall(tool: string, params: any, channelId: string): Promise<{ success: boolean; result: any; funMessage: string }> {
    const funMessage = FUN_MESSAGES[tool] || 'Executing ' + tool + '...';
    
    try {
        let endpoint = '';
        let body: any = {};
        
        switch (tool) {
            case 'send_message':
                endpoint = '/api/shell/say';
                body = { channel: params.channel || channelId, message: params.message };
                break;
            case 'broadcast':
                endpoint = '/api/shell/broadcast';
                body = { message: params.message };
                break;
            case 'get_balance':
                endpoint = '/api/shell/balance';
                body = { user: params.user };
                break;
            case 'add_coins':
                endpoint = '/api/shell/addcoins';
                body = { user: params.user, amount: parseInt(params.amount) };
                break;
            case 'remove_coins':
                endpoint = '/api/shell/removecoins';
                body = { user: params.user, amount: parseInt(params.amount) };
                break;
            case 'get_status':
                endpoint = '/api/shell/status';
                break;
            case 'should_respond':
                return { success: true, result: { shouldRespond: true, reason: 'Context relevant' }, funMessage };
            default:
                return { success: false, result: { error: 'Unknown tool' }, funMessage };
        }
        
        const response = await fetch('http://localhost:8080' + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        return { success: response.ok, result, funMessage };
    } catch (e: any) {
        return { success: false, result: { error: e.message }, funMessage };
    }
}

async function processToolCalls(calls: { tool: string; params: any }[], channelId: string): Promise<string> {
    let results = [];
    
    for (const call of calls) {
        const { success, result, funMessage } = await executeToolCall(call.tool, call.params, channelId);
        console.log('[AI-TOOL] ' + funMessage);
        
        if (call.tool === 'send_message') {
            results.push('Message sent');
        } else if (call.tool === 'get_balance') {
            results.push('Balance: ' + (result.coins || 0) + ' coins');
        } else if (success) {
            results.push(JSON.stringify(result).substring(0, 100));
        } else {
            results.push('Error: ' + (result.error || 'Unknown'));
        }
    }
    
    return results.join('\n');
}

function parseCron(cron: string): { hours: number; minutes: number } | null {
    const match = cron.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return { hours: parseInt(match[1]), minutes: parseInt(match[2]) };
}

function getNextRun(cron: string): Date {
    const parsed = parseCron(cron);
    if (!parsed) return new Date();
    
    const now = new Date();
    const next = new Date();
    next.setHours(parsed.hours, parsed.minutes, 0, 0);
    
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    
    return next;
}

async function checkScheduledMessages(): Promise<void> {
    if (!aiConfig.scheduledMessages.length) return;
    
    const now = Date.now();
    
    for (const msg of aiConfig.scheduledMessages) {
        if (!msg.enabled) continue;
        
        const nextRun = getNextRun(msg.cron);
        if (nextRun.getTime() <= now) {
            try {
                const context = await findRelevantContext(msg.channelId, msg.prompt);
                const contextText = context.length > 0 ? '\nContext: ' + context.map(c => c.content).join('\n') : '';
                
                const messages = [{ role: 'user', content: msg.prompt + contextText }];
                const response = await chatWithAI(messages, getDefaultSystemPrompt(), msg.channelId);
                
                if (response && !response.includes('Error')) {
                    await apiInstance.speak(msg.channelId, cleanResponse(response));
                    msg.lastRun = new Date().toISOString();
                    saveConfig();
                }
            } catch (e) {
                console.error('[AI] Scheduled message error:', e);
            }
        }
    }
}

function startScheduler(): void {
    setInterval(() => {
        checkScheduledMessages();
    }, 60000);
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('ai')
            .setDescription('Chat with the AI')
            .addStringOption(opt =>
                opt.setName('message')
                    .setDescription('Your message to the AI')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            if (!aiConfig.enabled) {
                return interaction.reply({ content: 'AI is currently disabled', ephemeral: true });
            }
            
            const channelId = interaction.channelId;
            if (!isChannelEnabled(channelId)) {
                return interaction.reply({ content: 'AI is not enabled in this channel', ephemeral: true });
            }
            
            const userMessage = interaction.options.getString('message');
            const thinking = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
            
            await interaction.reply(thinking);
            
            try {
                addToMemory(channelId, 'user', userMessage);
                
                const recent = channelMemory.get(channelId) || [];
                const contextMessages = recent.map(m => ({ role: m.role, content: m.content }));
                
                const ragContext = await searchCodeRAG(userMessage);
                const contextText = ragContext ? '\n\nRelevant knowledge:\n' + ragContext : '';
                
                const messages = [
                    ...contextMessages,
                    { role: 'user', content: userMessage + contextText }
                ];
                
                const systemPrompt = getDefaultSystemPrompt();
                const response = await chatWithAI(messages, systemPrompt, channelId);
                
                const toolCalls = parseToolCalls(response);
                let finalResponse = cleanResponse(response);
                
                if (toolCalls.length > 0) {
                    const toolResults = await processToolCalls(toolCalls, channelId);
                    finalResponse = cleanResponse(response);
                }
                
                if (finalResponse) {
                    await interaction.editReply(finalResponse);
                    addToMemory(channelId, 'assistant', finalResponse);
                } else {
                    await interaction.editReply('(No response)');
                }
            } catch (e: any) {
                await interaction.editReply('Error: ' + e.message);
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-help')
            .setDescription('Show AI help and commands'),
        async execute(interaction: any, api: any) {
            const embed = new EmbedBuilder()
                .setTitle('AI Commands')
                .setColor('#0099ff')
                .addFields(
                    { name: '/ai <message>', value: 'Chat with the AI', inline: false },
                    { name: '/ai-toggle', value: 'Enable/disable AI in channel', inline: false },
                    { name: '/ai-model', value: 'Check or set AI model', inline: false },
                    { name: '/ai-manage', value: 'Manage AI settings', inline: false },
                    { name: '/ai-agentic', value: 'Toggle agentic mode', inline: false },
                    { name: '/ai-schedule', value: 'Schedule AI messages', inline: false },
                    { name: '/ai-rag', value: 'Manage knowledge base', inline: false }
                );
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable/disable AI in this channel'),
        async execute(interaction: any, api: any) {
            const channelId = interaction.channelId;
            const idx = aiConfig.enabledChannels.indexOf(channelId);
            
            if (idx === -1) {
                aiConfig.enabledChannels.push(channelId);
                await interaction.reply('AI enabled in this channel');
            } else {
                aiConfig.enabledChannels.splice(idx, 1);
                await interaction.reply('AI disabled in this channel');
            }
            
            saveConfig();
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-model')
            .setDescription('Check or set AI model')
            .addStringOption(opt =>
                opt.setName('model')
                    .setDescription('Model name (leave empty to check current)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const model = interaction.options.getString('model');
            
            if (model) {
                aiConfig.model = model;
                saveConfig();
                await interaction.reply('AI model set to: ' + model);
            } else {
                await interaction.reply('Current AI model: ' + aiConfig.model);
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-manage')
            .setDescription('Manage AI settings')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action to take')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Enable', value: 'enable' },
                        { name: 'Disable', value: 'disable' },
                        { name: 'Clear Memory', value: 'clear' },
                        { name: 'Status', value: 'status' }
                    )
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            
            switch (action) {
                case 'enable':
                    aiConfig.enabled = true;
                    saveConfig();
                    await interaction.reply('AI enabled globally');
                    break;
                case 'disable':
                    aiConfig.enabled = false;
                    saveConfig();
                    await interaction.reply('AI disabled globally');
                    break;
                case 'clear':
                    channelMemory.clear();
                    await interaction.reply('Memory cleared');
                    break;
                case 'status':
                    const mem = channelMemory.get(interaction.channelId) || [];
                    await interaction.reply('AI Status:\n- Global: ' + (aiConfig.enabled ? 'ON' : 'OFF') + '\n- Channels: ' + aiConfig.enabledChannels.length + '\n- Memory: ' + mem.length);
                    break;
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-agentic')
            .setDescription('Toggle agentic mode'),
        async execute(interaction: any, api: any) {
            aiConfig.agenticMode.enabled = !aiConfig.agenticMode.enabled;
            saveConfig();
            await interaction.reply('Agentic mode ' + (aiConfig.agenticMode.enabled ? 'enabled' : 'disabled'));
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-schedule')
            .setDescription('Manage scheduled AI messages')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action')
                    .setRequired(true)
                    .addChoices(
                        { name: 'List', value: 'list' },
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('channel_id')
                    .setDescription('Channel ID for messages')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('cron')
                    .setDescription('Cron time (HH:MM)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('prompt')
                    .setDescription('Message prompt')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            
            switch (action) {
                case 'list':
                    const list = aiConfig.scheduledMessages.map(s => s.id + ': ' + s.cron + ' - ' + s.prompt.substring(0, 30)).join('\n');
                    await interaction.reply('Scheduled:\n' + (list || 'None'));
                    break;
                case 'add':
                    const channelId = interaction.options.getString('channel_id') || interaction.channelId;
                    const cron = interaction.options.getString('cron');
                    const prompt = interaction.options.getString('prompt');
                    
                    if (!cron || !prompt) {
                        return interaction.reply({ content: 'Usage: /ai-schedule add <channel_id> <cron> <prompt>', ephemeral: true });
                    }
                    
                    aiConfig.scheduledMessages.push({
                        id: Date.now().toString(),
                        channelId,
                        cron,
                        prompt,
                        enabled: true
                    });
                    saveConfig();
                    await interaction.reply('Scheduled message added');
                    break;
                case 'remove':
                    await interaction.reply('Remove not implemented yet');
                    break;
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-rag')
            .setDescription('Manage AI knowledge base')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action')
                    .setRequired(true)
                    .addChoices(
                        { name: 'List', value: 'list' },
                        { name: 'Status', value: 'status' }
                    )
            ),
        async execute(interaction: any, api: any) {
            await interaction.reply('RAG Status:\n- Entries: ' + codeRAG.length + '\n- Files: ' + codeRAG.map(r => r.file_path).join(', '));
        }
    }
];

export const init = async (api: any) => {
    apiInstance = api;
    poolRef = api.client?.pool || api.pool;
    
    loadConfig();
    await loadCodeRAG();
    startScheduler();
    
    api.listen('messageCreate', async (msg: any) => {
        if (msg.author.bot) return;
        if (!isChannelEnabled(msg.channelId)) return;
        
        const content = msg.content.trim();
        if (!content) return;
        
        addToMemory(msg.channelId, 'user', content);
        
        try {
            const recent = channelMemory.get(msg.channelId) || [];
            const contextMessages = recent.slice(-20).map(m => ({ role: m.role, content: m.content }));
            
            const ragContext = await searchCodeRAG(content);
            const contextText = ragContext ? '\n\nKnowledge: ' + ragContext : '';
            
            const messages = [
                ...contextMessages,
                { role: 'user', content: content + contextText }
            ];
            
            const systemPrompt = aiConfig.agenticMode.enabled ? getAgenticSystemPrompt() : getDefaultSystemPrompt();
            
            const thinking = await msg.reply(THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)]);
            
            const response = await chatWithAI(messages, systemPrompt, msg.channelId);
            const finalResponse = cleanResponse(response);
            
            if (finalResponse) {
                await thinking.edit(finalResponse);
                addToMemory(msg.channelId, 'assistant', finalResponse);
            } else {
                await thinking.delete();
            }
        } catch (e) {
            console.error('[AI] Error:', e);
        }
    });
    
    api.log('AI Module Loaded. Status: ' + (aiConfig.enabled ? 'ENABLED' : 'DISABLED') + ' | Model: ' + aiConfig.model);
};
