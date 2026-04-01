import { SlashCommandBuilder, EmbedBuilder, ColorResolvable } from 'discord.js';

let poolRef: any = null;

interface CreditRank {
    rank: string;
    title: string;
    emoji: string;
    color: ColorResolvable;
}

function getCreditRank(score: number): CreditRank {
    if (score >= 850) return { rank: 'S+', title: 'Excellent', emoji: '👑', color: '#FFD700' as ColorResolvable };
    if (score >= 800) return { rank: 'S', title: 'Outstanding', emoji: '🏆', color: '#00FF00' as ColorResolvable };
    if (score >= 750) return { rank: 'S-', title: 'Superb', emoji: '⭐', color: '#00FF7F' as ColorResolvable };
    if (score >= 700) return { rank: 'A+', title: 'Very Good', emoji: '🌟', color: '#00BFFF' as ColorResolvable };
    if (score >= 650) return { rank: 'A', title: 'Good', emoji: '✨', color: '#1E90FF' as ColorResolvable };
    if (score >= 550) return { rank: 'B', title: 'Above Average', emoji: '📈', color: '#32CD32' as ColorResolvable };
    if (score >= 450) return { rank: 'C', title: 'Average', emoji: '📊', color: '#FFA500' as ColorResolvable };
    if (score >= 350) return { rank: 'D', title: 'Below Average', emoji: '📉', color: '#FF6347' as ColorResolvable };
    return { rank: 'F', title: 'Poor', emoji: '⚠️', color: '#FF0000' as ColorResolvable };
}

function getInterestRate(rank: string): { rate: number; maxLoan: number; canLoan: boolean } {
    switch (rank) {
        case 'S+': return { rate: 2, maxLoan: 50000, canLoan: true };
        case 'S':
        case 'S-': return { rate: 3, maxLoan: 40000, canLoan: true };
        case 'A+': return { rate: 4, maxLoan: 30000, canLoan: true };
        case 'A': return { rate: 5, maxLoan: 20000, canLoan: true };
        case 'B': return { rate: 7, maxLoan: 10000, canLoan: true };
        case 'C': return { rate: 10, maxLoan: 5000, canLoan: true };
        case 'D': return { rate: 15, maxLoan: 2000, canLoan: true };
        case 'F': return { rate: 20, maxLoan: 0, canLoan: false };
        default: return { rate: 20, maxLoan: 0, canLoan: false };
    }
}

async function getOrCreateBankAccount(pool: any, userId: string, guildId: string, userName: string) {
    let account = await pool.query(
        `SELECT * FROM bank_accounts WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    );

    if (account.rows.length === 0) {
        await pool.query(
            `INSERT INTO bank_accounts (user_id, guild_id, user_name, balance) VALUES ($1, $2, $3, 0)`,
            [userId, guildId, userName]
        );
        account = await pool.query(
            `SELECT * FROM bank_accounts WHERE user_id = $1 AND guild_id = $2`,
            [userId, guildId]
        );
    } else if (account.rows[0].user_name !== userName) {
        await pool.query(
            `UPDATE bank_accounts SET user_name = $1 WHERE user_id = $2 AND guild_id = $3`,
            [userName, userId, guildId]
        );
        account = await pool.query(
            `SELECT * FROM bank_accounts WHERE user_id = $1 AND guild_id = $2`,
            [userId, guildId]
        );
    }

    return account.rows[0];
}

async function getOrCreateSocialCredit(pool: any, userId: string, guildId: string, userName: string) {
    let credit = await pool.query(
        `SELECT * FROM social_credits WHERE user_id = $1 AND guild_id = $2`,
        [userId, guildId]
    );

    if (credit.rows.length === 0) {
        await pool.query(
            `INSERT INTO social_credits (user_id, guild_id, user_name, credit_score, total_given, total_received) VALUES ($1, $2, $3, 500, 0, 0)`,
            [userId, guildId, userName]
        );
        credit = await pool.query(
            `SELECT * FROM social_credits WHERE user_id = $1 AND guild_id = $2`,
            [userId, guildId]
        );
    } else if (credit.rows[0].user_name !== userName) {
        await pool.query(
            `UPDATE social_credits SET user_name = $1 WHERE user_id = $2 AND guild_id = $3`,
            [userName, userId, guildId]
        );
        credit = await pool.query(
            `SELECT * FROM social_credits WHERE user_id = $1 AND guild_id = $2`,
            [userId, guildId]
        );
    }

    return credit.rows[0];
}

async function logTransaction(pool: any, userId: string, guildId: string, type: string, amount: number, description: string) {
    await pool.query(
        `INSERT INTO bank_transactions (user_id, guild_id, type, amount, description) VALUES ($1, $2, $3, $4, $5)`,
        [userId, guildId, type, amount, description]
    );
}

export const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('social-credit')
            .setDescription('View your Social Credit Score')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('View another user\'s credit score')
                    .setRequired(false)
            ),
        async execute(interaction: any, api: any) {
            const pool = poolRef || interaction.client.pool;
            if (!pool) {
                return interaction.reply({ content: 'Database not connected', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guildId;
            const userName = targetUser.username;

            try {
                const credit = await getOrCreateSocialCredit(pool, userId, guildId, userName);
                const rankInfo = getCreditRank(credit.credit_score);

                const isSelf = targetUser.id === interaction.user.id;
                const embed = new EmbedBuilder()
                    .setTitle(`${rankInfo.emoji} Social Credit Score`)
                    .setColor(rankInfo.color)
                    .setDescription(isSelf 
                        ? `Your social credit statistics` 
                        : `${targetUser.username}'s social credit statistics`)
                    .addFields(
                        { name: 'Credit Score', value: `**${credit.credit_score}**`, inline: true },
                        { name: 'Rank', value: `**${rankInfo.rank}** - ${rankInfo.title}`, inline: true },
                        { name: 'Total Given', value: `💚 ${credit.total_given.toLocaleString()}`, inline: true },
                        { name: 'Total Received', value: `💙 ${credit.total_received.toLocaleString()}`, inline: true }
                    )
                    .setTimestamp();

                if (!isSelf) {
                    embed.setFooter({ text: `Requested by ${interaction.user.username}` });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (e: any) {
                console.error('[BANK] Error fetching social credit:', e);
                await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('bank')
            .setDescription('Banking System - Manage your money')
            .addSubcommand(sub =>
                sub.setName('deposit')
                    .setDescription('Deposit coins into your bank account')
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('Amount to deposit')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('withdraw')
                    .setDescription('Withdraw coins from your bank account')
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('Amount to withdraw')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('transfer')
                    .setDescription('Transfer coins to another user')
                    .addUserOption(opt =>
                        opt.setName('user')
                            .setDescription('User to transfer to')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('Amount to transfer')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('balance')
                    .setDescription('Check your bank account balance')
            )
            .addSubcommand(sub =>
                sub.setName('loan')
                    .setDescription('Apply for a loan based on your credit score')
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('Loan amount requested')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('pay-debt')
                    .setDescription('Pay off part or all of your loan')
                    .addIntegerOption(opt =>
                        opt.setName('amount')
                            .setDescription('Amount to pay')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('score')
                    .setDescription('View detailed credit score and loan eligibility')
            ),
        async execute(interaction: any, api: any) {
            const pool = poolRef || interaction.client.pool;
            if (!pool) {
                return interaction.reply({ content: 'Database not connected', ephemeral: true });
            }

            const subcommand = interaction.options.getSubcommand();
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const userName = interaction.user.username;

            try {
                switch (subcommand) {
                    case 'deposit': {
                        const amount = interaction.options.getInteger('amount');
                        const currentBalance = await api.getBalance(userId);

                        if (currentBalance < amount) {
                            return interaction.reply({ 
                                content: `❌ Insufficient funds! You have ${currentBalance.toLocaleString()} coins but need ${amount.toLocaleString()}.`,
                                ephemeral: true 
                            });
                        }

                        await api.addCoins(userId, -amount);
                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);
                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
                            [amount, account.id]
                        );

                        await logTransaction(pool, userId, guildId, 'deposit', amount, `Deposited ${amount} coins`);

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Deposit Successful!')
                            .setColor('#00FF00')
                            .addFields(
                                { name: 'Deposited', value: `💰 ${amount.toLocaleString()} coins`, inline: true },
                                { name: 'New Bank Balance', value: `🏦 ${(account.balance + amount).toLocaleString()} coins`, inline: true },
                                { name: 'Wallet Balance', value: `💵 ${(currentBalance - amount).toLocaleString()} coins`, inline: true }
                            )
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        api.log(`[BANK] ${userName} deposited ${amount} coins`);
                        break;
                    }

                    case 'withdraw': {
                        const amount = interaction.options.getInteger('amount');
                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);

                        if (account.balance < amount) {
                            return interaction.reply({ 
                                content: `❌ Insufficient bank balance! Your account has ${account.balance.toLocaleString()} coins.`,
                                ephemeral: true 
                            });
                        }

                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2`,
                            [amount, account.id]
                        );
                        await api.addCoins(userId, amount);

                        await logTransaction(pool, userId, guildId, 'withdraw', amount, `Withdrew ${amount} coins`);

                        const currentBalance = await api.getBalance(userId);

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Withdrawal Successful!')
                            .setColor('#00FF00')
                            .addFields(
                                { name: 'Withdrew', value: `💰 ${amount.toLocaleString()} coins`, inline: true },
                                { name: 'New Bank Balance', value: `🏦 ${(account.balance - amount).toLocaleString()} coins`, inline: true },
                                { name: 'Wallet Balance', value: `💵 ${currentBalance.toLocaleString()} coins`, inline: true }
                            )
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        api.log(`[BANK] ${userName} withdrew ${amount} coins`);
                        break;
                    }

                    case 'transfer': {
                        const targetUser = interaction.options.getUser('user');
                        const amount = interaction.options.getInteger('amount');

                        if (targetUser.id === userId) {
                            return interaction.reply({ content: '❌ You cannot transfer to yourself!', ephemeral: true });
                        }

                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);

                        if (account.balance < amount) {
                            return interaction.reply({ 
                                content: `❌ Insufficient bank balance! Your account has ${account.balance.toLocaleString()} coins.`,
                                ephemeral: true 
                            });
                        }

                        const targetAccount = await getOrCreateBankAccount(pool, targetUser.id, guildId, targetUser.username);

                        await pool.query('BEGIN');

                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2`,
                            [amount, account.id]
                        );
                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
                            [amount, targetAccount.id]
                        );

                        await logTransaction(pool, userId, guildId, 'transfer_out', amount, `Transferred ${amount} coins to ${targetUser.username}`);
                        await logTransaction(pool, targetUser.id, guildId, 'transfer_in', amount, `Received ${amount} coins from ${userName}`);

                        await pool.query('COMMIT');

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Transfer Successful!')
                            .setColor('#00FF00')
                            .addFields(
                                { name: 'Sent', value: `💰 ${amount.toLocaleString()} coins`, inline: true },
                                { name: 'To', value: `👤 ${targetUser.username}`, inline: true },
                                { name: 'New Balance', value: `🏦 ${(account.balance - amount).toLocaleString()} coins`, inline: false }
                            )
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        api.log(`[BANK] ${userName} transferred ${amount} coins to ${targetUser.username}`);
                        break;
                    }

                    case 'balance': {
                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);
                        const credit = await getOrCreateSocialCredit(pool, userId, guildId, userName);
                        const rankInfo = getCreditRank(credit.credit_score);
                        const walletBalance = await api.getBalance(userId);

                        const loanInfo = await pool.query(
                            `SELECT * FROM bank_loans WHERE user_id = $1 AND guild_id = $2 AND status = 'active'`,
                            [userId, guildId]
                        );

                        const embed = new EmbedBuilder()
                            .setTitle('🏦 Bank Account Balance')
                            .setColor('#0099FF')
                            .addFields(
                                { name: 'Bank Balance', value: `💰 **${account.balance.toLocaleString()}** coins`, inline: true },
                                { name: 'Wallet Balance', value: `💵 **${walletBalance.toLocaleString()}** coins`, inline: true },
                                { name: 'Total Net Worth', value: `💎 **${(account.balance + walletBalance).toLocaleString()}** coins`, inline: true },
                                { name: 'Credit Score', value: `${rankInfo.emoji} **${credit.credit_score}** (${rankInfo.rank})`, inline: true }
                            )
                            .setTimestamp();

                        if (loanInfo.rows.length > 0) {
                            const loan = loanInfo.rows[0];
                            const totalOwed = loan.principal * (1 + loan.interest_rate / 100);
                            embed.addFields(
                                { name: '💳 Active Loan', value: `Principal: ${loan.principal.toLocaleString()} | Interest: ${loan.interest_rate}%`, inline: false },
                                { name: 'Total Owed', value: `⚠️ **${Math.floor(totalOwed).toLocaleString()}** coins`, inline: false }
                            );
                        }

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        break;
                    }

                    case 'loan': {
                        const requestedAmount = interaction.options.getInteger('amount');
                        const credit = await getOrCreateSocialCredit(pool, userId, guildId, userName);
                        const rankInfo = getCreditRank(credit.credit_score);
                        const loanTerms = getInterestRate(rankInfo.rank);

                        const existingLoan = await pool.query(
                            `SELECT * FROM bank_loans WHERE user_id = $1 AND guild_id = $2 AND status = 'active'`,
                            [userId, guildId]
                        );

                        if (existingLoan.rows.length > 0) {
                            const loan = existingLoan.rows[0];
                            const totalOwed = loan.principal * (1 + loan.interest_rate / 100);
                            return interaction.reply({ 
                                content: `❌ You already have an active loan!\n` +
                                        `Principal: ${loan.principal.toLocaleString()} coins\n` +
                                        `Interest Rate: ${loan.interest_rate}%\n` +
                                        `Total Owed: ${Math.floor(totalOwed).toLocaleString()} coins\n` +
                                        `Use /bank pay-debt to pay off your loan first.`,
                                ephemeral: true 
                            });
                        }

                        if (!loanTerms.canLoan) {
                            return interaction.reply({ 
                                content: `❌ Your credit score is too low for a loan!\n` +
                                        `Current Score: ${credit.credit_score}\n` +
                                        `Rank: ${rankInfo.rank} - ${rankInfo.title}\n` +
                                        `Improve your credit score by receiving credits and paying off any debts.`,
                                ephemeral: true 
                            });
                        }

                        if (requestedAmount > loanTerms.maxLoan) {
                            return interaction.reply({ 
                                content: `❌ Maximum loan amount for your credit rank is ${loanTerms.maxLoan.toLocaleString()} coins.\n` +
                                        `Your Rank: ${rankInfo.rank} (Score: ${credit.credit_score})\n` +
                                        `Interest Rate: ${loanTerms.rate}%`,
                                ephemeral: true 
                            });
                        }

                        if (requestedAmount < 100) {
                            return interaction.reply({ 
                                content: `Minimum loan amount is 100 coins.`,
                                ephemeral: true 
                            });
                        }

                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);

                        await pool.query(
                            `INSERT INTO bank_loans (user_id, guild_id, principal, interest_rate, status) VALUES ($1, $2, $3, $4, 'active')`,
                            [userId, guildId, requestedAmount, loanTerms.rate]
                        );

                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
                            [requestedAmount, account.id]
                        );

                        await logTransaction(pool, userId, guildId, 'loan', requestedAmount, `Loan taken: ${loanTerms.rate}% interest`);

                        const totalRepayment = requestedAmount * (1 + loanTerms.rate / 100);

                        const embed = new EmbedBuilder()
                            .setTitle('✅ Loan Approved!')
                            .setColor('#00FF00')
                            .setDescription(`Your loan has been processed!`)
                            .addFields(
                                { name: 'Loan Amount', value: `💰 ${requestedAmount.toLocaleString()} coins`, inline: true },
                                { name: 'Interest Rate', value: `📊 ${loanTerms.rate}%`, inline: true },
                                { name: 'Credit Score', value: `${rankInfo.emoji} ${rankInfo.rank} (${credit.credit_score})`, inline: true },
                                { name: 'Total Repayment', value: `⚠️ **${Math.floor(totalRepayment).toLocaleString()}** coins`, inline: true }
                            )
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        api.log(`[BANK] ${userName} took a loan of ${requestedAmount} coins at ${loanTerms.rate}% interest`);
                        break;
                    }

                    case 'pay-debt': {
                        const amount = interaction.options.getInteger('amount');
                        const credit = await getOrCreateSocialCredit(pool, userId, guildId, userName);
                        const account = await getOrCreateBankAccount(pool, userId, guildId, userName);

                        const loanInfo = await pool.query(
                            `SELECT * FROM bank_loans WHERE user_id = $1 AND guild_id = $2 AND status = 'active'`,
                            [userId, guildId]
                        );

                        if (loanInfo.rows.length === 0) {
                            return interaction.reply({ content: '❌ You have no active loan to pay off.', ephemeral: true });
                        }

                        const loan = loanInfo.rows[0];
                        const totalOwed = loan.principal * (1 + loan.interest_rate / 100);
                        const remainingOwed = totalOwed - (loan.paid_amount || 0);

                        if (account.balance < amount) {
                            return interaction.reply({ 
                                content: `❌ Insufficient bank balance! Your account has ${account.balance.toLocaleString()} coins.`,
                                ephemeral: true 
                            });
                        }

                        const newPaidAmount = (loan.paid_amount || 0) + amount;
                        const wasPaidOff = newPaidAmount >= remainingOwed;

                        await pool.query(
                            `UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2`,
                            [amount, account.id]
                        );

                        if (wasPaidOff) {
                            await pool.query(
                                `UPDATE bank_loans SET status = 'paid_off', paid_amount = $1 WHERE id = $2`,
                                [remainingOwed, loan.id]
                            );

                            const creditGain = Math.floor(amount / 100);
                            const newCreditScore = Math.min(850, credit.credit_score + creditGain);

                            await pool.query(
                                `UPDATE social_credits SET credit_score = $1, total_received = total_received + $2 WHERE user_id = $3 AND guild_id = $4`,
                                [newCreditScore, creditGain, userId, guildId]
                            );

                            await logTransaction(pool, userId, guildId, 'loan_paid', amount, `Loan fully paid off!`);

                            const embed = new EmbedBuilder()
                                .setTitle('🎉 Loan Fully Paid Off!')
                                .setColor('#FFD700')
                                .setDescription(`Congratulations! You've paid off your loan!`)
                                .addFields(
                                    { name: 'Amount Paid', value: `💰 ${amount.toLocaleString()} coins`, inline: true },
                                    { name: 'Credit Score Gained', value: `+${creditGain} points!`, inline: true },
                                    { name: 'New Credit Score', value: `⭐ **${newCreditScore}**`, inline: true }
                                )
                                .setTimestamp();

                            await interaction.reply({ embeds: [embed], ephemeral: true });
                            api.log(`[BANK] ${userName} paid off loan! Credit score increased by ${creditGain}`);
                        } else {
                            await pool.query(
                                `UPDATE bank_loans SET paid_amount = $1 WHERE id = $2`,
                                [newPaidAmount, loan.id]
                            );

                            const partialCreditGain = Math.floor(amount / 200);
                            const newCreditScore = Math.min(850, credit.credit_score + partialCreditGain);

                            await pool.query(
                                `UPDATE social_credits SET credit_score = $1 WHERE user_id = $2 AND guild_id = $3`,
                                [newCreditScore, userId, guildId]
                            );

                            await logTransaction(pool, userId, guildId, 'payment', amount, `Loan payment: ${amount} coins`);

                            const remaining = remainingOwed - amount;
                            const embed = new EmbedBuilder()
                                .setTitle('✅ Payment Successful!')
                                .setColor('#00FF00')
                                .addFields(
                                    { name: 'Amount Paid', value: `💰 ${amount.toLocaleString()} coins`, inline: true },
                                    { name: 'Remaining Owed', value: `⚠️ ${Math.floor(remaining).toLocaleString()} coins`, inline: true },
                                    { name: 'Credit Score Gained', value: `+${partialCreditGain} points`, inline: true },
                                    { name: 'Progress', value: `${Math.floor((newPaidAmount / remainingOwed) * 100)}% paid off`, inline: false }
                                )
                                .setTimestamp();

                            await interaction.reply({ embeds: [embed], ephemeral: true });
                            api.log(`[BANK] ${userName} made loan payment of ${amount} coins`);
                        }
                        break;
                    }

                    case 'score': {
                        const credit = await getOrCreateSocialCredit(pool, userId, guildId, userName);
                        const rankInfo = getCreditRank(credit.credit_score);
                        const loanTerms = getInterestRate(rankInfo.rank);

                        const loanInfo = await pool.query(
                            `SELECT * FROM bank_loans WHERE user_id = $1 AND guild_id = $2 AND status = 'active'`,
                            [userId, guildId]
                        );

                        const embed = new EmbedBuilder()
                            .setTitle(`${rankInfo.emoji} Credit Score Details`)
                            .setColor(rankInfo.color)
                            .addFields(
                                { name: 'Current Score', value: `⭐ **${credit.credit_score}**`, inline: true },
                                { name: 'Rank', value: `**${rankInfo.rank}** - ${rankInfo.title}`, inline: true },
                                { name: 'Total Given', value: `💚 ${credit.total_given.toLocaleString()}`, inline: true },
                                { name: 'Total Received', value: `💙 ${credit.total_received.toLocaleString()}`, inline: true }
                            )
                            .addFields(
                                { name: 'Loan Interest Rate', value: loanTerms.canLoan ? `📊 ${loanTerms.rate}%` : '❌ Denied', inline: true },
                                { name: 'Max Loan Amount', value: loanTerms.canLoan ? `💰 ${loanTerms.maxLoan.toLocaleString()}` : '❌ N/A', inline: true }
                            );

                        if (loanInfo.rows.length > 0) {
                            const loan = loanInfo.rows[0];
                            const totalOwed = loan.principal * (1 + loan.interest_rate / 100);
                            const remaining = totalOwed - (loan.paid_amount || 0);
                            embed.addFields(
                                { name: '📋 Active Loan', value: `Principal: ${loan.principal.toLocaleString()} | Interest: ${loan.interest_rate}%`, inline: false },
                                { name: 'Remaining', value: `⚠️ ${Math.floor(remaining).toLocaleString()} coins`, inline: true },
                                { name: 'Progress', value: `${Math.floor(((loan.paid_amount || 0) / totalOwed) * 100)}% paid`, inline: true }
                            );
                        }

                        const nextRank = credit.credit_score >= 850 ? null : 
                            credit.credit_score >= 800 ? { score: 850, rank: 'S+' } :
                            credit.credit_score >= 750 ? { score: 800, rank: 'S' } :
                            credit.credit_score >= 700 ? { score: 750, rank: 'S-' } :
                            credit.credit_score >= 650 ? { score: 700, rank: 'A+' } :
                            credit.credit_score >= 550 ? { score: 650, rank: 'A' } :
                            credit.credit_score >= 450 ? { score: 550, rank: 'B' } :
                            credit.credit_score >= 350 ? { score: 450, rank: 'C' } :
                            { score: 350, rank: 'D' };

                        if (nextRank) {
                            const pointsNeeded = nextRank.score - credit.credit_score;
                            embed.addFields(
                                { name: '📈 Next Rank', value: `**${nextRank.rank}** - ${pointsNeeded} points needed`, inline: false }
                            );
                        }

                        embed.setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                        break;
                    }
                }
            } catch (e: any) {
                console.error('[BANK] Error executing bank command:', e);
                await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
            }
        }
    }
];

export const init = async (api: any) => {
    poolRef = api.client?.pool || api.pool;

    if (poolRef) {
        try {
            await poolRef.query(`
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    guild_id VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255),
                    balance DECIMAL(20, 2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, guild_id)
                )
            `);

            await poolRef.query(`
                CREATE TABLE IF NOT EXISTS social_credits (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    guild_id VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255),
                    credit_score INTEGER DEFAULT 500,
                    total_given INTEGER DEFAULT 0,
                    total_received INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, guild_id)
                )
            `);

            await poolRef.query(`
                CREATE TABLE IF NOT EXISTS bank_loans (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    guild_id VARCHAR(255) NOT NULL,
                    principal DECIMAL(20, 2) NOT NULL,
                    interest_rate DECIMAL(5, 2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'active',
                    paid_amount DECIMAL(20, 2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, guild_id, status)
                )
            `);

            await poolRef.query(`
                CREATE TABLE IF NOT EXISTS bank_transactions (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    guild_id VARCHAR(255) NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    amount DECIMAL(20, 2) NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            console.log('[BANK] Database tables initialized');
        } catch (e: any) {
            console.error('[BANK] Error initializing database tables:', e);
        }
    }

    api.log('Bank Module Loaded. Social Credit + Banking System');
};