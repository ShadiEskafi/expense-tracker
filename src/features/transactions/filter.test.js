import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_FILTERS,
  filterTransactions,
  groupTransactionsByDate,
  computeFilteredSummary,
  getDatePresetRange,
  getActiveFiltersCount,
  normalizeArabicText,
  formatArabicDate
} from './filter.js';
import { ExpenseDatabase } from '../../db/db.js';
import { createAccount } from '../../services/account.js';
import { createTransaction } from '../../services/transaction.js';
import { createTransfer } from '../../services/transfer.js';
import { seedDefaultCategories } from '../../services/category.js';

describe('Transaction Ledger, Keyword Search & Multi-Filtering (F011)', () => {
  const referenceDate = new Date('2026-10-25T14:30:00Z'); // Sunday

  const mockTransactions = [
    {
      id: 'tx-1',
      type: 'expense',
      amount: 4500, // 45.00 SAR
      date: '2026-10-25', // Today
      category_id: 'cat-food',
      category: { id: 'cat-food', name: 'مطاعم ومقاهي' },
      account_id: 'acc-cash',
      account: { id: 'acc-cash', name: 'محفظة نقدية' },
      notes: 'غداء عمل مع الفريق',
      tags: ['عمل', 'مطاعم'],
      deleted_at: null,
      created_at: '2026-10-25T12:00:00Z'
    },
    {
      id: 'tx-2',
      type: 'expense',
      amount: 12000, // 120.00 SAR
      date: '2026-10-24', // Yesterday
      category_id: 'cat-groceries',
      category: { id: 'cat-groceries', name: 'بقالة ومواد تموينية' },
      account_id: 'acc-bank',
      account: { id: 'acc-bank', name: 'حساب الراجحي' },
      notes: 'شراء مقاضي المنزل الأسبوعية',
      tags: ['منزل', 'بقالة'],
      deleted_at: null,
      created_at: '2026-10-24T18:00:00Z'
    },
    {
      id: 'tx-3',
      type: 'income',
      amount: 1500000, // 15,000.00 SAR
      date: '2026-10-25', // Today
      category_id: 'cat-salary',
      category: { id: 'cat-salary', name: 'الراتب والدخل الأساسي' },
      account_id: 'acc-bank',
      account: { id: 'acc-bank', name: 'حساب الراجحي' },
      notes: 'إيداع راتب شهر أكتوبر',
      tags: ['راتب'],
      deleted_at: null,
      created_at: '2026-10-25T08:00:00Z'
    },
    {
      id: 'tx-4',
      type: 'transfer',
      amount: 50000, // 500.00 SAR
      date: '2026-10-20', // Earlier this month
      category_id: null,
      account_id: 'acc-bank',
      account: { id: 'acc-bank', name: 'حساب الراجحي' },
      destination_account_id: 'acc-cash',
      destinationAccount: { id: 'acc-cash', name: 'محفظة نقدية' },
      notes: 'سحب كاش من الصراف الآلي',
      tags: ['كاش', 'سحب'],
      deleted_at: null,
      created_at: '2026-10-20T10:00:00Z'
    },
    {
      id: 'tx-5',
      type: 'expense',
      amount: 35000, // 350.00 SAR
      date: '2026-09-15', // Last month
      category_id: 'cat-utilities',
      category: { id: 'cat-utilities', name: 'فواتير وخدمات' },
      account_id: 'acc-bank',
      account: { id: 'acc-bank', name: 'حساب الراجحي' },
      notes: 'فاتورة الكهرباء والإنترنت',
      tags: ['فواتير'],
      deleted_at: null,
      created_at: '2026-09-15T09:00:00Z'
    },
    {
      id: 'tx-deleted',
      type: 'expense',
      amount: 9900,
      date: '2026-10-25',
      category_id: 'cat-food',
      category: { id: 'cat-food', name: 'مطاعم ومقاهي' },
      account_id: 'acc-cash',
      account: { id: 'acc-cash', name: 'محفظة نقدية' },
      notes: 'معاملة محذوفة',
      tags: ['ملغى'],
      deleted_at: '2026-10-25T13:00:00Z',
      created_at: '2026-10-25T11:00:00Z'
    }
  ];

  describe('1. Text Search & Arabic Normalization', () => {
    it('normalizes Arabic characters (tashkeel, alef variants, taa marbuta, alef maqsura)', () => {
      expect(normalizeArabicText('مَطْعَمٌ')).toBe('مطعم');
      expect(normalizeArabicText('إِفْطَارٌ')).toBe('افطار');
      expect(normalizeArabicText('بقالة')).toBe('بقاله');
      expect(normalizeArabicText('مقهى')).toBe('مقهي');
    });

    it('matches transactions by notes substring regardless of diacritics', () => {
      const results = filterTransactions(mockTransactions, { search: 'غداء' }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-1');

      const withDiacritics = filterTransactions(mockTransactions, { search: 'غَدَاء' }, { referenceDate });
      expect(withDiacritics).toHaveLength(1);
      expect(withDiacritics[0].id).toBe('tx-1');
    });

    it('matches transactions by category name', () => {
      const results = filterTransactions(mockTransactions, { search: 'بقالة' }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-2');
    });

    it('matches transactions by account name', () => {
      const results = filterTransactions(mockTransactions, { search: 'الراجحي' }, { referenceDate });
      // tx-2 (bank), tx-3 (bank), tx-4 (bank source), tx-5 (bank)
      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it('matches transactions by tag', () => {
      const results = filterTransactions(mockTransactions, { search: 'سحب' }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-4');
    });

    it('returns empty array when search query matches nothing', () => {
      const results = filterTransactions(mockTransactions, { search: 'سيارة جديدة غير موجودة' }, { referenceDate });
      expect(results).toHaveLength(0);
    });
  });

  describe('2. Multi-Filtering (Type, Category, Account, Tags, Amount)', () => {
    it('excludes soft-deleted transactions by default (ADR-011)', () => {
      const results = filterTransactions(mockTransactions, {}, { referenceDate });
      expect(results.some((tx) => tx.id === 'tx-deleted')).toBe(false);
      expect(results).toHaveLength(5);
    });

    it('includes soft-deleted transactions when includeDeleted: true', () => {
      const results = filterTransactions(mockTransactions, { includeDeleted: true }, { referenceDate });
      expect(results.some((tx) => tx.id === 'tx-deleted')).toBe(true);
      expect(results).toHaveLength(6);
    });

    it('filters strictly by transaction type (expense)', () => {
      const results = filterTransactions(mockTransactions, { type: 'expense' }, { referenceDate });
      expect(results.every((tx) => tx.type === 'expense')).toBe(true);
      expect(results).toHaveLength(3); // tx-1, tx-2, tx-5
    });

    it('filters strictly by transaction type (income)', () => {
      const results = filterTransactions(mockTransactions, { type: 'income' }, { referenceDate });
      expect(results.every((tx) => tx.type === 'income')).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-3');
    });

    it('filters strictly by transaction type (transfer)', () => {
      const results = filterTransactions(mockTransactions, { type: 'transfer' }, { referenceDate });
      expect(results.every((tx) => tx.type === 'transfer')).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-4');
    });

    it('filters by category ID (single & multiple)', () => {
      const single = filterTransactions(mockTransactions, { categoryIds: ['cat-food'] }, { referenceDate });
      expect(single).toHaveLength(1);
      expect(single[0].id).toBe('tx-1');

      const multiple = filterTransactions(mockTransactions, { categoryIds: ['cat-food', 'cat-groceries'] }, { referenceDate });
      expect(multiple).toHaveLength(2);
      expect(multiple.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-2']);
    });

    it('filters by account ID matching either source or destination', () => {
      // acc-cash is source for tx-1, and destination for transfer tx-4
      const cashTx = filterTransactions(mockTransactions, { accountIds: ['acc-cash'] }, { referenceDate });
      expect(cashTx).toHaveLength(2);
      expect(cashTx.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-4']);
    });

    it('filters by tags array', () => {
      const results = filterTransactions(mockTransactions, { tags: ['عمل'] }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-1');
    });

    it('filters by amount bounds (minAmount & maxAmount)', () => {
      // Between 50.00 SAR (5000) and 200.00 SAR (20000)
      const results = filterTransactions(mockTransactions, { minAmount: 5000, maxAmount: 20000 }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-2'); // 12000
    });
  });

  describe('3. Date Range Presets & Formatting', () => {
    it('computes today preset accurately', () => {
      const range = getDatePresetRange('today', referenceDate);
      expect(range.startDate).toBe('2026-10-25');
      expect(range.endDate).toBe('2026-10-25');

      const results = filterTransactions(mockTransactions, { datePreset: 'today' }, { referenceDate });
      expect(results.map((t) => t.id).sort()).toEqual(['tx-1', 'tx-3']);
    });

    it('computes yesterday preset accurately', () => {
      const range = getDatePresetRange('yesterday', referenceDate);
      expect(range.startDate).toBe('2026-10-24');
      expect(range.endDate).toBe('2026-10-24');

      const results = filterTransactions(mockTransactions, { datePreset: 'yesterday' }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-2');
    });

    it('computes this_month preset accurately', () => {
      const range = getDatePresetRange('this_month', referenceDate);
      expect(range.startDate).toBe('2026-10-01');
      expect(range.endDate).toBe('2026-10-31');

      const results = filterTransactions(mockTransactions, { datePreset: 'this_month' }, { referenceDate });
      // tx-1 (10-25), tx-2 (10-24), tx-3 (10-25), tx-4 (10-20). tx-5 is 09-15.
      expect(results).toHaveLength(4);
    });

    it('computes last_month preset accurately', () => {
      const range = getDatePresetRange('last_month', referenceDate);
      expect(range.startDate).toBe('2026-09-01');
      expect(range.endDate).toBe('2026-09-30');

      const results = filterTransactions(mockTransactions, { datePreset: 'last_month' }, { referenceDate });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-5');
    });

    it('supports custom date range boundaries', () => {
      const results = filterTransactions(
        mockTransactions,
        { datePreset: 'custom', startDate: '2026-10-21', endDate: '2026-10-25' },
        { referenceDate }
      );
      // tx-1 (10-25), tx-2 (10-24), tx-3 (10-25)
      expect(results).toHaveLength(3);
    });

    it('formats ISO dates into readable Arabic strings', () => {
      expect(formatArabicDate('2026-10-25')).toBe('25 أكتوبر 2026');
      expect(formatArabicDate('2026-01-01')).toBe('1 يناير 2026');
    });
  });

  describe('4. Chronological Grouping & Daily Totals', () => {
    it('groups transactions by date in descending order (latest first)', () => {
      const nonDeleted = mockTransactions.filter((tx) => tx.deleted_at === null);
      const groups = groupTransactionsByDate(nonDeleted, referenceDate);

      expect(groups.length).toBe(4); // 2026-10-25, 2026-10-24, 2026-10-20, 2026-09-15

      // First group is Today
      expect(groups[0].date).toBe('2026-10-25');
      expect(groups[0].title).toBe('اليوم');
      expect(groups[0].isToday).toBe(true);
      expect(groups[0].isYesterday).toBe(false);
      expect(groups[0].transactions).toHaveLength(2);
      expect(groups[0].totalIncome).toBe(1500000);
      expect(groups[0].totalExpense).toBe(4500);
      expect(groups[0].net).toBe(1495500);

      // Second group is Yesterday
      expect(groups[1].date).toBe('2026-10-24');
      expect(groups[1].title).toBe('أمس');
      expect(groups[1].isToday).toBe(false);
      expect(groups[1].isYesterday).toBe(true);
      expect(groups[1].transactions).toHaveLength(1);
      expect(groups[1].totalExpense).toBe(12000);

      // Third group is 2026-10-20
      expect(groups[2].date).toBe('2026-10-20');
      expect(groups[2].title).toBe('20 أكتوبر 2026');
      expect(groups[2].isToday).toBe(false);
      expect(groups[2].isYesterday).toBe(false);
    });

    it('handles empty transaction arrays gracefully', () => {
      expect(groupTransactionsByDate([], referenceDate)).toEqual([]);
    });
  });

  describe('5. Filtered Summary Metrics & Invariants', () => {
    it('computes summary totals correctly for all non-deleted transactions', () => {
      const nonDeleted = mockTransactions.filter((tx) => tx.deleted_at === null);
      const summary = computeFilteredSummary(nonDeleted);

      // Incomes: tx-3 (1500000)
      expect(summary.totalIncome).toBe(1500000);

      // Expenses: tx-1 (4500) + tx-2 (12000) + tx-5 (35000) = 51500
      expect(summary.totalExpense).toBe(51500);

      // Net Cash Flow: 1500000 - 51500 = 1448500
      expect(summary.netCashFlow).toBe(1448500);

      // Counts
      expect(summary.totalCount).toBe(5);
      expect(summary.expenseCount).toBe(3);
      expect(summary.incomeCount).toBe(1);
      expect(summary.transferCount).toBe(1);
    });

    it('verifies transfers do not distort cash flow (ADR-004 & F007)', () => {
      const transferOnly = [mockTransactions[3]]; // tx-4 (transfer 50000)
      const summary = computeFilteredSummary(transferOnly);

      expect(summary.totalIncome).toBe(0);
      expect(summary.totalExpense).toBe(0);
      expect(summary.netCashFlow).toBe(0);
      expect(summary.transferCount).toBe(1);
      expect(summary.totalCount).toBe(1);
    });
  });

  describe('6. Active Filters Count & Reset', () => {
    it('returns 0 for default filters', () => {
      expect(getActiveFiltersCount(DEFAULT_FILTERS)).toBe(0);
    });

    it('counts active filters correctly', () => {
      const active = {
        ...DEFAULT_FILTERS,
        search: 'غداء',
        type: 'expense',
        categoryIds: ['cat-food', 'cat-groceries'],
        datePreset: 'this_month'
      };

      // 1 (search) + 1 (type) + 2 (categories) + 1 (datePreset) = 5
      expect(getActiveFiltersCount(active)).toBe(5);
    });
  });

  describe('7. Dexie Database Live Integration', () => {
    let testDb;

    beforeEach(async () => {
      testDb = new ExpenseDatabase('test-f011-db-' + Math.random().toString(36).substring(2, 9));
      await testDb.open();
      await seedDefaultCategories(testDb);
    });

    afterEach(async () => {
      if (testDb) {
        await testDb.delete();
      }
    });

    it('filters and groups live transactions created in Dexie', async () => {
      // 1. Create accounts
      const bank = await createAccount({ name: 'حساب بنكي', type: 'bank', initial_balance: 100000 }, testDb);
      const cash = await createAccount({ name: 'كاش', type: 'cash', initial_balance: 50000 }, testDb);

      const categories = await testDb.categories.toArray();
      const foodCat = categories.find((c) => c.slug === 'cat_food') || categories[0];
      const salaryCat = categories.find((c) => c.slug === 'cat_salary') || categories[1];

      // 2. Create transactions
      await createTransaction({
        type: 'expense',
        amount: 3000,
        date: '2026-10-25',
        account_id: cash.id,
        category_id: foodCat.id,
        notes: 'سندوتشات فطور'
      }, testDb);

      await createTransaction({
        type: 'income',
        amount: 250000,
        date: '2026-10-25',
        account_id: bank.id,
        category_id: salaryCat.id,
        notes: 'مكافأة إنجاز'
      }, testDb);

      await createTransfer({
        amount: 20000,
        date: '2026-10-24',
        account_id: bank.id,
        destination_account_id: cash.id,
        notes: 'تحويل للمصروفات النقدية'
      }, testDb);

      // 3. Query all from DB and filter
      const liveTxList = await testDb.transactions.toArray();
      expect(liveTxList).toHaveLength(3);

      const filteredExpenses = filterTransactions(liveTxList, { type: 'expense' }, { referenceDate: new Date('2026-10-25') });
      expect(filteredExpenses).toHaveLength(1);
      expect(filteredExpenses[0].amount).toBe(3000);

      const groups = groupTransactionsByDate(liveTxList, new Date('2026-10-25'));
      expect(groups.length).toBe(2);
      expect(groups[0].isToday).toBe(true);
      expect(groups[0].count).toBe(2);
      expect(groups[1].isYesterday).toBe(true);
      expect(groups[1].count).toBe(1);
    });
  });
});
