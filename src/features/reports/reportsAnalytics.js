/**
 * Periodic Reports & Analytics Engine (F012)
 *
 * Implements pure, deterministic financial metrics calculation for reports,
 * period date ranges (Week, Month, Year, Custom), period navigation, category
 * expenditure breakdown ranking, and top individual expenses.
 *
 * Compliant with:
 * - project-summary.md § 14 (Reports and Analytics) & § 11 (Accounting Rules)
 * - design-system/screens.md § 8 (Reports & Analytics View)
 * - design-system/data-visualization.md
 * - ADR-002 (ISO 4217 Integer Minor Units)
 * - ADR-004 (Transfer Non-Distortion Invariant)
 * - ADR-011 (Soft Deletes / Tombstones)
 */

import { db } from '../../db/db.js';

export const REPORT_PRESETS = [
  { id: 'this_week', label: 'هذا الأسبوع' },
  { id: 'this_month', label: 'هذا الشهر' },
  { id: 'this_year', label: 'هذا العام' },
  { id: 'custom', label: 'فترة مخصصة' }
];

export const ARABIC_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export const ARABIC_DAY_NAMES = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

/**
 * Formats a Date object to 'YYYY-MM-DD' ISO date string.
 *
 * @param {Date} date
 * @returns {string}
 */
export function toIsoDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates start and end ISO dates ('YYYY-MM-DD') for a given preset relative to a reference date.
 *
 * @param {string} preset 'this_week' | 'this_month' | 'this_year' | 'custom'
 * @param {object} [options={}]
 * @param {Date|string} [options.referenceDate] Defaults to current date
 * @param {string} [options.customStartDate]
 * @param {string} [options.customEndDate]
 * @returns {{ startDate: string, endDate: string }}
 */
export function getPeriodDateRange(preset, options = {}) {
  const ref = options.referenceDate ? new Date(options.referenceDate) : new Date();

  // Normalize aliases
  const normalizedPreset =
    preset === 'week' ? 'this_week' :
    preset === 'month' ? 'this_month' :
    preset === 'year' ? 'this_year' :
    preset;

  switch (normalizedPreset) {
    case 'this_week': {
      // In Arabic context, week starts on Saturday (day 6)
      const day = ref.getDay();
      const diffToSaturday = (day + 1) % 7;
      const startOfWeek = new Date(ref);
      startOfWeek.setDate(ref.getDate() - diffToSaturday);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      return {
        startDate: toIsoDate(startOfWeek),
        endDate: toIsoDate(endOfWeek)
      };
    }

    case 'this_month': {
      const startOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const endOfMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return {
        startDate: toIsoDate(startOfMonth),
        endDate: toIsoDate(endOfMonth)
      };
    }

    case 'this_year': {
      const startOfYear = new Date(ref.getFullYear(), 0, 1);
      const endOfYear = new Date(ref.getFullYear(), 11, 31);
      return {
        startDate: toIsoDate(startOfYear),
        endDate: toIsoDate(endOfYear)
      };
    }

    case 'custom': {
      let start = options.customStartDate;
      let end = options.customEndDate;

      if (!start || !end) {
        // Fallback to current month if dates missing
        const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        return { startDate: toIsoDate(s), endDate: toIsoDate(e) };
      }

      // If inverted, swap them
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }

      return { startDate: start, endDate: end };
    }

    default: {
      const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      return { startDate: toIsoDate(s), endDate: toIsoDate(e) };
    }
  }
}

/**
 * Shifts reference date backward (-1) or forward (+1) for period navigation.
 *
 * @param {string} preset
 * @param {Date|string} referenceDate
 * @param {number} direction -1 for previous, +1 for next
 * @returns {Date} Shifted Date object
 */
export function shiftPeriodReferenceDate(preset, referenceDate, direction = 1) {
  const d = new Date(referenceDate);
  const normalizedPreset =
    preset === 'week' ? 'this_week' :
    preset === 'month' ? 'this_month' :
    preset === 'year' ? 'this_year' :
    preset;

  if (normalizedPreset === 'this_week') {
    d.setDate(d.getDate() + (direction * 7));
  } else if (normalizedPreset === 'this_month') {
    d.setMonth(d.getMonth() + direction);
  } else if (normalizedPreset === 'this_year') {
    d.setFullYear(d.getFullYear() + direction);
  }

  return d;
}

/**
 * Formats a date string 'YYYY-MM-DD' into an authentic Arabic string.
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

  const monthName = ARABIC_MONTH_NAMES[monthIdx] || parts[1];
  return `${day} ${monthName} ${year}`;
}

/**
 * Formats a readable headline for the active period.
 *
 * @param {string} preset
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 * @returns {string}
 */
export function formatPeriodHeadline(preset, startDate, endDate) {
  const normalizedPreset =
    preset === 'week' ? 'this_week' :
    preset === 'month' ? 'this_month' :
    preset === 'year' ? 'this_year' :
    preset;

  if (normalizedPreset === 'this_month' && startDate && endDate) {
    const [year, month] = startDate.split('-');
    const monthName = ARABIC_MONTH_NAMES[parseInt(month, 10) - 1] || month;
    return `شهر ${monthName} ${year}`;
  }

  if (normalizedPreset === 'this_year' && startDate) {
    const [year] = startDate.split('-');
    return `عام ${year}`;
  }

  if (normalizedPreset === 'this_week' && startDate && endDate) {
    const sParts = startDate.split('-');
    const eParts = endDate.split('-');
    const sMonth = ARABIC_MONTH_NAMES[parseInt(sParts[1], 10) - 1];
    const eMonth = ARABIC_MONTH_NAMES[parseInt(eParts[1], 10) - 1];

    if (sMonth === eMonth && sParts[0] === eParts[0]) {
      return `${parseInt(sParts[2], 10)} – ${parseInt(eParts[2], 10)} ${sMonth} ${sParts[0]}`;
    }
    return `${formatArabicDate(startDate)} – ${formatArabicDate(endDate)}`;
  }

  // Custom or generic
  if (startDate && endDate) {
    if (startDate === endDate) return formatArabicDate(startDate);
    return `${formatArabicDate(startDate)} – ${formatArabicDate(endDate)}`;
  }

  return 'فترة غير محددة';
}

/**
 * Computes difference in calendar days between two ISO dates (inclusive).
 *
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 * @returns {number}
 */
export function countDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const s = new Date(startDate);
  const e = new Date(endDate);
  const diffTime = Math.abs(e - s);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diffDays);
}

/**
 * Calculates comprehensive periodic metrics, category breakdown, top expenses, and time cadence.
 *
 * @param {Array<object>} transactions
 * @param {Array<object>} categories
 * @param {Array<object>} accounts
 * @param {object} options
 * @param {string} options.startDate 'YYYY-MM-DD'
 * @param {string} options.endDate 'YYYY-MM-DD'
 * @param {string} [options.currency='SAR']
 * @param {string|null} [options.selectedCategoryId=null] Optional filter for category drilldown
 * @returns {object} Periodic report metrics
 */
export function calculatePeriodicMetrics(
  transactions = [],
  categories = [],
  accounts = [],
  options = {}
) {
  const { startDate, endDate, currency = 'SAR', selectedCategoryId = null } = options;

  const catMap = new Map();
  for (const c of categories) {
    catMap.set(c.id, c);
  }

  const accMap = new Map();
  for (const a of accounts) {
    accMap.set(a.id, a);
  }

  // 1. Filter transactions strictly within period and exclude deleted
  const periodTransactions = transactions.filter((tx) => {
    if (!tx || tx.deleted_at !== null) return false;
    if (!tx.date) return false;
    return tx.date >= startDate && tx.date <= endDate;
  });

  let totalExpense = 0;
  let totalIncome = 0;
  let expenseCount = 0;
  let incomeCount = 0;
  let transferCount = 0;

  const categoryBuckets = new Map();
  const allExpenseTxs = [];

  for (const tx of periodTransactions) {
    if (tx.type === 'expense') {
      totalExpense += tx.amount;
      expenseCount += 1;
      allExpenseTxs.push(tx);

      const catId = tx.category_id || 'uncategorized';
      const existing = categoryBuckets.get(catId) || { amount: 0, count: 0 };
      existing.amount += tx.amount;
      existing.count += 1;
      categoryBuckets.set(catId, existing);
    } else if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeCount += 1;
    } else if (tx.type === 'transfer') {
      transferCount += 1;
      // Invariant: transfers NEVER distort expense, income, or net cash flow
    }
  }

  const netCashFlow = totalIncome - totalExpense;
  const daysInPeriod = countDaysBetween(startDate, endDate);
  const dailyAverageExpense = totalExpense > 0 ? Math.round(totalExpense / daysInPeriod) : 0;
  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10
      : 0;

  // 2. Build Category Breakdown List
  const categoryBreakdown = [];
  for (const [catId, data] of categoryBuckets.entries()) {
    const cat = catMap.get(catId);
    const percentage = totalExpense > 0 ? Math.round((data.amount / totalExpense) * 1000) / 10 : 0;
    const avg = data.count > 0 ? Math.round(data.amount / data.count) : 0;

    categoryBreakdown.push({
      categoryId: catId,
      categoryName: cat?.name || (catId === 'uncategorized' ? 'بدون تصنيف' : 'تصنيف غير معروف'),
      color: cat?.color || '#94A3B8',
      icon: cat?.icon || 'more-horizontal',
      slug: cat?.slug || 'cat_other',
      amount: data.amount,
      percentage,
      transactionCount: data.count,
      averageExpense: avg
    });
  }

  // Sort categories descending by amount
  categoryBreakdown.sort((a, b) => b.amount - a.amount);

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

  // 3. Ranked Top Individual Expenses
  let filteredExpenses = allExpenseTxs;
  if (selectedCategoryId) {
    filteredExpenses = allExpenseTxs.filter((tx) => (tx.category_id || 'uncategorized') === selectedCategoryId);
  }

  // Sort descending by amount
  filteredExpenses.sort((a, b) => b.amount - a.amount);

  const topExpenses = filteredExpenses.map((tx, idx) => {
    const cat = catMap.get(tx.category_id);
    const acc = accMap.get(tx.account_id);
    return {
      rank: idx + 1,
      id: tx.id,
      amount: tx.amount,
      date: tx.date,
      notes: tx.notes || '',
      description: tx.notes || cat?.name || 'مصروف عام',
      categoryId: tx.category_id,
      categoryName: cat?.name || 'بدون تصنيف',
      categoryColor: cat?.color || '#94A3B8',
      categoryIcon: cat?.icon || 'more-horizontal',
      accountId: tx.account_id,
      accountName: acc?.name || 'محفظة عامة',
      accountType: acc?.type || 'cash',
      tags: tx.tags || []
    };
  });

  // 4. Time Cadence / Timeline Series (for visual trend chart)
  const timelineData = buildTimelineCadence(periodTransactions, startDate, endDate, daysInPeriod);

  // 5. Dynamic Humanized Insight
  let insightText = '';
  if (totalExpense === 0 && totalIncome === 0) {
    insightText = 'لا توجد حركة مالية مسجلة في هذه الفترة الزمنية.';
  } else if (totalExpense === 0 && totalIncome > 0) {
    insightText = `تم تسجيل دخل بقيمة ممتازة خلال هذه الفترة دون أي مصاريف مسجلة.`;
  } else if (topCategory) {
    insightText = `أعلى فئة صرف هي «${topCategory.categoryName}» وتشكل ${topCategory.percentage}% من إجمالي نفقاتك (${topCategory.transactionCount} عملية).`;
  }

  return {
    startDate,
    endDate,
    daysInPeriod,
    currency,
    metrics: {
      totalExpense,
      totalIncome,
      netCashFlow,
      dailyAverageExpense,
      savingsRate,
      expenseCount,
      incomeCount,
      transferCount,
      totalCount: periodTransactions.length
    },
    categoryBreakdown,
    topCategory,
    topExpenses,
    timelineData,
    insightText
  };
}

/**
 * Builds chronological timeline buckets (daily for <=31 days, monthly for >31 days).
 *
 * @param {Array<object>} transactions
 * @param {string} startDate
 * @param {string} endDate
 * @param {number} daysCount
 * @returns {Array<object>}
 */
export function buildTimelineCadence(transactions, startDate, endDate, daysCount) {
  if (!startDate || !endDate) return [];

  // Case A: <= 31 days (Daily buckets)
  if (daysCount <= 31) {
    const buckets = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const iso = toIsoDate(current);
      const dayName = ARABIC_DAY_NAMES[current.getDay()];
      const dayNum = current.getDate();
      const monthIdx = current.getMonth();
      const label = `${dayName} ${dayNum}`;
      const shortLabel = `${dayNum}/${monthIdx + 1}`;

      buckets.push({
        key: iso,
        date: iso,
        label,
        shortLabel,
        income: 0,
        expense: 0,
        net: 0
      });

      current.setDate(current.getDate() + 1);
    }

    const map = new Map(buckets.map((b) => [b.key, b]));

    for (const tx of transactions) {
      const bucket = map.get(tx.date);
      if (bucket) {
        if (tx.type === 'expense') {
          bucket.expense += tx.amount / 100; // Major units for Recharts scaling
        } else if (tx.type === 'income') {
          bucket.income += tx.amount / 100;
        }
        bucket.net = bucket.income - bucket.expense;
      }
    }

    return buckets;
  }

  // Case B: > 31 days (Monthly buckets)
  const monthBuckets = new Map();
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const cur = new Date(startD.getFullYear(), startD.getMonth(), 1);

  while (cur <= endD) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const key = `${y}-${m}`;
    const monthName = ARABIC_MONTH_NAMES[cur.getMonth()];
    const label = `${monthName} ${y}`;

    monthBuckets.set(key, {
      key,
      date: key,
      label,
      shortLabel: monthName,
      income: 0,
      expense: 0,
      net: 0
    });

    cur.setMonth(cur.getMonth() + 1);
  }

  for (const tx of transactions) {
    if (!tx.date) continue;
    const monthKey = tx.date.substring(0, 7);
    const bucket = monthBuckets.get(monthKey);
    if (bucket) {
      if (tx.type === 'expense') {
        bucket.expense += tx.amount / 100;
      } else if (tx.type === 'income') {
        bucket.income += tx.amount / 100;
      }
      bucket.net = bucket.income - bucket.expense;
    }
  }

  return Array.from(monthBuckets.values());
}

/**
 * Loads database data and generates the periodic report.
 *
 * @param {import('../../db/db.js').ExpenseDatabase} database
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function loadPeriodicReport(database = db, options = {}) {
  const [transactions, categories, accounts] = await Promise.all([
    database.transactions.toArray(),
    database.categories.toArray(),
    database.accounts.toArray()
  ]);

  const range = getPeriodDateRange(options.preset || 'this_month', options);

  return calculatePeriodicMetrics(transactions, categories, accounts, {
    startDate: range.startDate,
    endDate: range.endDate,
    currency: options.currency || 'SAR',
    selectedCategoryId: options.selectedCategoryId || null
  });
}
