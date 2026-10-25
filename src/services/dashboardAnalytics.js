import { db } from '../db/db.js';
import { getAccounts, calculateAccountBalance, seedDefaultAccounts, isAccountsSeeded } from './account.js';
import { getCategories, seedDefaultCategories, isCategoriesSeeded } from './category.js';
import { getTransactions } from './transaction.js';
import { getDashboardOverviewMetrics } from './financialMetrics.js';
import { DEFAULT_CURRENCY_CODE } from '../utils/currency.js';

/**
 * Returns the current month in 'YYYY-MM' format.
 *
 * @returns {string} Format: 'YYYY-MM'
 */
export function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Computes spending category breakdown for a given month.
 * Ranks categories by amount descending, preserving top 5 and grouping remainder into "أخرى" (Other).
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {string} [options.month] Calendar month 'YYYY-MM' (defaults to current month)
 * @param {string|null} [options.userId] User ID (null for guest mode)
 * @returns {Promise<{
 *   month: string,
 *   totalExpense: number,
 *   categoryCount: number,
 *   items: Array<{
 *     categoryId: string,
 *     categoryName: string,
 *     color: string,
 *     icon: string,
 *     slug: string,
 *     amount: number,
 *     percentage: number,
 *     transactionCount: number
 *   }>
 * }>}
 */
export async function getCategorySpendingBreakdown(database = db, options = {}) {
  const month = options.month || getCurrentYearMonth();
  const userId = options.userId !== undefined ? options.userId : null;

  // 1. Fetch active categories for metadata mapping
  const allCategories = await getCategories(database, {
    type: 'expense',
    includeDeleted: true, // We include deleted so historical category names still resolve
    userId
  });

  const categoryMap = new Map();
  for (const cat of allCategories) {
    categoryMap.set(cat.id, cat);
  }

  // 2. Fetch all expense transactions for the month
  const transactions = await getTransactions(database, {
    type: 'expense',
    includeDeleted: false,
    userId,
    limit: undefined,
    offset: 0
  });

  // Filter transactions belonging to target month
  const monthExpenses = transactions.filter((tx) => tx.date && tx.date.startsWith(month));

  let totalExpense = 0;
  const groups = new Map();

  for (const tx of monthExpenses) {
    totalExpense += tx.amount;
    const catId = tx.category_id || 'uncategorized';

    const current = groups.get(catId) || { amount: 0, count: 0 };
    current.amount += tx.amount;
    current.count += 1;
    groups.set(catId, current);
  }

  if (totalExpense === 0 || groups.size === 0) {
    return {
      month,
      totalExpense: 0,
      categoryCount: 0,
      items: []
    };
  }

  // 3. Transform groups into sorted list
  const categoryItems = [];
  for (const [catId, data] of groups.entries()) {
    const meta = categoryMap.get(catId);
    categoryItems.push({
      categoryId: catId,
      categoryName: meta ? meta.name : (catId === 'uncategorized' ? 'بدون تصنيف' : 'تصنيف غير معروف'),
      color: meta ? meta.color : '#94A3B8',
      icon: meta ? meta.icon : 'more-horizontal',
      slug: meta ? meta.slug : 'cat_other',
      amount: data.amount,
      percentage: totalExpense > 0 ? Math.round((data.amount / totalExpense) * 1000) / 10 : 0,
      transactionCount: data.count
    });
  }

  // Sort descending by expense amount
  categoryItems.sort((a, b) => b.amount - a.amount);

  // 4. If more than 5 categories, keep top 5 and aggregate remaining into "أخرى"
  if (categoryItems.length <= 5) {
    return {
      month,
      totalExpense,
      categoryCount: categoryItems.length,
      items: categoryItems
    };
  }

  const top5 = categoryItems.slice(0, 5);
  const remaining = categoryItems.slice(5);

  let remainingAmount = 0;
  let remainingCount = 0;
  for (const item of remaining) {
    remainingAmount += item.amount;
    remainingCount += item.transactionCount;
  }

  const otherItem = {
    categoryId: 'other',
    categoryName: 'أخرى',
    color: '#94A3B8',
    icon: 'more-horizontal',
    slug: 'cat_other',
    amount: remainingAmount,
    percentage: totalExpense > 0 ? Math.round((remainingAmount / totalExpense) * 1000) / 10 : 0,
    transactionCount: remainingCount
  };

  return {
    month,
    totalExpense,
    categoryCount: categoryItems.length,
    items: [...top5, otherItem]
  };
}

/**
 * Computes weekly cash flow breakdown (Income vs Expense) for the target calendar month.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {string} [options.month] Calendar month 'YYYY-MM'
 * @param {string|null} [options.userId]
 * @returns {Promise<{
 *   month: string,
 *   weeks: Array<{
 *     weekNumber: number,
 *     weekLabel: string,
 *     dateRange: string,
 *     startDate: string,
 *     endDate: string,
 *     income: number,
 *     expense: number,
 *     net: number
 *   }>,
 *   totals: {
 *     income: number,
 *     expense: number,
 *     net: number
 *   }
 * }>}
 */
export async function getCashFlowTrendAnalytics(database = db, options = {}) {
  const month = options.month || getCurrentYearMonth();
  const userId = options.userId !== undefined ? options.userId : null;

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

  // Define weekly brackets:
  // Week 1: 1 - 7
  // Week 2: 8 - 14
  // Week 3: 15 - 21
  // Week 4: 22 - 28
  // Week 5: 29 - daysInMonth (if > 28)
  const weekDefinitions = [
    { num: 1, label: 'الأسبوع 1', start: 1, end: 7 },
    { num: 2, label: 'الأسبوع 2', start: 8, end: 14 },
    { num: 3, label: 'الأسبوع 3', start: 15, end: 21 },
    { num: 4, label: 'الأسبوع 4', start: 22, end: 28 },
  ];

  if (daysInMonth > 28) {
    weekDefinitions.push({
      num: 5,
      label: 'الأسبوع 5',
      start: 29,
      end: daysInMonth
    });
  }

  // Fetch all transactions for the target month
  const transactions = await getTransactions(database, {
    includeDeleted: false,
    userId,
    limit: undefined,
    offset: 0
  });

  const monthTransactions = transactions.filter(
    (tx) => tx.date && tx.date.startsWith(month) && (tx.type === 'income' || tx.type === 'expense')
  );

  let totalIncome = 0;
  let totalExpense = 0;

  const weeks = weekDefinitions.map((w) => {
    const startStr = `${month}-${String(w.start).padStart(2, '0')}`;
    const endStr = `${month}-${String(w.end).padStart(2, '0')}`;

    let weekIncome = 0;
    let weekExpense = 0;

    for (const tx of monthTransactions) {
      if (tx.date >= startStr && tx.date <= endStr) {
        if (tx.type === 'income') {
          weekIncome += tx.amount;
        } else if (tx.type === 'expense') {
          weekExpense += tx.amount;
        }
      }
    }

    totalIncome += weekIncome;
    totalExpense += weekExpense;

    return {
      weekNumber: w.num,
      weekLabel: w.label,
      dateRange: `${w.start} - ${w.end}`,
      startDate: startStr,
      endDate: endStr,
      income: weekIncome,
      expense: weekExpense,
      net: weekIncome - weekExpense
    };
  });

  return {
    month,
    weeks,
    totals: {
      income: totalIncome,
      expense: totalExpense,
      net: totalIncome - totalExpense
    }
  };
}

/**
 * Aggregates all dashboard data in a single comprehensive payload.
 * Automatically seeds default accounts and categories if this is the first run.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @returns {Promise<{
 *   metrics: object,
 *   accounts: Array<object>,
 *   categoryBreakdown: object,
 *   cashFlowTrend: object,
 *   recentTransactions: Array<object>,
 *   currency: string
 * }>}
 */
export async function getDashboardData(database = db, options = {}) {
  const userId = options.userId !== undefined ? options.userId : null;
  const month = options.month || getCurrentYearMonth();
  const normalizedOptions = {
    ...options,
    userId,
    month,
    targetMonth: month,
    reconcile: true
  };

  // 1. Ensure database is pre-seeded with defaults for Guest or User mode
  const [categoriesSeeded, accountsSeeded] = await Promise.all([
    isCategoriesSeeded(database, userId),
    isAccountsSeeded(database, userId)
  ]);

  if (!categoriesSeeded) {
    await seedDefaultCategories(database, userId);
  }
  if (!accountsSeeded) {
    await seedDefaultAccounts(database, userId, options.currency || DEFAULT_CURRENCY_CODE);
  }

  // 2. Query all dashboard subsystems in parallel
  const [
    metrics,
    rawAccounts,
    categoryBreakdown,
    cashFlowTrend,
    rawTransactions,
    allCategories
  ] = await Promise.all([
    getDashboardOverviewMetrics(database, normalizedOptions),
    getAccounts(database, { includeDeleted: false, userId }),
    getCategorySpendingBreakdown(database, normalizedOptions),
    getCashFlowTrendAnalytics(database, normalizedOptions),
    getTransactions(database, {
      limit: 5,
      sortOrder: 'desc',
      includeDeleted: false,
      userId
    }),
    getCategories(database, { includeDeleted: true, userId })
  ]);

  // 3. Compute ledger-backed balance for each account
  const accounts = await Promise.all(
    rawAccounts.map(async (acc) => {
      const calc = await calculateAccountBalance(acc.id, database);
      const balance = calc ? calc.calculatedBalance : (acc.current_balance || 0);
      return {
        ...acc,
        balance,
        isLiability: acc.type === 'credit_card'
      };
    })
  );

  // 4. Map category and account metadata for recent transactions
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const recentTransactions = rawTransactions.map((tx) => {
    const category = tx.category_id ? categoryMap.get(tx.category_id) : null;
    const account = tx.account_id ? accountMap.get(tx.account_id) : null;
    const destinationAccount = tx.destination_account_id ? accountMap.get(tx.destination_account_id) : null;

    return {
      ...tx,
      categoryName: category ? category.name : (tx.type === 'transfer' ? 'تحويل مالي' : 'بدون تصنيف'),
      categoryColor: category ? category.color : (tx.type === 'transfer' ? '#6366F1' : '#94A3B8'),
      categoryIcon: category ? category.icon : (tx.type === 'transfer' ? 'transfer' : 'more-horizontal'),
      accountName: account ? account.name : 'حساب محذوف',
      destinationAccountName: destinationAccount ? destinationAccount.name : null
    };
  });

  const currency = metrics.currency || DEFAULT_CURRENCY_CODE;

  return {
    metrics,
    accounts,
    categoryBreakdown,
    cashFlowTrend,
    recentTransactions,
    currency
  };
}
