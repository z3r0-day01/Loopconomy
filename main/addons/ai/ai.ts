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
    "Random thought...",
    "This reminded me of something...",
    "You know what they say...",
    "Speaking my language...",
    "Plot twist...",
    "Meanwhile, back at the ranch...",
    "Fun fact...",
    "Did someone say...",
    "Not to change the subject, but...",
    "Meanwhile...",
    "Oh, and...",
    "Speaking of...",
    "That reminds me..."
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

interface ChannelState {
    lastInteractionMs: number;
    lastInterestChimeMs: number;
    lastAutonomousAttemptMs: number;
    failedAttempts: number;
    waitingFor8am: boolean;
}

const channelStates = new Map<string, ChannelState>();
const INTEREST_INTERVAL_MIN = 10 * 60 * 1000;
const INTEREST_INTERVAL_MAX = 30 * 60 * 1000;
const INACTIVITY_THRESHOLD = 30 * 60 * 1000;
const RETRY_DELAY = 2 * 60 * 60 * 1000;

async function getPassiveRagContext(guildId: string, query: string): Promise<string> {
    try {
        if (!poolRef) return '';
        
        await poolRef.query('DELETE FROM passive_rag WHERE expires_at < NOW()');
        
        const result = await poolRef.query(
            `SELECT content, reason, created_at FROM passive_rag 
             WHERE guild_id = $1 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 5`,
            [guildId]
        );
        
        if (result.rows.length === 0) return '';
        
        return result.rows.map((r: any) => 
            `[${new Date(r.created_at).toLocaleDateString()}]: "${r.content}" - ${r.reason || 'context'}`
        ).join('\n');
    } catch (e) {
        return '';
    }
}

async function addToPassiveRag(guildId: string, content: string, reason: string): Promise<void> {
    try {
        if (!poolRef) return;
        await poolRef.query(
            `INSERT INTO passive_rag (guild_id, content, reason, expires_at) 
             VALUES ($1, $2, $3, NOW() + INTERVAL '3 days')`,
            [guildId, content, reason]
        );
    } catch (e) {}
}

async function logToDB(channelId: string, role: 'user' | 'assistant', content: string) {
    try {
        const guildId = apiInstance?.client?.guilds?.cache?.first()?.id || '0';
        await fetch('http://localhost:8080/api/shell/log-conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                server_id: guildId,
                channel_id: channelId,
                user_id: '0',
                user_tag: 'LOOP',
                role,
                content
            })
        });
    } catch (e) {}
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
        similarityThreshold: 0.75,
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

function getRandomInterval(): number {
    return INTEREST_INTERVAL_MIN + Math.random() * (INTEREST_INTERVAL_MAX - INTEREST_INTERVAL_MIN);
}

function getChannelState(channelId: string): ChannelState {
    if (!channelStates.has(channelId)) {
        channelStates.set(channelId, {
            lastInteractionMs: Date.now(),
            lastInterestChimeMs: 0,
            lastAutonomousAttemptMs: 0,
            failedAttempts: 0,
            waitingFor8am: false
        });
    }
    return channelStates.get(channelId)!;
}

async function shouldChimeIn(channelId: string): Promise<boolean> {
    const state = getChannelState(channelId);
    const now = Date.now();
    
    if (now - state.lastInteractionMs < INACTIVITY_THRESHOLD) {
        if (Math.random() < 0.05) {
            return true;
        }
        return false;
    }
    
    if (now - state.lastAutonomousAttemptMs < 5000) {
        return false;
    }
    
    if (state.waitingFor8am) {
        const hour = new Date().getHours();
        if (hour < 8) return false;
        state.waitingFor8am = false;
    }
    
    if (now - state.lastAutonomousAttemptMs < RETRY_DELAY && state.failedAttempts > 0) {
        return false;
    }
    
    state.lastAutonomousAttemptMs = now;
    return true;
}

async function attemptAutonomousMessage(channelId: string, api: any): Promise<boolean> {
    const state = getChannelState(channelId);
    const now = Date.now();
    
    try {
        const thinking = INTEREST_MESSAGES[Math.floor(Math.random() * INTEREST_MESSAGES.length)];
        
        const messages = [{
            role: 'user',
            content: `Generate a brief, interesting comment (1-2 sentences) to spark conversation. Keep it casual and fun. Start with something like: "${thinking}" Only respond with the message, nothing else.`
        }];
        
        const response = await chatWithAI(messages, getAgenticSystemPrompt(), channelId);
        const cleanMsg = cleanResponse(response);
        
        if (cleanMsg && cleanMsg.length > 0 && cleanMsg.length < 300) {
            await api.speak(channelId, cleanMsg);
            state.lastAutonomousAttemptMs = now;
            state.lastInteractionMs = now;
            state.failedAttempts = 0;
            return true;
        }
        
        state.failedAttempts++;
        if (state.failedAttempts >= 2) {
            state.waitingFor8am = true;
            state.failedAttempts = 0;
        }
        return false;
    } catch (e) {
        state.failedAttempts++;
        if (state.failedAttempts >= 2) {
            state.waitingFor8am = true;
            state.failedAttempts = 0;
        }
        return false;
    }
}

async function checkAutonomousChime(channelId: string, api: any): Promise<void> {
    const state = getChannelState(channelId);
    const now = Date.now();
    
    if (now - state.lastInterestChimeMs > getRandomInterval()) {
        if (Math.random() < 0.05) {
            try {
                const messages = [{
                    role: 'user',
                    content: `Say something brief and funny (1 sentence max) about a random topic. Keep it casual. Only respond with the message.`
                }];
                
                const response = await chatWithAI(messages, getDefaultSystemPrompt(), channelId);
                const cleanMsg = cleanResponse(response);
                
                if (cleanMsg && cleanMsg.length > 0 && cleanMsg.length < 200) {
                    await api.speak(channelId, cleanMsg);
                    state.lastInterestChimeMs = now;
                }
            } catch (e) {}
        }
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
            case 'get_ai_balance':
                endpoint = '/api/shell/ai-balance';
                body = { server_id: apiInstance?.client?.guilds?.cache?.first()?.id };
                break;
            case 'play_blackjack':
            case 'play_poker':
            case 'play_roulette':
            case 'play_slots':
            case 'play_keno':
            case 'play_russianroulette':
            case 'play_wheel':
                endpoint = '/api/shell/game-play';
                body = {
                    game_type: tool.replace('play_', ''),
                    bet_amount: parseInt(params.bet_amount) || 100,
                    bet_type: params.bet_type,
                    specific_bet: params.specific_bet,
                    pick_count: params.pick_count,
                    picks: params.picks,
                    player_choice: params.player_choice,
                    server_id: apiInstance?.client?.guilds?.cache?.first()?.id
                };
                break;
            case 'mute_user':
                endpoint = '/api/shell/mute';
                body = { user: params.user, time: params.time || '10m', reason: params.reason || 'Muted via AI' };
                break;
            case 'unmute_user':
                endpoint = '/api/shell/unmute';
                body = { user: params.user };
                break;
            case 'search_passive_context':
                try {
                    const guildId = apiInstance?.client?.guilds?.cache?.first()?.id;
                    const context = await getPassiveRagContext(guildId, params.query || '');
                    return { success: true, result: { context }, funMessage: 'Searching passive memory...' };
                } catch (e) {
                    return { success: false, result: { error: 'Failed to search context' }, funMessage };
                }
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
    let results: string[] = [];
    
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

function startAutonomousScheduler(api: any) {
    setInterval(async () => {
        if (!aiConfig.enabled || !aiConfig.agenticMode.enabled) return;
        
        try {
            const client = api.client;
            if (!client?.guilds?.cache) return;
            
            for (const guild of client.guilds.cache.values()) {
                if (!guild.available) continue;
                
                for (const channel of guild.channels.cache.values()) {
                    if (channel.type !== 0) continue;
                    if (!isChannelEnabled(channel.id)) continue;
                    
                    const state = getChannelState(channel.id);
                    
                    await checkAutonomousChime(channel.id, api);
                    
                    if (Date.now() - state.lastInteractionMs > INACTIVITY_THRESHOLD) {
                        await attemptAutonomousMessage(channel.id, api);
                    }
                }
            }
        } catch (e) {
            console.error('[AI] Autonomous scheduler error:', e);
        }
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
                .setTitle('LOOP AI - Command Center')
                .setColor('#6366f1')
                .setThumbnail('https://cdn.discordapp.com/attachments/123456789/loopy_ai.png')
                .setDescription('Welcome to the LOOP AI Assistant! Here are all available commands:')
                .addFields(
                    { name: '💬 /ai <message>', value: 'Chat directly with the AI', inline: true },
                    { name: '🔄 /ai-toggle', value: 'Enable/disable AI in this channel', inline: true },
                    { name: '🤖 /ai-model', value: 'Check or change the AI model', inline: true },
                    { name: '⚙️ /ai-manage', value: 'Full AI settings management', inline: true },
                    { name: '🌀 /ai-agentic', value: 'Toggle autonomous listening mode', inline: true },
                    { name: '📅 /ai-schedule', value: 'Schedule AI messages', inline: true },
                    { name: '📚 /ai-rag', value: 'Manage knowledge base', inline: true },
                    { name: '📜 /ai-logs', value: 'View conversation/game history', inline: true },
                    { name: '🎛️ /ai-config', value: 'Advanced configuration panel', inline: true }
                )
                .setFooter({ text: 'Use /ai <message> to start chatting!' })
                .setTimestamp();
            
            const actionRow = {
                type: 1,
                components: [
                    { type: 2, style: 5, label: 'Invite Bot', url: 'https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID' },
                    { type: 2, style: 5, label: 'Support Server', url: 'https://discord.gg/YOUR_INVITE' }
                ]
            };
            
            await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Enable/disable AI in this channel'),
        async execute(interaction: any, api: any) {
            const channelId = interaction.channelId;
            const idx = aiConfig.enabledChannels.indexOf(channelId);
            
            let enabled: boolean;
            if (idx === -1) {
                aiConfig.enabledChannels.push(channelId);
                enabled = true;
            } else {
                aiConfig.enabledChannels.splice(idx, 1);
                enabled = false;
            }
            
            saveConfig();
            
            const embed = new EmbedBuilder()
                .setTitle(enabled ? '✅ AI Enabled' : '🚫 AI Disabled')
                .setColor(enabled ? '#22c55e' : '#ef4444')
                .setDescription(enabled 
                    ? `AI is now **enabled** in this channel. Users can chat with me using \`/ai <message>\`!`
                    : `AI has been **disabled** in this channel. Use \`/ai-toggle\` again to re-enable.`
                )
                .addFields(
                    { name: 'Channel', value: `<#${channelId}>`, inline: true },
                    { name: 'Status', value: enabled ? '🟢 Active' : '🔴 Inactive', inline: true },
                    { name: 'Total Channels', value: `${aiConfig.enabledChannels.length}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
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
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Model Updated')
                    .setColor('#22c55e')
                    .setDescription(`AI model has been changed to **${model}**`)
                    .addFields(
                        { name: 'New Model', value: `\`${model}\``, inline: true },
                        { name: 'Embedding Model', value: `\`${aiConfig.embeddingModel}\``, inline: true },
                        { name: 'Ollama URL', value: `\`${aiConfig.ollamaUrl}\``, inline: false }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Current AI Model')
                    .setColor('#6366f1')
                    .setDescription('Here are the current AI configuration settings:')
                    .addFields(
                        { name: 'Chat Model', value: `\`${aiConfig.model}\``, inline: true },
                        { name: 'Embedding Model', value: `\`${aiConfig.embeddingModel}\``, inline: true },
                        { name: 'Ollama Endpoint', value: `\`${aiConfig.ollamaUrl}\``, inline: false },
                        { name: 'Similarity Threshold', value: `${aiConfig.similarityThreshold}`, inline: true },
                        { name: 'Max Context', value: `${aiConfig.maxContextMessages} messages`, inline: true }
                    )
                    .setFooter({ text: 'Use /ai-model <name> to change the model' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
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
                        { name: 'Reset All', value: 'reset' },
                        { name: 'Status', value: 'status' }
                    )
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            const mem = channelMemory.get(interaction.channelId) || [];
            
            switch (action) {
                case 'enable':
                    aiConfig.enabled = true;
                    saveConfig();
                    
                    const enableEmbed = new EmbedBuilder()
                        .setTitle('✅ AI Globally Enabled')
                        .setColor('#22c55e')
                        .setDescription('AI has been enabled globally. All configured channels are now active.')
                        .addFields(
                            { name: 'Active Channels', value: `${aiConfig.enabledChannels.length}`, inline: true },
                            { name: 'Agentic Mode', value: aiConfig.agenticMode.enabled ? '🟢 On' : '🔴 Off', inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [enableEmbed], ephemeral: true });
                    break;
                    
                case 'disable':
                    aiConfig.enabled = false;
                    saveConfig();
                    
                    const disableEmbed = new EmbedBuilder()
                        .setTitle('🚫 AI Globally Disabled')
                        .setColor('#ef4444')
                        .setDescription('AI has been disabled globally. Use `/ai-manage enable` to reactivate.')
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [disableEmbed], ephemeral: true });
                    break;
                    
                case 'clear':
                    channelMemory.clear();
                    
                    const clearEmbed = new EmbedBuilder()
                        .setTitle('🧹 Memory Cleared')
                        .setColor('#f59e0b')
                        .setDescription('All conversation memory has been cleared for this channel.')
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [clearEmbed], ephemeral: true });
                    break;
                    
                case 'reset':
                    channelMemory.clear();
                    codeRAG = [];
                    await loadCodeRAG();
                    
                    const resetEmbed = new EmbedBuilder()
                        .setTitle('🔄 Full Reset Complete')
                        .setColor('#8b5cf6')
                        .setDescription('AI has been fully reset!')
                        .addFields(
                            { name: 'Memory', value: '✅ Cleared', inline: true },
                            { name: 'RAG Cache', value: `✅ Reloaded (${codeRAG.length} entries)`, inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [resetEmbed], ephemeral: true });
                    break;
                    
                case 'status':
                    const statusEmbed = new EmbedBuilder()
                        .setTitle('📊 AI Status Dashboard')
                        .setColor('#6366f1')
                        .setDescription('Current AI system status:')
                        .addFields(
                            { name: '🌐 Global Status', value: aiConfig.enabled ? '🟢 **ENABLED**' : '🔴 **DISABLED**', inline: false },
                            { name: '📺 Active Channels', value: `${aiConfig.enabledChannels.length} channels`, inline: true },
                            { name: '🧠 Channel Memory', value: `${mem.length} messages`, inline: true },
                            { name: '🌀 Agentic Mode', value: aiConfig.agenticMode.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                            { name: '🤖 Chat Model', value: `\`${aiConfig.model}\``, inline: true },
                            { name: '📐 Embeddings', value: `\`${aiConfig.embeddingModel}\``, inline: true },
                            { name: '📅 Scheduled', value: `${aiConfig.scheduledMessages.length} messages`, inline: true },
                            { name: '📚 RAG Entries', value: `${codeRAG.length} files`, inline: true },
                            { name: '⚡ Similarity', value: `${aiConfig.similarityThreshold}`, inline: true },
                            { name: '💬 Max Context', value: `${aiConfig.maxContextMessages} messages`, inline: true }
                        )
                        .setFooter({ text: 'Loopconomy AI System' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
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
            
            const agenticEmbed = new EmbedBuilder()
                .setTitle(aiConfig.agenticMode.enabled ? '🌀 Agentic Mode Enabled' : '🌀 Agentic Mode Disabled')
                .setColor(aiConfig.agenticMode.enabled ? '#22c55e' : '#ef4444')
                .setDescription(aiConfig.agenticMode.enabled 
                    ? 'Agentic mode is now **enabled**. The AI will autonomously decide when to respond to messages in enabled channels!'
                    : 'Agentic mode has been **disabled**. The AI will now only respond when directly mentioned or replied to.'
                )
                .addFields(
                    { name: 'Max Context', value: `${aiConfig.agenticMode.maxContext} messages`, inline: true },
                    { name: 'Reasoning', value: aiConfig.agenticMode.reasoningEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                    { name: 'Timing Checks', value: aiConfig.agenticMode.timingEnabled ? '🟢 Enabled' : '🔴 Disabled', inline: true }
                )
                .setFooter({ text: 'Use --agentic in a message to temporarily enable for one response' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [agenticEmbed], ephemeral: true });
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
                    if (aiConfig.scheduledMessages.length === 0) {
                        const emptyEmbed = new EmbedBuilder()
                            .setTitle('📅 Scheduled Messages')
                            .setColor('#6b7280')
                            .setDescription('No scheduled messages yet!')
                            .setFooter({ text: 'Use /ai-schedule add to create one' })
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
                        return;
                    }
                    
                    const scheduleFields = aiConfig.scheduledMessages.map((s, i) => ({
                        name: `${i + 1}. ${s.cron}`,
                        value: `Channel: <#${s.channelId}>\nPrompt: ${s.prompt.substring(0, 50)}...\nStatus: ${s.enabled ? '🟢 Active' : '🔴 Paused'}`,
                        inline: false
                    }));
                    
                    const listEmbed = new EmbedBuilder()
                        .setTitle('📅 Scheduled Messages')
                        .setColor('#6366f1')
                        .setDescription(`You have **${aiConfig.scheduledMessages.length}** scheduled message(s)`)
                        .addFields(...scheduleFields)
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [listEmbed], ephemeral: true });
                    break;
                    
                case 'add':
                    const channelId = interaction.options.getString('channel_id') || interaction.channelId;
                    const cron = interaction.options.getString('cron');
                    const prompt = interaction.options.getString('prompt');
                    
                    if (!cron || !prompt) {
                        const usageEmbed = new EmbedBuilder()
                            .setTitle('❌ Missing Parameters')
                            .setColor('#ef4444')
                            .setDescription('Please provide both **cron time** and **prompt**:')
                            .addFields(
                                { name: 'Format', value: '/ai-schedule add <channel_id> <HH:MM> <prompt>', inline: false },
                                { name: 'Example', value: '/ai-schedule add #general 08:00 Good morning everyone!', inline: false }
                            )
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [usageEmbed], ephemeral: true });
                        return;
                    }
                    
                    const scheduleId = Date.now().toString();
                    aiConfig.scheduledMessages.push({
                        id: scheduleId,
                        channelId,
                        cron,
                        prompt,
                        enabled: true
                    });
                    saveConfig();
                    
                    const addEmbed = new EmbedBuilder()
                        .setTitle('✅ Scheduled Message Added')
                        .setColor('#22c55e')
                        .setDescription('Your scheduled message has been created!')
                        .addFields(
                            { name: '⏰ Time', value: `\`${cron}\``, inline: true },
                            { name: '📺 Channel', value: `<#${channelId}>`, inline: true },
                            { name: '💬 Prompt', value: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''), inline: false }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [addEmbed], ephemeral: true });
                    break;
                    
                case 'remove':
                    const removeId = interaction.options.getString('id') || interaction.options.getString('channel_id');
                    const idx = aiConfig.scheduledMessages.findIndex(s => s.id === removeId);
                    
                    if (idx >= 0) {
                        const removed = aiConfig.scheduledMessages.splice(idx, 1)[0];
                        saveConfig();
                        
                        const removeEmbed = new EmbedBuilder()
                            .setTitle('🗑️ Schedule Removed')
                            .setColor('#ef4444')
                            .setDescription('The scheduled message has been removed.')
                            .addFields(
                                { name: 'Removed Time', value: `\`${removed.cron}\``, inline: true },
                                { name: 'Channel', value: `<#${removed.channelId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [removeEmbed], ephemeral: true });
                    } else {
                        const notFoundEmbed = new EmbedBuilder()
                            .setTitle('❌ Schedule Not Found')
                            .setColor('#ef4444')
                            .setDescription('Could not find the scheduled message. Use `/ai-schedule list` to see all schedules.')
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
                    }
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
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('path')
                    .setDescription('File path')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            const filePath = interaction.options.getString('path');
            
            switch (action) {
                case 'list':
                    const ragListEmbed = new EmbedBuilder()
                        .setTitle('📚 RAG Knowledge Base')
                        .setColor('#6366f1')
                        .setDescription(`Your knowledge base contains **${codeRAG.length}** indexed files.`)
                        .addFields(
                            { name: 'Files Indexed', value: codeRAG.length > 0 ? codeRAG.map(r => `• \`${r.file_path}\``).join('\n') : 'No files indexed', inline: false }
                        )
                        .setFooter({ text: 'Use /ai-rag add <path> to add files' })
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [ragListEmbed], ephemeral: true });
                    break;
                    
                case 'add':
                    if (!filePath) {
                        const usageEmbed = new EmbedBuilder()
                            .setTitle('❌ Missing File Path')
                            .setColor('#ef4444')
                            .setDescription('Please provide a file path to add to the knowledge base.')
                            .addFields(
                                { name: 'Usage', value: '/ai-rag add <file_path>', inline: false },
                                { name: 'Example', value: '/ai-rag add commands/help.js', inline: false }
                            )
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [usageEmbed], ephemeral: true });
                        return;
                    }
                    
                    await interaction.deferReply();
                    codeRAG = [];
                    await loadCodeRAG();
                    
                    const addEmbed = new EmbedBuilder()
                        .setTitle('✅ File Added to Knowledge Base')
                        .setColor('#22c55e')
                        .setDescription(`**${filePath}** has been indexed and added to the RAG system!`)
                        .addFields(
                            { name: 'Total Files', value: `${codeRAG.length}`, inline: true },
                            { name: 'Status', value: '🟢 Ready', inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [addEmbed] });
                    break;
                    
                case 'remove':
                    if (!filePath) {
                        const usageEmbed = new EmbedBuilder()
                            .setTitle('❌ Missing File Path')
                            .setColor('#ef4444')
                            .setDescription('Please provide a file path to remove from the knowledge base.')
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [usageEmbed], ephemeral: true });
                        return;
                    }
                    
                    const idx = codeRAG.findIndex(r => r.file_path === filePath);
                    
                    if (idx >= 0) {
                        codeRAG.splice(idx, 1);
                        
                        const removeEmbed = new EmbedBuilder()
                            .setTitle('✅ File Removed')
                            .setColor('#f59e0b')
                            .setDescription(`**${filePath}** has been removed from the knowledge base.`)
                            .addFields(
                                { name: 'Remaining Files', value: `${codeRAG.length}`, inline: true }
                            )
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [removeEmbed], ephemeral: true });
                    } else {
                        const notFoundEmbed = new EmbedBuilder()
                            .setTitle('❌ File Not Found')
                            .setColor('#ef4444')
                            .setDescription(`**${filePath}** was not found in the knowledge base.`)
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
                    }
                    break;
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-logs')
            .setDescription('View AI conversation/game history')
            .addStringOption(opt =>
                opt.setName('type')
                    .setDescription('Log type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Conversations', value: 'conversations' },
                        { name: 'Game History', value: 'games' }
                    )
            )
            .addIntegerOption(opt =>
                opt.setName('limit')
                    .setDescription('Number of entries')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const type = interaction.options.getString('type');
            const limit = interaction.options.getInteger('limit') || 20;
            
            await interaction.deferReply();
            
            try {
                const guildId = interaction.guildId;
                const response = await fetch('http://localhost:8080/api/shell/get-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type,
                        server_id: guildId,
                        channel_id: interaction.channelId,
                        limit
                    })
                });
                const data = await response.json() as any;
                
                if (!data.logs?.length) {
                    const emptyEmbed = new EmbedBuilder()
                        .setTitle(type === 'conversations' ? '💬 Conversations' : '🎮 Game History')
                        .setColor('#6b7280')
                        .setDescription('No logs found for this category.')
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [emptyEmbed] });
                    return;
                }
                
                if (type === 'conversations') {
                    const logFields = data.logs.slice(0, 10).map((l: any, i: number) => ({
                        name: `${i + 1}. ${l.user_tag || 'Unknown'} (${l.role})`,
                        value: l.content?.substring(0, 150) + (l.content?.length > 150 ? '...' : '') || 'Empty',
                        inline: false
                    }));
                    
                    const convEmbed = new EmbedBuilder()
                        .setTitle('💬 Recent AI Conversations')
                        .setColor('#6366f1')
                        .setDescription(`Showing ${Math.min(10, data.logs.length)} of ${data.logs.length} conversations`)
                        .addFields(...logFields)
                        .setFooter({ text: `Requested by ${interaction.user.tag}` })
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [convEmbed] });
                } else {
                    const gameFields = data.logs.slice(0, 10).map((l: any, i: number) => ({
                        name: `${i + 1}. ${l.game_type?.toUpperCase() || 'Game'}`,
                        value: `**${l.outcome || 'Unknown'}** | Bet: ${l.bet_amount || 0} → Payout: ${l.payout || 0} coins`,
                        inline: false
                    }));
                    
                    const gameEmbed = new EmbedBuilder()
                        .setTitle('🎮 Recent Game History')
                        .setColor('#f59e0b')
                        .setDescription(`Showing ${Math.min(10, data.logs.length)} of ${data.logs.length} games`)
                        .addFields(...gameFields)
                        .setFooter({ text: `Requested by ${interaction.user.tag}` })
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [gameEmbed] });
                }
            } catch (e: any) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setColor('#ef4444')
                    .setDescription('Failed to retrieve logs: ' + e.message)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-config')
            .setDescription('Advanced AI configuration panel')
            .addStringOption(opt =>
                opt.setName('setting')
                    .setDescription('Setting to configure')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Similarity Threshold', value: 'threshold' },
                        { name: 'Max Context Messages', value: 'maxcontext' },
                        { name: 'Embedding Model', value: 'embedding' },
                        { name: 'Ollama URL', value: 'ollama' },
                        { name: 'Full Status', value: 'status' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('value')
                    .setDescription('New value (leave empty to view current)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const setting = interaction.options.getString('setting');
            const value = interaction.options.getString('value');
            
            switch (setting) {
                case 'threshold':
                    if (value) {
                        const threshold = parseFloat(value);
                        if (isNaN(threshold) || threshold < 0 || threshold > 1) {
                            return interaction.reply({ content: 'Threshold must be between 0 and 1 (e.g., 0.75)', ephemeral: true });
                        }
                        aiConfig.similarityThreshold = threshold;
                        saveConfig();
                        
                        const setEmbed = new EmbedBuilder()
                            .setTitle('✅ Threshold Updated')
                            .setColor('#22c55e')
                            .setDescription(`Similarity threshold set to **${threshold}**`)
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [setEmbed], ephemeral: true });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('⚡ Similarity Threshold')
                            .setColor('#6366f1')
                            .setDescription('Current threshold for RAG similarity matching')
                            .addFields({ name: 'Current Value', value: `${aiConfig.similarityThreshold}`, inline: true })
                            .addFields({ name: 'Range', value: '0.0 - 1.0', inline: true })
                            .setFooter({ text: 'Use /ai-config threshold <value> to change' })
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                    
                case 'maxcontext':
                    if (value) {
                        const maxContext = parseInt(value);
                        if (isNaN(maxContext) || maxContext < 1 || maxContext > 200) {
                            return interaction.reply({ content: 'Max context must be between 1 and 200 messages', ephemeral: true });
                        }
                        aiConfig.maxContextMessages = maxContext;
                        saveConfig();
                        
                        const setEmbed = new EmbedBuilder()
                            .setTitle('✅ Max Context Updated')
                            .setColor('#22c55e')
                            .setDescription(`Max context messages set to **${maxContext}**`)
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [setEmbed], ephemeral: true });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('💬 Max Context Messages')
                            .setColor('#6366f1')
                            .setDescription('Number of messages to keep in conversation context')
                            .addFields({ name: 'Current Value', value: `${aiConfig.maxContextMessages} messages`, inline: true })
                            .addFields({ name: 'Range', value: '1 - 200', inline: true })
                            .setFooter({ text: 'Use /ai-config maxcontext <value> to change' })
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                    
                case 'embedding':
                    if (value) {
                        aiConfig.embeddingModel = value;
                        saveConfig();
                        
                        const setEmbed = new EmbedBuilder()
                            .setTitle('✅ Embedding Model Updated')
                            .setColor('#22c55e')
                            .setDescription(`Embedding model set to **${value}**`)
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [setEmbed], ephemeral: true });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('📐 Embedding Model')
                            .setColor('#6366f1')
                            .setDescription('Model used for generating text embeddings')
                            .addFields({ name: 'Current Model', value: `\`${aiConfig.embeddingModel}\``, inline: false })
                            .setFooter({ text: 'Use /ai-config embedding <model> to change' })
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                    
                case 'ollama':
                    if (value) {
                        aiConfig.ollamaUrl = value;
                        saveConfig();
                        
                        const setEmbed = new EmbedBuilder()
                            .setTitle('✅ Ollama URL Updated')
                            .setColor('#22c55e')
                            .setDescription(`Ollama URL set to **${value}**`)
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [setEmbed], ephemeral: true });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle('🔗 Ollama URL')
                            .setColor('#6366f1')
                            .setDescription('Endpoint for Ollama API')
                            .addFields({ name: 'Current URL', value: `\`${aiConfig.ollamaUrl}\``, inline: false })
                            .setFooter({ text: 'Use /ai-config ollama <url> to change' })
                            .setTimestamp();
                        
                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                    
                case 'status':
                    const fullStatusEmbed = new EmbedBuilder()
                        .setTitle('🎛️ AI Configuration Status')
                        .setColor('#6366f1')
                        .setDescription('Complete AI system configuration:')
                        .addFields(
                            { name: '🤖 Chat Model', value: `\`${aiConfig.model}\``, inline: true },
                            { name: '📐 Embedding Model', value: `\`${aiConfig.embeddingModel}\``, inline: true },
                            { name: '🔗 Ollama URL', value: `\`${aiConfig.ollamaUrl}\``, inline: false },
                            { name: '⚡ Similarity', value: `${aiConfig.similarityThreshold}`, inline: true },
                            { name: '💬 Max Context', value: `${aiConfig.maxContextMessages}`, inline: true },
                            { name: '🌐 Global', value: aiConfig.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                            { name: '🌀 Agentic', value: aiConfig.agenticMode.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                            { name: '📺 Channels', value: `${aiConfig.enabledChannels.length}`, inline: true },
                            { name: '📅 Scheduled', value: `${aiConfig.scheduledMessages.length}`, inline: true },
                            { name: '📚 RAG Files', value: `${codeRAG.length}`, inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.reply({ embeds: [fullStatusEmbed], ephemeral: true });
                    break;
            }
        }
    }
];

export const onMessage = async (message: any, api: any) => {
    if (message.author.bot) return;
    if (!aiConfig.enabled) return;
    
    const botId = api.client?.user?.id;
    if (!botId) return;
    
    const rawContent = message.content;
    
    let isMentioned = false;
    try {
        isMentioned = message.mentions?.has?.(botId) || rawContent.includes(`<@${botId}>`);
    } catch (e) {}
    
    let isReplyToBot = false;
    if (message.reference?.messageId) {
        try {
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            isReplyToBot = repliedMsg?.author?.id === botId;
        } catch (e) {}
    }
    
    const isAgenticFlag = /--agentic/gi.test(rawContent);
    if (isAgenticFlag) {
        aiConfig.agenticMode.enabled = true;
    }
    
    const isAgenticChannel = aiConfig.agenticMode.enabled;
    const channelId = message.channelId;
    
    if (!isChannelEnabled(channelId)) {
        if (isMentioned) {
            return message.reply('AI is not enabled in this channel. Use `/ai-manage enable` first.').catch(() => {});
        }
        return;
    }
    
    const content = rawContent.replace(/<@!?\d+>/g, '').replace(/--agentic/gi, '').trim();
    if (!content) return;
    
    const state = getChannelState(channelId);
    state.lastInteractionMs = Date.now();
    
    const isDirectedAtBot = isMentioned || isReplyToBot;
    if (!isDirectedAtBot && !isAgenticChannel) return;
    
    try {
        let conversationHistory: { role: string; content: string }[] = [];
        let recentContext = '';
        
        try {
            const historyMsgs = await message.channel.messages.fetch({ limit: 100 });
            conversationHistory = historyMsgs
                .filter((m: any) => m.author.id !== botId && !m.author.bot)
                .map((m: any) => ({ role: m.author.id === apiInstance.client.user.id ? 'assistant' : 'user', content: m.content }))
                .reverse();
            recentContext = historyMsgs.filter((m: any) => m.author.id !== botId).last(10).map((m: any) => m.content).join('\n');
        } catch (e) {}
        
        let replyContext = '';
        if (message.reference?.messageId) {
            try {
                const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                replyContext = `${repliedMsg.author.username}: ${repliedMsg.content}\n`;
            } catch (e) {}
        }
        
        const codeContext = await searchCodeRAG(content);
        const memoryContext = await findRelevantContext(channelId, content);
        
        const baseMessages = [
            ...memoryContext,
            ...conversationHistory.slice(0, 100)
        ];
        
        const systemPrompt = isAgenticChannel ? getAgenticSystemPrompt() : getDefaultSystemPrompt();
        const queryEmbedding = await getEmbedding(content);
        
        let finalResponse = '';
        let thinkingMsg: any = null;
        
        if (isAgenticChannel && !isMentioned) {
            const pass1Messages = [
                ...baseMessages,
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Current message: ${content}${recentContext ? '\n\nRecent: ' + recentContext : ''}\n\nShould you respond? Be VERY selective. Answer YES or NO only.` }
            ];
            
            const pass1 = await chatWithAI(pass1Messages, systemPrompt, channelId);
            const hasNO = /\bNO\b/i.test(pass1);
            const hasYES = /\bYES\b/i.test(pass1);
            
            if (hasNO && !hasYES) {
                return;
            }
            
            const thinking = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
            thinkingMsg = await message.reply(thinking).catch(() => null);
            
            const passiveContext = await getPassiveRagContext(message.guildId, content);
            
            const pass2Messages = [
                ...baseMessages,
                ...(passiveContext ? [{ role: 'system', content: `[PASSIVE CONTEXT from past conversations]: ${passiveContext}` }] : []),
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Message: ${content}${recentContext ? '\n\nRecent: ' + recentContext : ''}${replyContext}\n\nWhat brief response (1-2 sentences)? Reply with ONLY your response, no tools.` }
            ];
            
            let pass2 = await chatWithAI(pass2Messages, systemPrompt, channelId);
            finalResponse = cleanResponse(pass2);
            
            let toolCalls = parseToolCalls(pass2);
            let loopCount = 0;
            const maxLoops = 3;
            
            while (toolCalls.length > 0 && loopCount < maxLoops) {
                loopCount++;
                const toolResults = await processToolCalls(toolCalls, channelId);
                pass2Messages.push({ role: 'assistant', content: pass2 });
                pass2Messages.push({ role: 'system', content: `Results: ${toolResults}` });
                
                const pass3 = await chatWithAI(pass2Messages, systemPrompt, channelId);
                finalResponse = cleanResponse(pass3);
                toolCalls = parseToolCalls(pass3);
            }
            
        } else {
            const thinking = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
            thinkingMsg = await message.reply(thinking).catch(() => null);
            
            const userMessage = content + (recentContext ? '\n\nRecent: ' + recentContext : '') + (replyContext ? '\n\n' + replyContext : '');
            const messages = [
                ...baseMessages,
                { role: 'system', content: codeContext },
                { role: 'user', content: userMessage }
            ];
            
            let response = await chatWithAI(messages, systemPrompt, channelId);
            finalResponse = cleanResponse(response);
            
            let toolCalls = parseToolCalls(response);
            let loopCount = 0;
            const maxLoops = 2;
            
            while (toolCalls.length > 0 && loopCount < maxLoops) {
                loopCount++;
                const toolResults = await processToolCalls(toolCalls, channelId);
                messages.push({ role: 'assistant', content: response });
                messages.push({ role: 'system', content: `Results: ${toolResults}` });
                
                const newResponse = await chatWithAI(messages, systemPrompt, channelId);
                finalResponse = cleanResponse(newResponse);
                toolCalls = parseToolCalls(newResponse);
            }
        }
        
        addToMemory(channelId, 'user', content);
        if (finalResponse) {
            addToMemory(channelId, 'assistant', finalResponse);
        }
        
        if (finalResponse) {
            if (thinkingMsg) {
                await thinkingMsg.edit(finalResponse).catch(() => {
                    thinkingMsg.delete().catch(() => {});
                    message.reply(finalResponse).catch(() => {});
                });
            } else {
                await message.reply(finalResponse).catch(() => {});
            }
        } else if (thinkingMsg) {
            await thinkingMsg.delete().catch(() => {});
        }
        
        if (isAgenticFlag) {
            aiConfig.agenticMode.enabled = false;
        }
        
    } catch (e: any) {
        console.error('[AI] Error:', e);
        if (!message.replied) {
            await message.reply('Error: ' + e.message).catch(() => {});
        }
    }
};

export const init = async (api: any) => {
    apiInstance = api;
    poolRef = api.client?.pool || api.pool;
    
    loadConfig();
    await loadCodeRAG();
    startScheduler();
    startAutonomousScheduler(api);
    
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
    
    const mode = aiConfig.agenticMode.enabled ? ' (Agentic)' : '';
    api.log('AI Module Loaded. Status: ' + (aiConfig.enabled ? 'ENABLED' : 'DISABLED') + ' | Model: ' + aiConfig.model + ' | Scheduled: ' + aiConfig.scheduledMessages.length + mode);
};
