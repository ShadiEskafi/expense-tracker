/**
 * Transaction Filtering, Search & Chronological Grouping Engine (F011)
 *
 * Provides pure, deterministic filtering, text search with Arabic normalization,
 * date range calculations, chronological date grouping, and financial summaries.
 *
 * Compliant with:
 * - project-summary.md § 23 & 24 (View 2: Transactions View)
 * - design-system/screens.md § 2
 * - ADR-002 (Integer Minor Units)
 * - ADR-011 (Soft Deletes / Tombstones)
 */

import { db } from '../../db/db.js';

/**
 * Loads and enriches transaction data with Category and Account relations from Dexie.
 *
 * @param {import('../../db/db.js').ExpenseDatabase} [database=db]
 * @returns {Promise<{ transactions: Array<object>, categories: Array<object>, accounts: Array<object> }>}
 */
export async function fetchTransactionLedgerData(database = db) {
  const [txList, catList, accList] = await Promise.all([
    database.transactions.toArray(),
    database.categories.toArray(),
    database.accounts.toArray()
  ]);

  const catMap = new Map(catList.map((c) => [c.id, c]));
  const accMap = new Map(accList.map((a) => [a.id, a]));

  const enriched = txList.map((tx) => ({
    ...tx,
    category: catMap.get(tx.category_id) || null,
    categoryName: catMap.get(tx.category_id)?.name || '',
    account: accMap.get(tx.account_id) || null,
    accountName: accMap.get(tx.account_id)?.name || '',
    destinationAccount: accMap.get(tx.destination_account_id) || null,
    destinationAccountName: accMap.get(tx.destination_account_id)?.name || ''
  }));

  return {
    transactions: enriched,
    categories: catList.filter((c) => c.deleted_at === null),
    accounts: accList.filter((a) => a.deleted_at === null)
  };
}

export const DEFAULT_FILTERS = Object.freeze({
  search: '',
  type: 'all', // 'all' | 'expense' | 'income' | 'transfer'
  categoryIds: [],
  accountIds: [],
  datePreset: 'all', // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom'
  startDate: '',
  endDate: '',
  tags: [],
  minAmount: null,
  maxAmount: null
});

export const DATE_PRESETS = [
  { id: 'all', label: 'كل الفترات' },
  { id: 'today', label: 'اليوم' },
  { id: 'yesterday', label: 'أمس' },
  { id: 'this_week', label: 'هذا الأسبوع' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'last_month', label: 'الشهر السابق' },
  { id: 'custom', label: 'مخصص' }
];

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const ARABIC_DAYS = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

/**
 * Normalizes Arabic text for flexible substring searching.
 * Strips tashkeel (diacritics), unifies alef forms, and normalizes yaa and taa marbuta.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeArabicText(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    // Remove Arabic tashkeel / harakat (ranges 064B - 065F, 0670)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Alef variations (أ, إ, آ, ٱ -> ا)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    // Normalize Taa Marbuta (ة -> ه)
    .replace(/\u0629/g, '\u0647')
    // Normalize Alef Maqsura (ى -> ي)
    .replace(/\u0649/g, '\u064A')
    .trim();
}

/**
 * Formats a Date object to 'YYYY-MM-DD' ISO date string.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates start and end ISO dates ('YYYY-MM-DD') for a given preset relative to a reference date.
 *
 * @param {string} preset
 * @param {Date} [referenceDate]
 * @returns {{ startDate: string | null, endDate: string | null }}
 */
export function getDatePresetRange(preset, referenceDate = new Date()) {
  const ref = new Date(referenceDate);

  switch (preset) {
    case 'today': {
      const todayStr = formatDateToIso(ref);
      return { startDate: todayStr, endDate: todayStr };
    }
    case 'yesterday': {
      const yesterday = new Date(ref);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatDateToIso(yesterday);
      return { startDate: yStr, endDate: yStr };
    }
    case 'this_week': {
      // In Arabic context, week starts on Saturday (day 6) or Sunday (day 0)
      // Standard Middle East week start: Saturday (6).
      const day = ref.getDay();
      const diffToSaturday = (day + 1) % 7;
      const startOfWeek = new Date(ref);
      startOfWeek.setDate(ref.getDate() - diffToSaturday);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return {
        startDate: formatDateToIso(startOfWeek),
        endDate: formatDateToIso(endOfWeek)
      };
    }
    case 'this_month': {
      const startOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const endOfMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return {
        startDate: formatDateToIso(startOfMonth),
        endDate: formatDateToIso(endOfMonth)
      };
    }
    case 'last_month': {
      const startOfLastMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const endOfLastMonth = new Date(ref.getFullYear(), ref.getMonth(), 0);
      return {
        startDate: formatDateToIso(startOfLastMonth),
        endDate: formatDateToIso(endOfLastMonth)
      };
    }
    case 'all':
    default:
      return { startDate: null, endDate: null };
  }
}

/**
 * Formats a date string 'YYYY-MM-DD' into an authentic Arabic string.
 * e.g. "25 أكتوبر 2026"
 *
 * @param {string} isoDateStr
 * @returns {string}
 */
export function formatArabicDate(isoDateStr) {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;

  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const monthName = ARABIC_MONTHS[monthIdx] || parts[1];
  return `${day} ${monthName} ${year}`;
}

/**
 * Gets day of week name in Arabic for an ISO date string.
 *
 * @param {string} isoDateStr
 * @returns {string}
 */
export function getArabicDayName(isoDateStr) {
  if (!isoDateStr || typeof isoDateStr !== 'string') return '';
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return ARABIC_DAYS[dateObj.getDay()] || '';
}

/**
 * Filter an array of transaction items against comprehensive filter criteria.
 *
 * @param {Array<object>} transactions
 * @param {object} [filters={}]
 * @param {object} [options={}]
 * @param {Date} [options.referenceDate] Reference date for presets (defaults to now)
 * @returns {Array<object>} Filtered transactions
 */
export function filterTransactions(transactions, filters = {}, options = {}) {
  if (!Array.isArray(transactions)) return [];

  const refDate = options.referenceDate || new Date();
  const searchNorm = normalizeArabicText(filters.search || '');

  // Determine active date boundary
  let effectiveStartDate = filters.startDate || null;
  let effectiveEndDate = filters.endDate || null;

  if (filters.datePreset && filters.datePreset !== 'all' && filters.datePreset !== 'custom') {
    const range = getDatePresetRange(filters.datePreset, refDate);
    effectiveStartDate = range.startDate;
    effectiveEndDate = range.endDate;
  }

  const categoryFilter = Array.isArray(filters.categoryIds)
    ? filters.categoryIds
    : (filters.categoryIds ? [filters.categoryIds] : []);

  const accountFilter = Array.isArray(filters.accountIds)
    ? filters.accountIds
    : (filters.accountIds ? [filters.accountIds] : []);

  const tagsFilter = Array.isArray(filters.tags)
    ? filters.tags.map((t) => normalizeArabicText(t))
    : (filters.tags ? [normalizeArabicText(filters.tags)] : []);

  const includeDeleted = Boolean(filters.includeDeleted);

  return transactions.filter((tx) => {
    // 1. Soft-delete invariant (ADR-011)
    if (!includeDeleted && tx.deleted_at !== null) {
      return false;
    }

    // 2. Type filter
    if (filters.type && filters.type !== 'all') {
      if (Array.isArray(filters.type)) {
        if (!filters.type.includes(tx.type)) return false;
      } else if (tx.type !== filters.type) {
        return false;
      }
    }

    // 3. Category filter
    if (categoryFilter.length > 0) {
      if (!tx.category_id || !categoryFilter.includes(tx.category_id)) {
        return false;
      }
    }

    // 4. Account filter (matches source account OR destination account)
    if (accountFilter.length > 0) {
      const matchSource = tx.account_id && accountFilter.includes(tx.account_id);
      const matchDest = tx.destination_account_id && accountFilter.includes(tx.destination_account_id);
      if (!matchSource && !matchDest) {
        return false;
      }
    }

    // 5. Date boundaries (YYYY-MM-DD lexicographical comparison)
    if (effectiveStartDate && tx.date < effectiveStartDate) {
      return false;
    }
    if (effectiveEndDate && tx.date > effectiveEndDate) {
      return false;
    }

    // 6. Amount range (integer minor units)
    if (typeof filters.minAmount === 'number' && tx.amount < filters.minAmount) {
      return false;
    }
    if (typeof filters.maxAmount === 'number' && tx.amount > filters.maxAmount) {
      return false;
    }

    // 7. Tags filter
    if (tagsFilter.length > 0) {
      if (!Array.isArray(tx.tags) || tx.tags.length === 0) {
        return false;
      }
      const txNormTags = tx.tags.map((t) => normalizeArabicText(t));
      const hasMatchingTag = tagsFilter.some((tf) => txNormTags.includes(tf));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // 8. Text Search with Arabic normalization
    if (searchNorm) {
      const normNotes = normalizeArabicText(tx.notes || '');
      const normCategory = normalizeArabicText(tx.category?.name || tx.category_name || '');
      const normAccount = normalizeArabicText(tx.account?.name || tx.account_name || '');
      const normDestAccount = normalizeArabicText(tx.destinationAccount?.name || tx.destination_account_name || '');
      const normPayee = normalizeArabicText(tx.payee || '');
      const tagsMatch = Array.isArray(tx.tags) && tx.tags.some((t) => normalizeArabicText(t).includes(searchNorm));

      const matches =
        normNotes.includes(searchNorm) ||
        normCategory.includes(searchNorm) ||
        normAccount.includes(searchNorm) ||
        normDestAccount.includes(searchNorm) ||
        normPayee.includes(searchNorm) ||
        tagsMatch;

      if (!matches) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Computes financial summary totals for a filtered set of transactions.
 * Transfers are non-distorting to cash flow per financial-rules.md (ADR-004 & F007).
 *
 * @param {Array<object>} transactions
 * @returns {{
 *   totalIncome: number,
 *   totalExpense: number,
 *   netCashFlow: number,
 *   totalCount: number,
 *   expenseCount: number,
 *   incomeCount: number,
 *   transferCount: number
 * }}
 */
export function computeFilteredSummary(transactions) {
  if (!Array.isArray(transactions)) {
    return {
      totalIncome: 0,
      totalExpense: 0,
      netCashFlow: 0,
      totalCount: 0,
      expenseCount: 0,
      incomeCount: 0,
      transferCount: 0
    };
  }

  let totalIncome = 0;
  let totalExpense = 0;
  let expenseCount = 0;
  let incomeCount = 0;
  let transferCount = 0;

  for (const tx of transactions) {
    if (tx.deleted_at !== null) continue;

    if (tx.type === 'income') {
      totalIncome += tx.amount || 0;
      incomeCount++;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount || 0;
      expenseCount++;
    } else if (tx.type === 'transfer') {
      transferCount++;
    }
  }

  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    totalCount: transactions.length,
    expenseCount,
    incomeCount,
    transferCount
  };
}

/**
 * Groups transactions chronologically by date descending (newest first).
 * Produces structured date headers with Arabic friendly titles ("اليوم", "أمس", etc.)
 * and daily income/expense sums.
 *
 * @param {Array<object>} transactions
 * @param {Date} [referenceDate]
 * @returns {Array<{
 *   date: string,
 *   title: string,
 *   formattedDate: string,
 *   dayName: string,
 *   isToday: boolean,
 *   isYesterday: boolean,
 *   transactions: Array<object>,
 *   totalIncome: number,
 *   totalExpense: number,
 *   net: number,
 *   count: number
 * }>}
 */
export function groupTransactionsByDate(transactions, referenceDate = new Date()) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const ref = new Date(referenceDate);
  const todayStr = formatDateToIso(ref);

  const yesterday = new Date(ref);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateToIso(yesterday);

  // Group by date key
  const groupsMap = new Map();

  for (const tx of transactions) {
    const dateKey = tx.date || todayStr;
    if (!groupsMap.has(dateKey)) {
      groupsMap.set(dateKey, []);
    }
    groupsMap.get(dateKey).push(tx);
  }

  // Sort date keys descending (chronological ledger order)
  const sortedDates = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a));

  return sortedDates.map((dateKey) => {
    const txList = groupsMap.get(dateKey);

    // Sort items within group by created_at descending (latest entries on top)
    txList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    let groupIncome = 0;
    let groupExpense = 0;

    for (const tx of txList) {
      if (tx.deleted_at !== null) continue;
      if (tx.type === 'income') groupIncome += tx.amount || 0;
      else if (tx.type === 'expense') groupExpense += tx.amount || 0;
    }

    const isToday = dateKey === todayStr;
    const isYesterday = dateKey === yesterdayStr;
    const formattedDate = formatArabicDate(dateKey);
    const dayName = getArabicDayName(dateKey);

    let title = formattedDate;
    if (isToday) {
      title = 'اليوم';
    } else if (isYesterday) {
      title = 'أمس';
    }

    return {
      date: dateKey,
      title,
      formattedDate,
      dayName,
      isToday,
      isYesterday,
      transactions: txList,
      totalIncome: groupIncome,
      totalExpense: groupExpense,
      net: groupIncome - groupExpense,
      count: txList.length
    };
  });
}

/**
 * Calculates the number of active, non-default filters.
 *
 * @param {object} filters
 * @returns {number}
 */
export function getActiveFiltersCount(filters = {}) {
  let count = 0;

  if (filters.search && filters.search.trim()) count++;
  if (filters.type && filters.type !== 'all') count++;
  if (Array.isArray(filters.categoryIds) && filters.categoryIds.length > 0) {
    count += filters.categoryIds.length;
  }
  if (Array.isArray(filters.accountIds) && filters.accountIds.length > 0) {
    count += filters.accountIds.length;
  }
  if (filters.datePreset && filters.datePreset !== 'all') count++;
  if (filters.datePreset === 'custom' && (filters.startDate || filters.endDate)) count++;
  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    count += filters.tags.length;
  }
  if (filters.minAmount !== null && filters.minAmount !== undefined && filters.minAmount !== '') count++;
  if (filters.maxAmount !== null && filters.maxAmount !== undefined && filters.maxAmount !== '') count++;

  return count;
}
