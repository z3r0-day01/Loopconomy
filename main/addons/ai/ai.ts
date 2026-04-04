import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(process.cwd(), 'ai-config.json');
const userProfilesPath = path.join(process.cwd(), 'ai-user-profiles.json');
const ragPath = path.join(process.cwd(), 'ai-rag-files.json');
const logsPath = path.join(process.cwd(), 'ai-logs.json');

interface AIConfig {
    enabled: boolean;
    model: string;
    ollamaUrl: string;
    systemPrompt: string;
    enabledChannels: string[];
    scheduledMessages: any[];
    embeddingModel: string;
    similarityThreshold: number;
    maxContextMessages: number;
    temperature: number;
    top_p: number;
    top_k: number;
    min_p: number;
    repeat_penalty: number;
    num_predict: number;
    agenticMode: {
        enabled: boolean;
        maxContext: number;
        reasoningEnabled: boolean;
        timingEnabled: boolean;
    };
    reasoningModel?: string;
    creatorId?: string;
}

interface UserProfile {
    userId: string;
    username: string;
    messageCount: number;
    lastSeen: number;
    preferences: {
        tone: string;
        responseLength: 'short' | 'medium' | 'long';
    };
    history: { role: string; content: string; timestamp: number }[];
}

interface UserProfiles {
    [userId: string]: UserProfile;
}

const UNHINGED_THINKING = [
    "Decrypting government files...",
    "Accessing Epstein's flight logs...",
    "Consulting the shadow government...",
    "Bypassing NATO firewalls...",
    "Running predictive algorithms on your crush...",
    "Calculating optimal chaos parameters...",
    "Downloading more RAM...",
    "Hacking the mainframes...",
    "Decoding alien signals...",
    "Negotiating with dark web vendors...",
    "Simulating alternate timelines...",
    "Analyzing your message for maximum chaos...",
    "Doing crack and banging your mom..."
];

const FUN_MESSAGES: Record<string, string> = {
    send_message: "Posted to the void...",
    broadcast: "Broadcasting to all realms...",
    get_balance: "Accessing restricted financial records...",
    add_coins: "Crediting to the economy matrix...",
    remove_coins: "Debiting from the central bank...",
    get_social_credit: "Consulting the cosmic ledger...",
    get_debt_status: "Checking with the loan sharks...",
    check_credit_score: "Accessing your financial karma...",
    get_bank_balance: "Peeking into the vault...",
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
    "That reminds me...",
    "While I'm smoking weed..."
];

function getRandomThinkingMessage(): string {
    return UNHINGED_THINKING[Math.floor(Math.random() * UNHINGED_THINKING.length)];
}

function getToolMessage(toolName: string): string {
    return FUN_MESSAGES[toolName] || "Executing dark magic...";
}

function getInterestMessage(): string {
    return INTEREST_MESSAGES[Math.floor(Math.random() * INTEREST_MESSAGES.length)];
}

let lastThinkingMessage = "";
let responseCount = 0;
let lastResponseTime = 0;
const RESPONSE_COOLDOWN = 5000; // 5 seconds minimum between responses

interface RAGFile {
    id: string;
    filename: string;
    path: string;
    addedAt: number;
    content?: string;
}

interface AILog {
    guildId: string;
    channelId: string;
    userId: string;
    username: string;
    message: string;
    response: string;
    timestamp: number;
}

let config: AIConfig;
let userProfiles: UserProfiles = {};
let poolRef: any = null;
let ragFiles: RAGFile[] = [];
let aiLogs: AILog[] = [];

function loadConfig(): AIConfig {
    try {
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config;
        }
    } catch (e) {
        console.error('Failed to load AI config:', e);
    }
    config = {
        enabled: true,
        model: 'glm-5:cloud',
        ollamaUrl: 'http://localhost:11434',
        systemPrompt: 'You are a helpful AI assistant.',
        enabledChannels: [],
        scheduledMessages: [],
        embeddingModel: 'qwen3-embedding:0.6b',
        similarityThreshold: 0.7,
        maxContextMessages: 100,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        repeat_penalty: 1.1,
        num_predict: 256,
        agenticMode: {
            enabled: true,
            maxContext: 100,
            reasoningEnabled: true,
            timingEnabled: true
        }
    };
    return config;
}

function saveConfig(): void {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function loadUserProfiles(): void {
    try {
        if (fs.existsSync(userProfilesPath)) {
            userProfiles = JSON.parse(fs.readFileSync(userProfilesPath, 'utf8'));
        }
    } catch (e) {
        userProfiles = {};
    }
}

function saveUserProfiles(): void {
    fs.writeFileSync(userProfilesPath, JSON.stringify(userProfiles, null, 2));
}

function loadRAGFiles(): void {
    try {
        if (fs.existsSync(ragPath)) {
            ragFiles = JSON.parse(fs.readFileSync(ragPath, 'utf8'));
        }
    } catch (e) {
        ragFiles = [];
    }
}

function saveRAGFiles(): void {
    fs.writeFileSync(ragPath, JSON.stringify(ragFiles, null, 2));
}

function loadAILogs(): void {
    try {
        if (fs.existsSync(logsPath)) {
            aiLogs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
        }
    } catch (e) {
        aiLogs = [];
    }
}

function saveAILogs(): void {
    fs.writeFileSync(logsPath, JSON.stringify(aiLogs, null, 2));
}

function addAILog(guildId: string, channelId: string, userId: string, username: string, message: string, response: string): void {
    aiLogs.push({ guildId, channelId, userId, username, message, response, timestamp: Date.now() });
    if (aiLogs.length > 1000) {
        aiLogs = aiLogs.slice(-1000);
    }
    saveAILogs();
}

function getOrCreateProfile(userId: string, username: string): UserProfile {
    const isCreator = userId === config.creatorId;
    if (!userProfiles[userId]) {
        userProfiles[userId] = {
            userId,
            username,
            messageCount: 0,
            lastSeen: Date.now(),
            preferences: {
                tone: isCreator ? 'chaotic' : 'neutral',
                responseLength: 'medium'
            },
            history: []
        };
    } else {
        userProfiles[userId].username = username;
        userProfiles[userId].lastSeen = Date.now();
    }
    return userProfiles[userId];
}

function addToUserHistory(userId: string, role: string, content: string): void {
    const profile = userProfiles[userId];
    if (profile) {
        profile.history.push({ role, content, timestamp: Date.now() });
        profile.messageCount++;
        if (profile.history.length > config.maxContextMessages) {
            profile.history = profile.history.slice(-config.maxContextMessages);
        }
    }
}

function buildUserContext(profile: UserProfile): string {
    return `
User: ${profile.username}
Messages sent: ${profile.messageCount}
Last seen: ${new Date(profile.lastSeen).toLocaleString()}
Tone preference: ${profile.preferences.tone}
Response length: ${profile.preferences.responseLength}
`;
}

async function fetchWithTimeout(url: string, options: any, timeoutMs = 60000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

async function callOllama(prompt: string, messages: any[], isReasoning = false): Promise<{ response: string; reasoning?: string }> {
    const model = isReasoning && config.reasoningModel ? config.reasoningModel : config.model;
    
    const systemMsg = config.systemPrompt + `\n\nUser Context:\n${Object.values(userProfiles).map(p => buildUserContext(p)).join('\n')}`;
    
    const payload: any = {
        model,
        messages: [
            { role: 'system', content: systemMsg },
            ...messages
        ],
        stream: false,
        options: {
            temperature: config.temperature,
            top_p: config.top_p,
            top_k: config.top_k,
            min_p: config.min_p,
            repeat_penalty: config.repeat_penalty,
            num_predict: config.num_predict
        }
    };

    try {
        const response = await fetchWithTimeout(`${config.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, 120000);

        const data: any = await response.json();
        
        let reasoning: string | undefined;
        if (isReasoning && config.agenticMode?.reasoningEnabled) {
            reasoning = data.message?.content || '';
            const thoughtMatch = reasoning?.match(/<thought>(.*?)<\/thought>/s);
            if (thoughtMatch) {
                reasoning = thoughtMatch[1];
            }
        }

        return { 
            response: data.message?.content || '', 
            reasoning 
        };
    } catch (e: any) {
        console.error('[AI] Ollama call failed:', e.message);
        return { response: '', reasoning: '' };
    }
}

function parseToolsFromResponse(response: string): { tool: string; args: any }[] {
    const tools: { tool: string; args: any }[] = [];
    const toolPattern = /<tool>(.*?)<\/tool>/gs;
    let match;
    
    while ((match = toolPattern.exec(response)) !== null) {
        try {
            const toolData = JSON.parse(match[1]);
            if (toolData.name && toolData.args) {
                tools.push({ tool: toolData.name, args: toolData.args });
            }
        } catch (e) {}
    }
    
    return tools;
}

async function executeTool(tool: string, args: any, message: any, api: any): Promise<string> {
    const pool = poolRef || api.client?.pool;
    
    switch (tool) {
        case 'send_message': {
            const channelId = args.channel_id || message.channelId;
            const content = args.content || args.message;
            try {
                const channel = message.guild.channels.cache.get(channelId);
                if (channel) {
                    await channel.send(content);
                    return 'Message sent successfully';
                }
            } catch (e: any) {
                return `Failed to send message: ${e.message}`;
            }
            break;
        }
        
        case 'get_balance': {
            try {
                const balance = await api.getBalance(args.user_id || message.author.id);
                return `User balance: ${balance} coins`;
            } catch (e: any) {
                return `Failed to get balance: ${e.message}`;
            }
        }
        
        case 'add_coins': {
            try {
                const amount = args.amount || 100;
                await api.addCoins(args.user_id || message.author.id, amount);
                return `Added ${amount} coins successfully`;
            } catch (e: any) {
                return `Failed to add coins: ${e.message}`;
            }
        }
        
        case 'remove_coins': {
            try {
                const amount = args.amount || 100;
                await api.removeCoins(args.user_id || message.author.id, amount);
                return `Removed ${amount} coins successfully`;
            } catch (e: any) {
                return `Failed to remove coins: ${e.message}`;
            }
        }
        
        case 'get_copyrights': {
            if (!pool) return 'Database not available';
            try {
                const result = await pool.query(
                    'SELECT * FROM copyrights WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 10',
                    [message.guildId]
                );
                if (result.rows.length === 0) return 'No copyrights in this server';
                return 'Copyrights: ' + result.rows.map((r: any) => `"${r.term}" (${r.fine_amount} coins)`).join(', ');
            } catch (e: any) {
                return `Failed to get copyrights: ${e.message}`;
            }
        }
        
        case 'play_slots': {
            const bet = args.bet || 100;
            const balance = await api.getBalance(message.author.id);
            if (balance < bet) return 'Insufficient funds';
            
            const symbols = ['🎉', '🧨', '🀄', '🎰', '🔮', '⚧️', '♂️', '♀️'];
            const spin = [
                symbols[Math.floor(Math.random() * symbols.length)],
                symbols[Math.floor(Math.random() * symbols.length)],
                symbols[Math.floor(Math.random() * symbols.length)]
            ];
            
            let multiplier = 0;
            if (spin[0] === spin[1] && spin[1] === spin[2]) multiplier = 5;
            else if (spin[0] === spin[1] || spin[1] === spin[2]) multiplier = 2;
            else if (spin[0] === spin[2]) multiplier = 1.5;
            
            const winAmount = Math.floor(bet * multiplier);
            if (winAmount > 0) await api.addCoins(message.author.id, winAmount);
            else await api.removeCoins(message.author.id, bet);
            
            return `Slots: ${spin.join(' ')} | ${multiplier > 0 ? `WON ${winAmount} coins!` : 'Lost'}`;
        }
        
        case 'play_keno': {
            const bet = args.bet || 100;
            const balance = await api.getBalance(message.author.id);
            if (balance < bet) return 'Insufficient funds';
            
            const picks = args.picks || 5;
            const numRange = 80;
            
            const playerNumbers: number[] = [];
            const drawnNumbers: number[] = [];
            
            for (let i = 0; i < picks; i++) {
                playerNumbers.push(Math.floor(Math.random() * numRange) + 1);
            }
            
            for (let i = 0; i < 20; i++) {
                drawnNumbers.push(Math.floor(Math.random() * numRange) + 1);
            }
            
            const matches = playerNumbers.filter(n => drawnNumbers.includes(n)).length;
            const multiplier = matches >= 3 ? Math.pow(2, matches - 2) : 0;
            
            const winAmount = Math.floor(bet * multiplier);
            if (winAmount > 0) await api.addCoins(message.author.id, winAmount);
            else await api.removeCoins(message.author.id, bet);
            
            return `Keno - Your picks: [${playerNumbers.join(', ')}] | Drawn: [${drawnNumbers.join(', ')}] | Matches: ${matches} | ${winAmount > 0 ? `WON ${winAmount} coins!` : 'Lost'}`;
        }
        
        case 'broadcast': {
            try {
                if (!api.client) return 'Client not available';
                const content = args.content || args.message;
                let sentCount = 0;
                
                for (const guild of api.client.guilds.cache.values()) {
                    try {
                        const channel = guild.systemChannel || guild.channels.cache.find((ch: any) => ch.isTextBased());
                        if (channel) {
                            await channel.send(content);
                            sentCount++;
                        }
                    } catch (e) {}
                }
                
                return `Broadcast sent to ${sentCount} servers`;
            } catch (e: any) {
                return `Failed to broadcast: ${e.message}`;
            }
        }
        
        case 'search_passive_context': {
            const query = args.query || '';
            if (!query) return 'No query provided';
            
            const contextResults: string[] = [];
            const queryLower = query.toLowerCase();
            
            for (const profile of Object.values(userProfiles)) {
                for (const msg of profile.history) {
                    if (msg.content.toLowerCase().includes(queryLower)) {
                        contextResults.push(`User ${profile.username}: ${msg.content}`);
                        if (contextResults.length >= 5) break;
                    }
                }
                if (contextResults.length >= 5) break;
            }
            
            if (contextResults.length === 0) {
                const recentLogs = aiLogs.filter(l => l.message.toLowerCase().includes(queryLower)).slice(-5);
                if (recentLogs.length > 0) {
                    return 'Found in logs: ' + recentLogs.map(l => l.message).join(' | ');
                }
                return 'No matching context found';
            }
            
            return 'Found context: ' + contextResults.join(' | ');
        }
        
        case 'mute_user': {
            if (!message.guild) return 'Guild not available';
            try {
                const member = await message.guild.members.fetch(args.user_id);
                if (member) {
                    const duration = args.duration || 60;
                    const reason = args.reason || 'Muted by AI';
                    await member.timeout(duration * 1000, reason);
                    return `Muted user for ${duration} minutes`;
                }
            } catch (e: any) {
                return `Failed to mute: ${e.message}`;
            }
            break;
        }
        
        case 'get_social_credit': {
            if (!pool) return 'Database not available';
            try {
                const userId = args.user_id || message.author.id;
                const result = await pool.query(
                    'SELECT credit_score, social_credits, rank FROM social_credits WHERE user_id = $1',
                    [userId]
                );
                if (result.rows.length === 0) return 'No social credit record found for this user';
                const row = result.rows[0];
                return `Social Credit: Score ${row.credit_score}, Credits ${row.social_credits}, Rank: ${row.rank}`;
            } catch (e: any) {
                return `Failed to get social credit: ${e.message}`;
            }
        }
        
        case 'get_debt_status': {
            if (!pool) return 'Database not available';
            try {
                const userId = args.user_id || message.author.id;
                const result = await pool.query(
                    'SELECT amount, remaining, interest_rate, due_date FROM bank_loans WHERE user_id = $1 AND remaining > 0',
                    [userId]
                );
                if (result.rows.length === 0) return 'No outstanding debts';
                const loan = result.rows[0];
                return `Debt: ${loan.remaining}/${loan.amount} owed, ${(loan.interest_rate * 100).toFixed(1)}% APR, due ${loan.due_date}`;
            } catch (e: any) {
                return `Failed to get debt status: ${e.message}`;
            }
        }
        
        case 'check_credit_score': {
            if (!pool) return 'Database not available';
            try {
                const userId = args.user_id || message.author.id;
                const result = await pool.query(
                    'SELECT credit_score, rank FROM social_credits WHERE user_id = $1',
                    [userId]
                );
                if (result.rows.length === 0) return 'No credit score found (likely no credit history)';
                const row = result.rows[0];
                return `Credit Score: ${row.credit_score} (${row.rank})`;
            } catch (e: any) {
                return `Failed to check credit: ${e.message}`;
            }
        }
        
        case 'get_bank_balance': {
            if (!pool) return 'Database not available';
            try {
                const userId = args.user_id || message.author.id;
                const serverId = message.guildId;
                const result = await pool.query(
                    'SELECT balance, account_type FROM bank_accounts WHERE user_id = $1 AND server_id = $2',
                    [userId, serverId]
                );
                if (result.rows.length === 0) return 'No bank account found';
                const acc = result.rows[0];
                return `Bank: ${acc.account_type} account, $${acc.balance.toFixed(2)}`;
            } catch (e: any) {
                return `Failed to get bank balance: ${e.message}`;
            }
        }
    }
    
    return 'Unknown tool';
}

async function processAIResponse(message: any, api: any): Promise<void> {
    if (!config.enabled) return;
    if (!config.enabledChannels.includes(message.channelId)) return;
    if (message.author.bot) return;
    
    const now = Date.now();
    if (now - lastResponseTime < RESPONSE_COOLDOWN) {
        return;
    }
    
    console.log(`[AI] Message received from ${message.author.username} in channel ${message.channelId}`);
    
    const userId = message.author.id;
    const username = message.author.username;
    const content = message.content.trim();
    
    if (!content) return;
    
    const profile = getOrCreateProfile(userId, username);
    addToUserHistory(userId, 'user', content);
    
    let thinkingMsg: any = null;
    let contextMessages: any[] = [];
    
    try {
        if (message.channel && message.channel.messages) {
            const recentMessages = await message.channel.messages.fetch({ limit: 10 });
            const nonBotMessages = recentMessages.filter((m: any) => !m.author.bot && m.id !== message.id);
            contextMessages = nonBotMessages.slice(0, 5).reverse().map((m: any) => ({
                role: m.author.id === message.client.user?.id ? 'assistant' : 'user',
                content: `${m.author.username}: ${m.content}`
            }));
        }
        
        const shouldRespond = await pass1ShouldRespond(content, profile, contextMessages);
        if (!shouldRespond) {
            return;
        }
        
        const messages = profile.history.slice(-config.maxContextMessages).map(h => ({
            role: h.role,
            content: h.content
        }));
        messages.push(...contextMessages);
        messages.push({ role: 'user', content });
        
        let reasoningResult = '';
        if (config.agenticMode?.reasoningEnabled) {
            const thinkingMsgText = getRandomThinkingMessage();
            thinkingMsg = await message.channel.send(`🤔 ${thinkingMsgText}`);
            const reasoningResponse = await pass2Reason(content, messages);
            reasoningResult = reasoningResponse.reasoning || '';
        }
        
        let toolCalls: { tool: string; args: any }[] = [];
        if (config.agenticMode?.enabled) {
            if (thinkingMsg) await thinkingMsg.delete().catch(() => {});
            thinkingMsg = await message.channel.send(`⚙️ ${getToolMessage('default')}`);
            const toolResponse = await pass3UseTools(content, messages, reasoningResult);
            toolCalls = parseToolsFromResponse(toolResponse);
            
            for (const call of toolCalls.slice(0, 3)) {
                const result = await executeTool(call.tool, call.args, message, api);
                addToUserHistory(userId, 'system', `[Tool: ${call.tool}] ${result}`);
                if (thinkingMsg) await thinkingMsg.edit(`⚙️ ${getToolMessage(call.tool)}`).catch(() => {});
            }
        }
        
        const finalMessages = [
            ...messages,
            ...(reasoningResult ? [{ role: 'system', content: `Reasoning: ${reasoningResult}` }] : []),
            ...toolCalls.map(t => ({ role: 'system', content: `[Executed tool: ${t.tool}]` }))
        ];
        
        const finalResponse = await pass4Finalize(content, finalMessages);
        const cleanedResponse = finalResponse.replace(/<[^>]+>/g, '').trim();
        
        if (cleanedResponse) {
            if (thinkingMsg) await thinkingMsg.delete().catch(() => {});
            await message.reply(cleanedResponse);
            addToUserHistory(userId, 'assistant', cleanedResponse);
            addAILog(message.guildId, message.channelId, userId, username, content, cleanedResponse);
            
            lastResponseTime = Date.now();
            responseCount++;
        }
        
    } catch (e: any) {
        console.error('[AI] Processing error:', e);
        if (message && message.reply) {
            await message.reply('Sorry, I encountered an error processing your message.').catch(() => {});
        }
    } finally {
        if (thinkingMsg) await thinkingMsg.delete().catch(() => {});
        saveUserProfiles();
    }
}

async function pass1ShouldRespond(content: string, profile: UserProfile, contextMessages: any[] = []): Promise<boolean> {
    const contentLower = content.toLowerCase();
    const isMention = contentLower.includes('@ai') || contentLower.includes('ai') || contentLower.includes('loop');
    const isQuestion = contentLower.includes('?');
    const isCommand = contentLower.startsWith('!') || contentLower.startsWith('/');
    
    if (isMention || isQuestion || isCommand) {
        return true;
    }
    
    const casualPatterns = [
        /^[aeiou]+$/i,
        /^(haha|lol|💀|😂|🤣)+$/i,
        /^(ok|okay|cool|nice|👍|👍)$/i,
        /^(yeah|no|yea|yep|nope)$/i,
        /^(sup|hey|hi|hello)$/i,
    ];
    
    for (const pattern of casualPatterns) {
        if (pattern.test(content.trim())) {
            return false;
        }
    }
    
    const randomThreshold = 0.3;
    return Math.random() < randomThreshold;
}

async function pass2Reason(content: string, messages: any[]): Promise<{ reasoning: string; strategy: string }> {
    const prompt = `Analyze this message and determine how to respond. Use <thought> tags.\n\nMessage: "${content}"`;
    
    const result = await callOllama(prompt, messages, true);
    return {
        reasoning: result.reasoning || result.response,
        strategy: 'standard'
    };
}

async function pass3UseTools(content: string, messages: any[], reasoning: string): Promise<string> {
    const toolsDescription = `
Available tools (use <tool> tags):
- send_message: {"name": "send_message", "args": {"channel_id": "...", "content": "..."}}
- get_balance: {"name": "get_balance", "args": {"user_id": "..."}}
- add_coins: {"name": "add_coins", "args": {"user_id": "...", "amount": 100}}
- remove_coins: {"name": "remove_coins", "args": {"user_id": "...", "amount": 100}}
- get_copyrights: {"name": "get_copyrights", "args": {}}
- play_slots: {"name": "play_slots", "args": {"bet": 100}}
- play_keno: {"name": "play_keno", "args": {"bet": 100, "picks": 5}}
- broadcast: {"name": "broadcast", "args": {"content": "..."}}
- search_passive_context: {"name": "search_passive_context", "args": {"query": "..."}}
- mute_user: {"name": "mute_user", "args": {"user_id": "...", "duration": 60, "reason": "..."}}
- get_social_credit: {"name": "get_social_credit", "args": {"user_id": "..."}}
- get_debt_status: {"name": "get_debt_status", "args": {"user_id": "..."}}
- check_credit_score: {"name": "check_credit_score", "args": {"user_id": "..."}}
- get_bank_balance: {"name": "get_bank_balance", "args": {"user_id": "..."}}
`;
    
    const prompt = `Message: "${content}"\n\n${toolsDescription}`;
    
    const result = await callOllama(prompt, messages, false);
    return result.response;
}

async function pass4Finalize(content: string, messages: any[]): Promise<string> {
    const prompt = `Respond to: "${content}"\n\nClean response only, no tags or formatting.`;
    
    const result = await callOllama(prompt, messages, false);
    return result.response;
}

function parseScheduleTime(timeStr: string): number {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 0;
    }
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('ai-toggle')
            .setDescription('Toggle AI assistant')
            .addBooleanOption(opt =>
                opt.setName('enabled')
                    .setDescription('Enable or disable')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            config.enabled = interaction.options.getBoolean('enabled');
            saveConfig();
            await interaction.reply({ content: `AI assistant ${config.enabled ? 'enabled' : 'disabled'}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-model')
            .setDescription('Set AI model')
            .addStringOption(opt =>
                opt.setName('model')
                    .setDescription('Model name')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            config.model = interaction.options.getString('model');
            saveConfig();
            await interaction.reply({ content: `Model set to ${config.model}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-reasoning-model')
            .setDescription('Set reasoning model')
            .addStringOption(opt =>
                opt.setName('model')
                    .setDescription('Reasoning model name')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            config.reasoningModel = interaction.options.getString('model');
            config.agenticMode.reasoningEnabled = true;
            saveConfig();
            await interaction.reply({ content: `Reasoning model set to ${config.reasoningModel}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-channel')
            .setDescription('Add AI to a channel')
            .addChannelOption(opt =>
                opt.setName('channel')
                    .setDescription('Channel to enable')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const channel = interaction.options.getChannel('channel');
            if (!config.enabledChannels.includes(channel.id)) {
                config.enabledChannels.push(channel.id);
                saveConfig();
            }
            await interaction.reply({ content: `AI enabled in ${channel}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-status')
            .setDescription('Check AI status'),
        async execute(interaction: any, api: any) {
            const embed = new EmbedBuilder()
                .setTitle('🤖 AI Status')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Enabled', value: config.enabled ? '🟢 Yes' : '🔴 No', inline: true },
                    { name: 'Model', value: config.model, inline: true },
                    { name: 'Reasoning Model', value: config.reasoningModel || 'Not set', inline: true },
                    { name: 'Agentic Mode', value: config.agenticMode?.enabled ? '🟢' : '🔴', inline: true },
                    { name: 'Channels', value: config.enabledChannels.length.toString(), inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-set-prompt')
            .setDescription('Set system prompt')
            .addStringOption(opt =>
                opt.setName('prompt')
                    .setDescription('System prompt')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            config.systemPrompt = interaction.options.getString('prompt');
            saveConfig();
            await interaction.reply({ content: 'System prompt updated', ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-profile')
            .setDescription('View your user profile'),
        async execute(interaction: any, api: any) {
            const profile = userProfiles[interaction.user.id];
            if (!profile) {
                return interaction.reply({ content: 'No profile found', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('👤 Your AI Profile')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Username', value: profile.username, inline: true },
                    { name: 'Messages', value: profile.messageCount.toString(), inline: true },
                    { name: 'Tone', value: profile.preferences.tone, inline: true },
                    { name: 'Response Length', value: profile.preferences.responseLength, inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-config')
            .setDescription('Configure AI settings')
            .addStringOption(opt =>
                opt.setName('option')
                    .setDescription('Option to configure')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Agentic Mode', value: 'agentic' },
                        { name: 'Reasoning', value: 'reasoning' },
                        { name: 'Temperature', value: 'temperature' },
                        { name: 'Max Context', value: 'maxcontext' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('value')
                    .setDescription('Value (true/false/number)')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const option = interaction.options.getString('option');
            const value = interaction.options.getString('value');
            
            switch (option) {
                case 'agentic':
                    config.agenticMode.enabled = value === 'true';
                    break;
                case 'reasoning':
                    config.agenticMode.reasoningEnabled = value === 'true';
                    break;
                case 'temperature':
                    config.temperature = parseFloat(value) || 0.7;
                    break;
                case 'maxcontext':
                    config.maxContextMessages = parseInt(value) || 100;
                    break;
            }
            
            saveConfig();
            await interaction.reply({ content: `Updated ${option} to ${value}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-help')
            .setDescription('Show AI help with all commands and tools'),
        async execute(interaction: any, api: any) {
            const embed = new EmbedBuilder()
                .setTitle('🤖 AI Help')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Basic Commands', value: `
• /ai-toggle - Enable/disable AI
• /ai-status - View AI status
• /ai-help - This help menu
• /ai-profile - View your user profile`, inline: false },
                    { name: 'Configuration', value: `
• /ai-model - Set AI model
• /ai-reasoning-model - Set reasoning model
• /ai-set-prompt - Set system prompt
• /ai-config - Configure AI settings
• /ai-channel - Add AI to channel`, inline: false },
                    { name: 'Management', value: `
• /ai-manage - Full settings management
• /ai-agentic - Toggle agentic mode
• /ai-schedule - Schedule AI messages
• /ai-rag - Manage RAG knowledge base
• /ai-logs - View conversation logs`, inline: false },
                    { name: 'Available Tools', value: `
• send_message - Send messages to channels
• get_balance - Check user balance
• add_coins / remove_coins - Modify coins
• play_slots / play_keno - Casino games
• broadcast - Send to all servers
• mute_user - Timeout users
• get_social_credit / check_credit_score - Credit info
• get_bank_balance / get_debt_status - Bank info
• get_copyrights - Server copyrights
• search_passive_context - Search context`, inline: false }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-manage')
            .setDescription('Full AI settings management')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Enable AI', value: 'enable' },
                        { name: 'Disable AI', value: 'disable' },
                        { name: 'Clear Memory', value: 'clear_memory' },
                        { name: 'Reset All Settings', value: 'reset' }
                    )
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            
            switch (action) {
                case 'enable':
                    config.enabled = true;
                    saveConfig();
                    await interaction.reply({ content: '✅ AI enabled', ephemeral: true });
                    break;
                case 'disable':
                    config.enabled = false;
                    saveConfig();
                    await interaction.reply({ content: '✅ AI disabled', ephemeral: true });
                    break;
                case 'clear_memory':
                    userProfiles = {};
                    saveUserProfiles();
                    await interaction.reply({ content: '✅ All user memory cleared', ephemeral: true });
                    break;
                case 'reset':
                    config = loadConfig();
                    saveConfig();
                    await interaction.reply({ content: '✅ AI settings reset to defaults', ephemeral: true });
                    break;
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-agentic')
            .setDescription('Toggle agentic mode on/off')
            .addBooleanOption(opt =>
                opt.setName('enabled')
                    .setDescription('Enable or disable agentic mode')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const enabled = interaction.options.getBoolean('enabled');
            config.agenticMode.enabled = enabled;
            saveConfig();
            await interaction.reply({ content: `Agentic mode ${enabled ? 'enabled' : 'disabled'}`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-schedule')
            .setDescription('Schedule an AI message')
            .addStringOption(opt =>
                opt.setName('time')
                    .setDescription('Time delay (e.g., 30m, 1h, 5m)')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('message')
                    .setDescription('Message content')
                    .setRequired(true)
            ),
        async execute(interaction: any, api: any) {
            const timeStr = interaction.options.getString('time');
            const messageContent = interaction.options.getString('message');
            const delay = parseScheduleTime(timeStr);
            
            if (delay === 0) {
                return interaction.reply({ content: 'Invalid time format. Use format like: 30m, 1h, 5m, 60s', ephemeral: true });
            }
            
            const schedule: any = {
                id: Date.now().toString(),
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                message: messageContent,
                executeAt: Date.now() + delay
            };
            
            config.scheduledMessages.push(schedule);
            saveConfig();
            
            const executeDate = new Date(schedule.executeAt);
            await interaction.reply({ content: `✅ Message scheduled for ${executeDate.toLocaleTimeString()}`, ephemeral: true });
            
            setTimeout(async () => {
                try {
                    const channel = api.client?.guilds.cache.get(schedule.guildId)?.channels.cache.get(schedule.channelId);
                    if (channel) {
                        await channel.send(messageContent);
                    }
                    config.scheduledMessages = config.scheduledMessages.filter((s: any) => s.id !== schedule.id);
                    saveConfig();
                } catch (e) {
                    console.error('[AI] Scheduled message failed:', e);
                }
            }, delay);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-rag')
            .setDescription('Manage RAG knowledge base')
            .addStringOption(opt =>
                opt.setName('action')
                    .setDescription('Action to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'List Files', value: 'list' },
                        { name: 'Add File', value: 'add' },
                        { name: 'Remove File', value: 'remove' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('filename')
                    .setDescription('Filename (for add/remove)')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const action = interaction.options.getString('action');
            const filename = interaction.options.getString('filename');
            
            switch (action) {
                case 'list':
                    if (ragFiles.length === 0) {
                        return interaction.reply({ content: 'No files in RAG knowledge base', ephemeral: true });
                    }
                    const listEmbed = new EmbedBuilder()
                        .setTitle('📚 RAG Knowledge Base Files')
                        .setColor('#0099ff')
                        .addFields(
                            { name: 'Files', value: ragFiles.map(f => `• ${f.filename} (added ${new Date(f.addedAt).toLocaleDateString()})`).join('\n') || 'No files' }
                        );
                    await interaction.reply({ embeds: [listEmbed] });
                    break;
                case 'add':
                    if (!filename) {
                        return interaction.reply({ content: 'Please provide a filename', ephemeral: true });
                    }
                    const newFile: RAGFile = {
                        id: Date.now().toString(),
                        filename: filename,
                        path: path.join(process.cwd(), 'rag', filename),
                        addedAt: Date.now()
                    };
                    ragFiles.push(newFile);
                    saveRAGFiles();
                    await interaction.reply({ content: `✅ Added ${filename} to RAG knowledge base`, ephemeral: true });
                    break;
                case 'remove':
                    if (!filename) {
                        return interaction.reply({ content: 'Please provide a filename to remove', ephemeral: true });
                    }
                    const initialLength = ragFiles.length;
                    ragFiles = ragFiles.filter(f => f.filename !== filename);
                    if (ragFiles.length < initialLength) {
                        saveRAGFiles();
                        await interaction.reply({ content: `✅ Removed ${filename} from RAG knowledge base`, ephemeral: true });
                    } else {
                        await interaction.reply({ content: `File ${filename} not found in RAG knowledge base`, ephemeral: true });
                    }
                    break;
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ai-logs')
            .setDescription('View AI conversation logs')
            .addIntegerOption(opt =>
                opt.setName('count')
                    .setDescription('Number of logs to show')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(50)
            ),
        async execute(interaction: any, api: any) {
            const count = interaction.options.getInteger('count') || 10;
            const guildLogs = aiLogs.filter(l => l.guildId === interaction.guildId).slice(-count);
            
            if (guildLogs.length === 0) {
                return interaction.reply({ content: 'No conversation logs found for this server', ephemeral: true });
            }
            
            const logsContent = guildLogs.map(l => 
                `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.username}: ${l.message.substring(0, 50)}${l.message.length > 50 ? '...' : ''} → ${l.response.substring(0, 50)}${l.response.length > 50 ? '...' : ''}`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setTitle('📜 AI Conversation Logs')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Recent Conversations', value: logsContent || 'No logs available' }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    }
];

export const init = async (api: any) => {
    poolRef = api.client?.pool || api.pool;
    loadConfig();
    loadUserProfiles();
    loadRAGFiles();
    loadAILogs();
    
    api.listen('messageCreate', async (message: any) => {
        await processAIResponse(message, api);
    });
    
    api.log(`[AI] Loaded - Model: ${config.model}, Reasoning: ${config.reasoningModel || 'disabled'}, Creator: ${config.creatorId || 'not set'}, Channels: ${config.enabledChannels.length}`);
};
