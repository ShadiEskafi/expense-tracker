import { db } from '../db/db.js';
import { getAccounts, getAccountById, calculateAccountBalance } from './account.js';
import { getTransactions } from './transaction.js';
import { createTransfer } from './transfer.js';

/**
 * Custom error thrown when credit card payment validation fails
 */
export class CreditCardPaymentValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'CreditCardPaymentValidationError';
    this.code = 'CREDIT_CARD_PAYMENT_VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Custom error thrown when financial metrics computation encounters an invalid parameter
 */
export class FinancialMetricsError extends Error {
  constructor(message, code = 'FINANCIAL_METRICS_ERROR') {
    super(message);
    this.name = 'FinancialMetricsError';
    this.code = code;
  }
}

/**
 * Returns the start and end dates (YYYY-MM-DD) for a given calendar month ('YYYY-MM').
 *
 * @param {string} yearMonth Format: 'YYYY-MM'
 * @returns {{ startDate: string, endDate: string }}
 */
export function getMonthDateRange(yearMonth) {
  if (!yearMonth || typeof yearMonth !== 'string' || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new FinancialMetricsError('صيغة الشهر غير صالحة، يجب أن تكون YYYY-MM');
  }
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    throw new FinancialMetricsError('رقم الشهر غير صالح ويجب أن يكون بين 01 و 12');
  }

  const startDate = `${yearMonth}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = String(daysInMonth).padStart(2, '0');
  const endDate = `${yearMonth}-${lastDayStr}`;

  return { startDate, endDate };
}

/**
 * Returns the previous month in 'YYYY-MM' format.
 * Correctly wraps January (01) to December (12) of the preceding year.
 *
 * @param {string} yearMonth Format: 'YYYY-MM'
 * @returns {string} Previous month 'YYYY-MM'
 */
export function getPreviousMonth(yearMonth) {
  if (!yearMonth || typeof yearMonth !== 'string' || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new FinancialMetricsError('صيغة الشهر غير صالحة، يجب أن تكون YYYY-MM');
  }
  const [yearStr, monthStr] = yearMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calculates percentage change between two values.
 * Handles zero baselines safely without dividing by zero.
 *
 * @param {number} current
 * @param {number} previous
 * @returns {number} Rounded to 2 decimal places
 */
export function calculatePercentageChange(current, previous) {
  if (typeof current !== 'number' || typeof previous !== 'number') {
    return 0;
  }
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  const delta = current - previous;
  const pct = (delta / Math.abs(previous)) * 100;
  return Math.round(pct * 100) / 100;
}

/**
 * Computes top-level financial position metrics strictly distinguishing between:
 * 1. Available Funds (Liquid Assets): Positive balances in Cash, Bank, Digital Wallets, and Custom accounts.
 * 2. Total Liabilities: Outstanding Credit Card debts + negative balances (overdrafts) on liquid accounts.
 * 3. Net Financial Position: Available Funds - Total Liabilities.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object|string} [options={}] Options object or userId string (for backwards compatibility)
 * @param {string} [options.userId] Filter by user ID
 * @param {boolean} [options.includeArchived=false] Include archived accounts
 * @param {boolean} [options.reconcile=false] Recalculate balances strictly from ledger
 * @returns {Promise<{
 *   availableFunds: number,
 *   totalLiabilities: number,
 *   creditCardDebt: number,
 *   overdraftLiabilities: number,
 *   netPosition: number,
 *   accountsCount: number,
 *   assetAccountsCount: number,
 *   liabilityAccountsCount: number,
 *   breakdownByType: Record<string, number>,
 *   breakdownByAccount: Array<{
 *     id: string,
 *     name: string,
 *     type: string,
 *     balance: number,
 *     isLiability: boolean,
 *     liabilityAmount: number,
 *     availableAmount: number,
 *     currency: string,
 *     icon?: string,
 *     color?: string
 *   }>
 * }>}
 */
export async function getFinancialPositionMetrics(database = db, options = {}) {
  // Support passing userId directly as second argument for backwards compatibility
  const normalizedOptions =
    typeof options === 'string'
      ? { userId: options, includeArchived: false, reconcile: false }
      : { includeArchived: false, reconcile: false, ...options };

  const { userId, includeArchived, reconcile } = normalizedOptions;

  const accounts = await getAccounts(database, {
    userId,
    includeArchived: !!includeArchived,
    includeDeleted: false
  });

  let availableFunds = 0;
  let creditCardDebt = 0;
  let overdraftLiabilities = 0;
  let assetAccountsCount = 0;
  let liabilityAccountsCount = 0;

  const breakdownByType = {
    cash: 0,
    bank: 0,
    credit_card: 0,
    digital_wallet: 0,
    custom: 0
  };

  const breakdownByAccount = [];

  for (const account of accounts) {
    let balance;
    if (reconcile) {
      const ledgerResult = await calculateAccountBalance(account.id, database);
      balance = ledgerResult.calculatedBalance;
    } else {
      balance = typeof account.current_balance === 'number' ? account.current_balance : 0;
    }

    breakdownByType[account.type] = (breakdownByType[account.type] || 0) + balance;

    let isLiability = false;
    let liabilityAmount = 0;
    let availableAmount = 0;

    if (account.type === 'credit_card') {
      // Credit card balances represent liabilities when negative
      if (balance < 0) {
        liabilityAmount = Math.abs(balance);
        creditCardDebt += liabilityAmount;
        isLiability = true;
        liabilityAccountsCount++;
      }
    } else {
      // Liquid asset accounts: cash, bank, digital_wallet, custom
      if (balance > 0) {
        availableAmount = balance;
        availableFunds += balance;
        assetAccountsCount++;
      } else if (balance < 0) {
        // Overdraft liability on liquid accounts
        liabilityAmount = Math.abs(balance);
        overdraftLiabilities += liabilityAmount;
        isLiability = true;
        liabilityAccountsCount++;
      }
    }

    breakdownByAccount.push({
      id: account.id,
      name: account.name,
      type: account.type,
      balance,
      isLiability,
      liabilityAmount,
      availableAmount,
      currency: account.currency || 'SAR',
      icon: account.icon,
      color: account.color
    });
  }

  const totalLiabilities = creditCardDebt + overdraftLiabilities;
  const netPosition = availableFunds - totalLiabilities;

  return {
    availableFunds,
    totalLiabilities,
    creditCardDebt,
    overdraftLiabilities,
    netPosition,
    accountsCount: accounts.length,
    assetAccountsCount,
    liabilityAccountsCount,
    breakdownByType,
    breakdownByAccount
  };
}

/**
 * Computes period cash flow metrics according to Section 5 of docs/financial-rules.md:
 * - Total Income: Sum of all non-deleted income transactions in the period
 * - Total Expenses: Sum of all non-deleted expense transactions (including credit card purchases)
 * - Net Cash Flow: Total Income - Total Expenses
 * - Transfer Non-Distortion Invariant: Transfers are strictly excluded from income, expenses, and cash flow.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {string} [options.startDate] Range start date (YYYY-MM-DD)
 * @param {string} [options.endDate] Range end date (YYYY-MM-DD)
 * @param {string} [options.targetMonth] Shorthand month 'YYYY-MM' (overrides startDate/endDate)
 * @param {string} [options.userId] Filter by user ID
 * @returns {Promise<{
 *   startDate: string,
 *   endDate: string,
 *   totalIncome: number,
 *   totalExpense: number,
 *   netCashFlow: number,
 *   savingsRate: number,
 *   expenseRatio: number,
 *   incomeCount: number,
 *   expenseCount: number,
 *   transferCount: number,
 *   totalTransferred: number,
 *   creditCardPaymentsCount: number,
 *   totalCreditCardPayments: number,
 *   totalTransactionsCount: number,
 *   categoryBreakdown: Record<string, number>,
 *   categoriesSummary: Array<{ categoryId: string, amount: number, percentage: number }>
 * }>}
 */
export async function calculatePeriodCashFlow(database = db, options = {}) {
  let { startDate, endDate, targetMonth, userId } = options;

  if (targetMonth) {
    const range = getMonthDateRange(targetMonth);
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (!startDate && !endDate) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const range = getMonthDateRange(currentMonth);
    startDate = range.startDate;
    endDate = range.endDate;
  }

  // Retrieve all non-deleted transactions in date range
  const transactions = await getTransactions(database, {
    startDate,
    endDate,
    userId,
    includeDeleted: false,
    limit: undefined,
    offset: 0
  });

  // Fetch accounts to detect credit card settlement transfers
  const allAccounts = await getAccounts(database, {
    userId,
    includeArchived: true,
    includeDeleted: true
  });
  const accountMap = new Map(allAccounts.map((acc) => [acc.id, acc]));

  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let transferCount = 0;
  let totalTransferred = 0;
  let creditCardPaymentsCount = 0;
  let totalCreditCardPayments = 0;
  const categoryBreakdown = {};

  for (const tx of transactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeCount++;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      expenseCount++;
      if (tx.category_id) {
        categoryBreakdown[tx.category_id] = (categoryBreakdown[tx.category_id] || 0) + tx.amount;
      }
    } else if (tx.type === 'transfer') {
      // Invariant: Transfers do NOT affect income, expense, or net cash flow
      transferCount++;
      totalTransferred += tx.amount;

      // Check if destination is a credit card (settlement transfer)
      const destAccount = tx.destination_account_id ? accountMap.get(tx.destination_account_id) : null;
      if (destAccount && destAccount.type === 'credit_card') {
        creditCardPaymentsCount++;
        totalCreditCardPayments += tx.amount;
      }
    }
  }

  const netCashFlow = totalIncome - totalExpense;

  // Savings rate = (Net Cash Flow / Total Income) * 100
  let savingsRate = 0;
  let expenseRatio = 0;
  if (totalIncome > 0) {
    savingsRate = Math.round(((totalIncome - totalExpense) / totalIncome) * 10000) / 100;
    expenseRatio = Math.round((totalExpense / totalIncome) * 10000) / 100;
  }

  // Sorted list of category breakdowns
  const categoriesSummary = Object.entries(categoryBreakdown)
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 10000) / 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    startDate,
    endDate,
    totalIncome,
    totalExpense,
    netCashFlow,
    savingsRate,
    expenseRatio,
    incomeCount,
    expenseCount,
    transferCount,
    totalTransferred,
    creditCardPaymentsCount,
    totalCreditCardPayments,
    totalTransactionsCount: transactions.length,
    categoryBreakdown,
    categoriesSummary
  };
}

/**
 * Calculates Month-over-Month (MoM) comparative metrics between the target month
 * and the immediately preceding calendar month.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {string} [options.targetMonth] Format 'YYYY-MM' (defaults to current calendar month)
 * @param {string} [options.userId] Filter by user ID
 * @returns {Promise<{
 *   currentMonth: { month: string, totalIncome: number, totalExpense: number, netCashFlow: number, savingsRate: number },
 *   previousMonth: { month: string, totalIncome: number, totalExpense: number, netCashFlow: number, savingsRate: number },
 *   expenseDelta: number,
 *   expenseDeltaPercentage: number,
 *   incomeDelta: number,
 *   incomeDeltaPercentage: number,
 *   netCashFlowDelta: number,
 *   spendingTrend: 'increased' | 'decreased' | 'unchanged',
 *   incomeTrend: 'increased' | 'decreased' | 'unchanged',
 *   netCashFlowTrend: 'improved' | 'worsened' | 'unchanged'
 * }>}
 */
export async function getMonthOverMonthMetrics(database = db, options = {}) {
  const currentMonth = options.targetMonth || new Date().toISOString().slice(0, 7);
  const previousMonth = getPreviousMonth(currentMonth);

  const currentCashFlow = await calculatePeriodCashFlow(database, {
    targetMonth: currentMonth,
    userId: options.userId
  });

  const previousCashFlow = await calculatePeriodCashFlow(database, {
    targetMonth: previousMonth,
    userId: options.userId
  });

  const expenseDelta = currentCashFlow.totalExpense - previousCashFlow.totalExpense;
  const expenseDeltaPercentage = calculatePercentageChange(
    currentCashFlow.totalExpense,
    previousCashFlow.totalExpense
  );

  const incomeDelta = currentCashFlow.totalIncome - previousCashFlow.totalIncome;
  const incomeDeltaPercentage = calculatePercentageChange(
    currentCashFlow.totalIncome,
    previousCashFlow.totalIncome
  );

  const netCashFlowDelta = currentCashFlow.netCashFlow - previousCashFlow.netCashFlow;

  const spendingTrend = expenseDelta > 0 ? 'increased' : expenseDelta < 0 ? 'decreased' : 'unchanged';
  const incomeTrend = incomeDelta > 0 ? 'increased' : incomeDelta < 0 ? 'decreased' : 'unchanged';
  const netCashFlowTrend = netCashFlowDelta > 0 ? 'improved' : netCashFlowDelta < 0 ? 'worsened' : 'unchanged';

  return {
    currentMonth: {
      month: currentMonth,
      totalIncome: currentCashFlow.totalIncome,
      totalExpense: currentCashFlow.totalExpense,
      netCashFlow: currentCashFlow.netCashFlow,
      savingsRate: currentCashFlow.savingsRate
    },
    previousMonth: {
      month: previousMonth,
      totalIncome: previousCashFlow.totalIncome,
      totalExpense: previousCashFlow.totalExpense,
      netCashFlow: previousCashFlow.netCashFlow,
      savingsRate: previousCashFlow.savingsRate
    },
    expenseDelta,
    expenseDeltaPercentage,
    incomeDelta,
    incomeDeltaPercentage,
    netCashFlowDelta,
    spendingTrend,
    incomeTrend,
    netCashFlowTrend
  };
}

/**
 * Retrieves comprehensive metrics for all Credit Card accounts, including individual
 * debt liabilities, period purchases, and period settlement payments.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {string} [options.userId] Filter by user ID
 * @param {string} [options.startDate] Period start date
 * @param {string} [options.endDate] Period end date
 * @param {string} [options.targetMonth] Target month shorthand
 * @returns {Promise<{
 *   totalCreditCardDebt: number,
 *   cardCount: number,
 *   cardsInDebtCount: number,
 *   totalPeriodCardExpenses: number,
 *   totalPeriodCardPayments: number,
 *   cards: Array<{
 *     id: string,
 *     name: string,
 *     currency: string,
 *     current_balance: number,
 *     outstandingDebt: number,
 *     creditSurplus: number,
 *     isDebtFree: boolean,
 *     periodExpenses: number,
 *     periodPayments: number,
 *     netDebtChange: number,
 *     icon?: string,
 *     color?: string
 *   }>
 * }>}
 */
export async function getCreditCardLiabilitySummary(database = db, options = {}) {
  let { startDate, endDate, targetMonth, userId } = options;

  if (targetMonth) {
    const range = getMonthDateRange(targetMonth);
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (!startDate && !endDate) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const range = getMonthDateRange(currentMonth);
    startDate = range.startDate;
    endDate = range.endDate;
  }

  const creditCards = await getAccounts(database, {
    userId,
    type: 'credit_card',
    includeArchived: false,
    includeDeleted: false
  });

  // Get all active period transactions
  const transactions = await getTransactions(database, {
    startDate,
    endDate,
    userId,
    includeDeleted: false,
    limit: undefined,
    offset: 0
  });

  let totalCreditCardDebt = 0;
  let cardsInDebtCount = 0;
  let totalPeriodCardExpenses = 0;
  let totalPeriodCardPayments = 0;

  const cardSummaries = [];

  for (const card of creditCards) {
    const balance = typeof card.current_balance === 'number' ? card.current_balance : 0;
    const outstandingDebt = balance < 0 ? Math.abs(balance) : 0;
    const creditSurplus = balance > 0 ? balance : 0;
    const isDebtFree = outstandingDebt === 0;

    if (outstandingDebt > 0) {
      cardsInDebtCount++;
      totalCreditCardDebt += outstandingDebt;
    }

    // Filter transactions associated with this specific card
    let cardExpenses = 0;
    let cardPayments = 0;

    for (const tx of transactions) {
      if (tx.account_id === card.id && tx.type === 'expense') {
        cardExpenses += tx.amount;
      } else if (tx.destination_account_id === card.id && tx.type === 'transfer') {
        cardPayments += tx.amount;
      }
    }

    totalPeriodCardExpenses += cardExpenses;
    totalPeriodCardPayments += cardPayments;

    cardSummaries.push({
      id: card.id,
      name: card.name,
      currency: card.currency || 'SAR',
      current_balance: balance,
      outstandingDebt,
      creditSurplus,
      isDebtFree,
      periodExpenses: cardExpenses,
      periodPayments: cardPayments,
      netDebtChange: cardExpenses - cardPayments,
      icon: card.icon,
      color: card.color
    });
  }

  return {
    totalCreditCardDebt,
    cardCount: creditCards.length,
    cardsInDebtCount,
    totalPeriodCardExpenses,
    totalPeriodCardPayments,
    cards: cardSummaries
  };
}

/**
 * Executes a Credit Card Debt Settlement Payment as an Internal Transfer.
 *
 * Accounting Rules:
 * - Moves funds from an asset account (Bank/Cash/Wallet) to the credit card account.
 * - Reduces liquid assets and reduces credit card debt liability by the identical amount.
 * - Crucially, DOES NOT create an expense or distort period cash flow (since purchases were already recorded).
 * - Net financial position remains mathematically unchanged!
 *
 * @param {object} params
 * @param {string} params.sourceAccountId Source asset account UUID (must NOT be credit card)
 * @param {string} params.creditCardAccountId Destination credit card UUID (must BE credit card)
 * @param {number} params.amount Positive integer in minor units
 * @param {string} [params.date] Transaction date (YYYY-MM-DD), defaults to today
 * @param {string} [params.notes] Remarks, defaults to 'سداد بطاقة ائتمانية'
 * @param {Array<string>} [params.tags] Optional tags, defaults to ['سداد_ائتماني', 'credit_card_payment']
 * @param {string} [params.userId] Optional remote user UUID
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{
 *   transfer: object,
 *   sourceAccount: object,
 *   creditCardAccount: object,
 *   priorDebt: number,
 *   remainingDebt: number,
 *   debtSettled: boolean,
 *   netPositionImpact: 0
 * }>}
 */
export async function recordCreditCardPayment(params, database = db) {
  if (!params || typeof params !== 'object') {
    throw new CreditCardPaymentValidationError('بيانات سداد البطاقة غير صالحة');
  }

  const { sourceAccountId, creditCardAccountId, amount, date, notes, tags, userId } = params;

  // 1. Validate destination credit card account
  if (!creditCardAccountId) {
    throw new CreditCardPaymentValidationError('معرف حساب البطاقة الائتمانية مطلوب', 'creditCardAccountId');
  }
  const cardAccount = await getAccountById(creditCardAccountId, database);
  if (!cardAccount) {
    throw new CreditCardPaymentValidationError(
      `حساب البطاقة الائتمانية غير موجود: ${creditCardAccountId}`,
      'creditCardAccountId'
    );
  }
  if (cardAccount.type !== 'credit_card') {
    throw new CreditCardPaymentValidationError(
      `الحساب الوجهة ليس بطاقة ائتمانية (النوع: ${cardAccount.type})`,
      'creditCardAccountId'
    );
  }

  // 2. Validate source asset account
  if (!sourceAccountId) {
    throw new CreditCardPaymentValidationError('معرف حساب الدفع (المصدر) مطلوب', 'sourceAccountId');
  }
  if (sourceAccountId === creditCardAccountId) {
    throw new CreditCardPaymentValidationError('لا يمكن سداد البطاقة من نفس حساب البطاقة', 'sourceAccountId');
  }
  const sourceAccount = await getAccountById(sourceAccountId, database);
  if (!sourceAccount) {
    throw new CreditCardPaymentValidationError(
      `حساب الدفع المصدر غير موجود: ${sourceAccountId}`,
      'sourceAccountId'
    );
  }
  if (sourceAccount.type === 'credit_card') {
    throw new CreditCardPaymentValidationError(
      'لا يمكن سداد بطاقة ائتمانية باستخدام بطاقة ائتمانية أخرى مباشرة',
      'sourceAccountId'
    );
  }

  // 3. Currency match validation
  if (sourceAccount.currency !== cardAccount.currency) {
    throw new CreditCardPaymentValidationError(
      `لا يمكن السداد بين عملات مختلفة (${sourceAccount.currency} إلى ${cardAccount.currency})`,
      'currency'
    );
  }

  // 4. Amount validation
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new CreditCardPaymentValidationError(
      'مبلغ السداد يجب أن يكون رقماً صحيحاً موجباً بوحدات العملة الصغرى (Integer Minor Units > 0)',
      'amount'
    );
  }

  const priorBalance = typeof cardAccount.current_balance === 'number' ? cardAccount.current_balance : 0;
  const priorDebt = priorBalance < 0 ? Math.abs(priorBalance) : 0;

  // Execute transfer using Single-Record Model
  const transfer = await createTransfer(
    {
      amount,
      account_id: sourceAccountId,
      destination_account_id: creditCardAccountId,
      date: date || new Date().toISOString().slice(0, 10),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : 'سداد بطاقة ائتمانية',
      tags: tags && Array.isArray(tags) && tags.length > 0 ? tags : ['سداد_ائتماني', 'credit_card_payment'],
      user_id: userId
    },
    database
  );

  // Fetch updated accounts
  const updatedSource = await getAccountById(sourceAccountId, database);
  const updatedCard = await getAccountById(creditCardAccountId, database);

  const updatedBalance = typeof updatedCard.current_balance === 'number' ? updatedCard.current_balance : 0;
  const remainingDebt = updatedBalance < 0 ? Math.abs(updatedBalance) : 0;
  const debtSettled = remainingDebt === 0;

  return {
    transfer,
    sourceAccount: updatedSource,
    creditCardAccount: updatedCard,
    priorDebt,
    remainingDebt,
    debtSettled,
    netPositionImpact: 0 // Invariant: Net Financial Position is strictly invariant across transfers
  };
}

/**
 * Aggregates all KPI metrics needed for the financial dashboard into a single payload:
 * - Available liquid funds
 * - Total liabilities & credit card debt
 * - Net financial position
 * - Current period cash flow (income, expense, net, savings rate)
 * - Month-over-month comparisons
 * - Credit card summaries
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @returns {Promise<{
 *   financialPosition: object,
 *   cashFlow: object,
 *   monthOverMonth: object,
 *   creditCards: object,
 *   currency: string
 * }>}
 */
export async function getDashboardOverviewMetrics(database = db, options = {}) {
  const [financialPosition, cashFlow, monthOverMonth, creditCards] = await Promise.all([
    getFinancialPositionMetrics(database, options),
    calculatePeriodCashFlow(database, options),
    getMonthOverMonthMetrics(database, options),
    getCreditCardLiabilitySummary(database, options)
  ]);

  // Determine base currency from accounts
  const firstAccount = financialPosition.breakdownByAccount[0];
  const currency = firstAccount ? firstAccount.currency : 'SAR';

  return {
    financialPosition,
    cashFlow,
    monthOverMonth,
    creditCards,
    currency
  };
}
