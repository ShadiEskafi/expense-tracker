import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import {
  getPeriodDateRange,
  shiftPeriodReferenceDate,
  formatArabicDate,
  formatPeriodHeadline,
  countDaysBetween,
  calculatePeriodicMetrics,
  buildTimelineCadence,
  loadPeriodicReport
} from './reportsAnalytics.js';
import { seedDefaultCategories, getCategories } from '../../services/category.js';
import { createAccount } from '../../services/account.js';
import { createTransaction } from '../../services/transaction.js';

describe('F012: Periodic Reports & Analytics Engine (reportsAnalytics)', () => {
  describe('1. Date Presets & Range Calculations', () => {
    const refDate = new Date('2026-10-25T12:00:00Z'); // Sunday, Oct 25, 2026

    it('calculates this_week starting on Saturday and ending on Friday', () => {
      // 2026-10-25 is Sunday. Saturday before it is 2026-10-24.
      // Week range: 2026-10-24 to 2026-10-30.
      const range = getPeriodDateRange('this_week', { referenceDate: refDate });
      expect(range.startDate).toBe('2026-10-24');
      expect(range.endDate).toBe('2026-10-30');
    });

    it('calculates this_month from 1st to last day of month', () => {
      const range = getPeriodDateRange('this_month', { referenceDate: refDate });
      expect(range.startDate).toBe('2026-10-01');
      expect(range.endDate).toBe('2026-10-31');
    });

    it('calculates this_year from Jan 1 to Dec 31', () => {
      const range = getPeriodDateRange('this_year', { referenceDate: refDate });
      expect(range.startDate).toBe('2026-01-01');
      expect(range.endDate).toBe('2026-12-31');
    });

    it('handles custom date ranges safely and auto-corrects inverted dates', () => {
      const normal = getPeriodDateRange('custom', {
        customStartDate: '2026-05-10',
        customEndDate: '2026-05-20'
      });
      expect(normal.startDate).toBe('2026-05-10');
      expect(normal.endDate).toBe('2026-05-20');

      // Inverted start and end
      const inverted = getPeriodDateRange('custom', {
        customStartDate: '2026-08-30',
        customEndDate: '2026-08-01'
      });
      expect(inverted.startDate).toBe('2026-08-01');
      expect(inverted.endDate).toBe('2026-08-30');
    });

    it('falls back to current month if custom dates are omitted', () => {
      const fallback = getPeriodDateRange('custom', { referenceDate: refDate });
      expect(fallback.startDate).toBe('2026-10-01');
      expect(fallback.endDate).toBe('2026-10-31');
    });
  });

  describe('2. Period Shifting (Previous / Next Navigation)', () => {
    const refDate = new Date('2026-10-25T12:00:00Z');

    it('shifts week by +/- 7 days', () => {
      const prevWeek = shiftPeriodReferenceDate('this_week', refDate, -1);
      expect(prevWeek.getDate()).toBe(18);

      const nextWeek = shiftPeriodReferenceDate('this_week', refDate, 1);
      expect(nextWeek.getDate()).toBe(1); // Nov 1
    });

    it('shifts month by +/- 1 month', () => {
      const prevMonth = shiftPeriodReferenceDate('this_month', refDate, -1);
      expect(prevMonth.getMonth()).toBe(8); // September (0-indexed: 8)

      const nextMonth = shiftPeriodReferenceDate('this_month', refDate, 1);
      expect(nextMonth.getMonth()).toBe(10); // November (0-indexed: 10)
    });

    it('shifts year by +/- 1 year', () => {
      const prevYear = shiftPeriodReferenceDate('this_year', refDate, -1);
      expect(prevYear.getFullYear()).toBe(2025);

      const nextYear = shiftPeriodReferenceDate('this_year', refDate, 1);
      expect(nextYear.getFullYear()).toBe(2027);
    });
  });

  describe('3. Arabic Headline & Date Formatting', () => {
    it('formats ISO date to authentic Arabic date string', () => {
      expect(formatArabicDate('2026-10-25')).toBe('25 أكتوبر 2026');
      expect(formatArabicDate('')).toBe('');
    });

    it('formats month headline in readable Arabic', () => {
      const text = formatPeriodHeadline('this_month', '2026-10-01', '2026-10-31');
      expect(text).toBe('شهر أكتوبر 2026');
    });

    it('formats year headline in readable Arabic', () => {
      const text = formatPeriodHeadline('this_year', '2026-01-01', '2026-12-31');
      expect(text).toBe('عام 2026');
    });

    it('formats week headline in readable Arabic', () => {
      const text = formatPeriodHeadline('this_week', '2026-10-18', '2026-10-24');
      expect(text).toBe('18 – 24 أكتوبر 2026');
    });

    it('formats custom range headline in readable Arabic', () => {
      const text = formatPeriodHeadline('custom', '2026-10-05', '2026-10-15');
      expect(text).toBe('5 أكتوبر 2026 – 15 أكتوبر 2026');
    });

    it('counts days between dates inclusively', () => {
      expect(countDaysBetween('2026-10-01', '2026-10-31')).toBe(31);
      expect(countDaysBetween('2026-10-01', '2026-10-01')).toBe(1);
      expect(countDaysBetween('2026-10-10', '2026-10-12')).toBe(3);
    });
  });

  describe('4. Financial Metrics & Category Breakdown Ranking', () => {
    const mockCategories = [
      { id: 'cat-1', name: 'مطاعم وأغذية', color: '#EF4444', icon: 'utensils', slug: 'cat_food' },
      { id: 'cat-2', name: 'تسوق وملابس', color: '#3B82F6', icon: 'shopping-bag', slug: 'cat_shopping' },
      { id: 'cat-3', name: 'فواتير ومرافق', color: '#F59E0B', icon: 'home', slug: 'cat_bills' }
    ];

    const mockAccounts = [
      { id: 'acc-1', name: 'كاش المحفظة', type: 'cash' },
      { id: 'acc-2', name: 'الحساب الجاري', type: 'bank' }
    ];

    it('handles empty transaction dataset safely with zero metrics', () => {
      const report = calculatePeriodicMetrics([], mockCategories, mockAccounts, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        currency: 'SAR'
      });

      expect(report.metrics.totalExpense).toBe(0);
      expect(report.metrics.totalIncome).toBe(0);
      expect(report.metrics.netCashFlow).toBe(0);
      expect(report.metrics.dailyAverageExpense).toBe(0);
      expect(report.metrics.savingsRate).toBe(0);
      expect(report.categoryBreakdown).toEqual([]);
      expect(report.topCategory).toBeNull();
      expect(report.topExpenses).toEqual([]);
      expect(report.insightText).toContain('لا توجد حركة مالية');
    });

    it('calculates totals, category percentages, and top category accurately', () => {
      const transactions = [
        // Expenses in period
        { id: 'tx-1', type: 'expense', amount: 60000, category_id: 'cat-1', account_id: 'acc-1', date: '2026-10-05', deleted_at: null, notes: 'مطعم غداء' },
        { id: 'tx-2', type: 'expense', amount: 30000, category_id: 'cat-2', account_id: 'acc-2', date: '2026-10-10', deleted_at: null, notes: 'شراء قميص' },
        { id: 'tx-3', type: 'expense', amount: 10000, category_id: 'cat-1', account_id: 'acc-1', date: '2026-10-15', deleted_at: null, notes: 'قهوة' },
        // Income in period
        { id: 'tx-4', type: 'income', amount: 200000, category_id: null, account_id: 'acc-2', date: '2026-10-01', deleted_at: null, notes: 'راتب' },
        // Transfer in period (MUST NOT distort income or expense)
        { id: 'tx-5', type: 'transfer', amount: 50000, account_id: 'acc-2', destination_account_id: 'acc-1', date: '2026-10-08', deleted_at: null },
        // Deleted transaction (MUST be ignored)
        { id: 'tx-6', type: 'expense', amount: 99999, category_id: 'cat-3', account_id: 'acc-1', date: '2026-10-12', deleted_at: '2026-10-12T10:00:00Z' },
        // Transaction outside period (MUST be ignored)
        { id: 'tx-7', type: 'expense', amount: 50000, category_id: 'cat-1', account_id: 'acc-1', date: '2026-09-28', deleted_at: null }
      ];

      const report = calculatePeriodicMetrics(transactions, mockCategories, mockAccounts, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        currency: 'SAR'
      });

      // Total expense: 60,000 + 30,000 + 10,000 = 100,000 (1,000.00 SAR)
      expect(report.metrics.totalExpense).toBe(100000);
      // Total income: 200,000 (2,000.00 SAR)
      expect(report.metrics.totalIncome).toBe(200000);
      // Net cash flow: 200,000 - 100,000 = +100,000
      expect(report.metrics.netCashFlow).toBe(100000);
      // Savings rate: (200000 - 100000) / 200000 = 50%
      expect(report.metrics.savingsRate).toBe(50);
      // Daily average: 100000 / 31 = 3226
      expect(report.metrics.dailyAverageExpense).toBe(Math.round(100000 / 31));

      // Category breakdown ranking
      expect(report.categoryBreakdown.length).toBe(2);
      // #1: cat-1 (70,000 -> 70%)
      expect(report.categoryBreakdown[0].categoryId).toBe('cat-1');
      expect(report.categoryBreakdown[0].categoryName).toBe('مطاعم وأغذية');
      expect(report.categoryBreakdown[0].amount).toBe(70000);
      expect(report.categoryBreakdown[0].percentage).toBe(70);
      expect(report.categoryBreakdown[0].transactionCount).toBe(2);
      // #2: cat-2 (30,000 -> 30%)
      expect(report.categoryBreakdown[1].categoryId).toBe('cat-2');
      expect(report.categoryBreakdown[1].percentage).toBe(30);

      // Top category
      expect(report.topCategory.categoryName).toBe('مطاعم وأغذية');

      // Top individual expenses (sorted descending by amount)
      expect(report.topExpenses.length).toBe(3);
      expect(report.topExpenses[0].rank).toBe(1);
      expect(report.topExpenses[0].amount).toBe(60000);
      expect(report.topExpenses[0].notes).toBe('مطعم غداء');
      expect(report.topExpenses[1].rank).toBe(2);
      expect(report.topExpenses[1].amount).toBe(30000);
      expect(report.topExpenses[2].rank).toBe(3);
      expect(report.topExpenses[2].amount).toBe(10000);

      // Insight text mentions top category
      expect(report.insightText).toContain('مطاعم وأغذية');
      expect(report.insightText).toContain('70%');
    });

    it('filters top expenses when selectedCategoryId drilldown is active', () => {
      const transactions = [
        { id: 'tx-1', type: 'expense', amount: 50000, category_id: 'cat-1', account_id: 'acc-1', date: '2026-10-05', deleted_at: null },
        { id: 'tx-2', type: 'expense', amount: 80000, category_id: 'cat-2', account_id: 'acc-2', date: '2026-10-10', deleted_at: null },
        { id: 'tx-3', type: 'expense', amount: 20000, category_id: 'cat-1', account_id: 'acc-1', date: '2026-10-15', deleted_at: null }
      ];

      const drilldownReport = calculatePeriodicMetrics(transactions, mockCategories, mockAccounts, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        selectedCategoryId: 'cat-1'
      });

      // Top expenses should only contain cat-1 items, sorted
      expect(drilldownReport.topExpenses.length).toBe(2);
      expect(drilldownReport.topExpenses[0].amount).toBe(50000);
      expect(drilldownReport.topExpenses[1].amount).toBe(20000);
    });
  });

  describe('5. Timeline Cadence Building (Recharts Data Series)', () => {
    it('generates daily buckets when period is <= 31 days', () => {
      const transactions = [
        { type: 'expense', amount: 15000, date: '2026-10-02', deleted_at: null },
        { type: 'income', amount: 50000, date: '2026-10-02', deleted_at: null },
        { type: 'expense', amount: 20000, date: '2026-10-05', deleted_at: null }
      ];

      const buckets = buildTimelineCadence(transactions, '2026-10-01', '2026-10-07', 7);
      expect(buckets.length).toBe(7);

      const day2 = buckets.find((b) => b.date === '2026-10-02');
      expect(day2).toBeDefined();
      expect(day2.expense).toBe(150); // 15,000 minor units = 150 major
      expect(day2.income).toBe(500);
      expect(day2.net).toBe(350);

      const day5 = buckets.find((b) => b.date === '2026-10-05');
      expect(day5.expense).toBe(200);
    });

    it('generates monthly buckets when period is > 31 days', () => {
      const transactions = [
        { type: 'expense', amount: 100000, date: '2026-02-15', deleted_at: null },
        { type: 'income', amount: 300000, date: '2026-05-01', deleted_at: null }
      ];

      const buckets = buildTimelineCadence(transactions, '2026-01-01', '2026-12-31', 365);
      expect(buckets.length).toBe(12);

      const feb = buckets.find((b) => b.date === '2026-02');
      expect(feb.expense).toBe(1000);
      expect(feb.income).toBe(0);

      const may = buckets.find((b) => b.date === '2026-05');
      expect(may.income).toBe(3000);
    });
  });

  describe('6. Database Integration (loadPeriodicReport with Dexie)', () => {
    let testDb;

    beforeEach(async () => {
      testDb = new ExpenseDatabase(`reports_engine_test_${Date.now()}_${Math.random()}`);
      await testDb.open();
      await seedDefaultCategories(testDb, null);
    });

    afterEach(async () => {
      if (testDb) {
        await testDb.delete();
      }
    });

    it('loads and calculates periodic reports from live database', async () => {
      const categories = await getCategories(testDb, { includeDeleted: true });
      const foodCat = categories.find((c) => c.slug === 'cat_food');
      const salaryCat = categories.find((c) => c.slug === 'cat_salary');

      const acc = await createAccount(
        { name: 'البنك', type: 'bank', currency: 'SAR', initial_balance: 500000 },
        testDb
      );

      // Create transactions
      await createTransaction(
        {
          account_id: acc.id,
          category_id: foodCat.id,
          amount: 45000, // 450.00 SAR
          type: 'expense',
          date: '2026-10-10',
          notes: 'عشاء مع الأصدقاء'
        },
        testDb
      );

      await createTransaction(
        {
          account_id: acc.id,
          category_id: salaryCat.id,
          amount: 800000, // 8,000.00 SAR
          type: 'income',
          date: '2026-10-01',
          notes: 'راتب شهري'
        },
        testDb
      );

      const report = await loadPeriodicReport(testDb, {
        preset: 'this_month',
        referenceDate: '2026-10-25'
      });

      expect(report.metrics.totalExpense).toBe(45000);
      expect(report.metrics.totalIncome).toBe(800000);
      expect(report.metrics.netCashFlow).toBe(755000);
      expect(report.categoryBreakdown.length).toBe(1);
      expect(report.categoryBreakdown[0].categoryName).toBe(foodCat.name);
      expect(report.topExpenses.length).toBe(1);
      expect(report.topExpenses[0].notes).toBe('عشاء مع الأصدقاء');
    });
  });
});
