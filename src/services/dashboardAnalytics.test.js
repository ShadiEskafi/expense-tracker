import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../db/db.js';
import { seedDefaultCategories, getCategories } from './category.js';
import { createAccount } from './account.js';
import { createTransaction } from './transaction.js';
import { createTransfer } from './transfer.js';
import {
  getCurrentYearMonth,
  getCategorySpendingBreakdown,
  getCashFlowTrendAnalytics,
  getDashboardData
} from './dashboardAnalytics.js';

describe('Dashboard Analytics & Aggregation Engine (F010)', () => {
  let testDb;
  let cashAccount;
  let bankAccount;
  let foodCategory;
  let groceriesCategory;
  let transportCategory;
  let shoppingCategory;
  let housingCategory;
  let entertainmentCategory;
  let salaryCategory;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`dashboard_test_${Date.now()}_${Math.random()}`);
    await seedDefaultCategories(testDb, null);

    const categories = await getCategories(testDb, { includeDeleted: true });
    foodCategory = categories.find((c) => c.slug === 'cat_food');
    groceriesCategory = categories.find((c) => c.slug === 'cat_groceries');
    transportCategory = categories.find((c) => c.slug === 'cat_transport');
    shoppingCategory = categories.find((c) => c.slug === 'cat_shopping');
    housingCategory = categories.find((c) => c.slug === 'cat_housing');
    entertainmentCategory = categories.find((c) => c.slug === 'cat_entertainment');
    salaryCategory = categories.find((c) => c.slug === 'cat_salary');

    cashAccount = await createAccount(
      {
        name: 'نقدية المحفظة',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 50000 // 500.00 SAR
      },
      testDb
    );

    bankAccount = await createAccount(
      {
        name: 'الحساب الجاري',
        type: 'bank',
        currency: 'SAR',
        initial_balance: 1500000 // 15,000.00 SAR
      },
      testDb
    );
  });

  describe('1. getCurrentYearMonth Helper', () => {
    it('returns current month in YYYY-MM format', () => {
      const ym = getCurrentYearMonth();
      expect(ym).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('2. Category Spending Breakdown Analytics', () => {
    it('returns empty structure when no expenses exist for month', async () => {
      const breakdown = await getCategorySpendingBreakdown(testDb, { month: '2026-10' });
      expect(breakdown.month).toBe('2026-10');
      expect(breakdown.totalExpense).toBe(0);
      expect(breakdown.categoryCount).toBe(0);
      expect(breakdown.items).toEqual([]);
    });

    it('aggregates expenses by category and computes correct percentages', async () => {
      // 1. Food: 300.00 SAR (30000)
      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 30000,
          type: 'expense',
          date: '2026-10-05'
        },
        testDb
      );

      // 2. Food: 100.00 SAR (10000) -> Total Food = 40000
      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 10000,
          type: 'expense',
          date: '2026-10-10'
        },
        testDb
      );

      // 3. Groceries: 600.00 SAR (60000)
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: groceriesCategory.id,
          amount: 60000,
          type: 'expense',
          date: '2026-10-12'
        },
        testDb
      );

      // Total expense = 100,000 cents (1,000.00 SAR)
      const breakdown = await getCategorySpendingBreakdown(testDb, { month: '2026-10' });

      expect(breakdown.totalExpense).toBe(100000);
      expect(breakdown.categoryCount).toBe(2);
      expect(breakdown.items).toHaveLength(2);

      // Groceries: 60,000 (60.0%)
      const groceries = breakdown.items[0];
      expect(groceries.categoryId).toBe(groceriesCategory.id);
      expect(groceries.categoryName).toBe('بقالة وسوبرماركت');
      expect(groceries.amount).toBe(60000);
      expect(groceries.percentage).toBe(60.0);
      expect(groceries.transactionCount).toBe(1);

      // Food: 40,000 (40.0%)
      const food = breakdown.items[1];
      expect(food.categoryId).toBe(foodCategory.id);
      expect(food.categoryName).toBe('طعام ومطاعم');
      expect(food.amount).toBe(40000);
      expect(food.percentage).toBe(40.0);
      expect(food.transactionCount).toBe(2);
    });

    it('groups categories beyond top 5 into "أخرى" (Other)', async () => {
      // Create 6 different categories with varying amounts
      const expenseList = [
        { cat: foodCategory, amount: 60000 }, // 1
        { cat: groceriesCategory, amount: 50000 }, // 2
        { cat: transportCategory, amount: 40000 }, // 3
        { cat: shoppingCategory, amount: 30000 }, // 4
        { cat: housingCategory, amount: 20000 }, // 5
        { cat: entertainmentCategory, amount: 10000 } // 6 (should be in 'other')
      ];

      for (const item of expenseList) {
        await createTransaction(
          {
            account_id: cashAccount.id,
            category_id: item.cat.id,
            amount: item.amount,
            type: 'expense',
            date: '2026-10-15'
          },
          testDb
        );
      }

      const total = 60000 + 50000 + 40000 + 30000 + 20000 + 10000; // 210,000
      const breakdown = await getCategorySpendingBreakdown(testDb, { month: '2026-10' });

      expect(breakdown.totalExpense).toBe(total);
      expect(breakdown.categoryCount).toBe(6);
      expect(breakdown.items).toHaveLength(6); // 5 individual + 1 'other'

      // Top 5 items are in descending order
      expect(breakdown.items[0].categoryId).toBe(foodCategory.id);
      expect(breakdown.items[1].categoryId).toBe(groceriesCategory.id);
      expect(breakdown.items[2].categoryId).toBe(transportCategory.id);
      expect(breakdown.items[3].categoryId).toBe(shoppingCategory.id);
      expect(breakdown.items[4].categoryId).toBe(housingCategory.id);

      // 6th item is 'other'
      const otherItem = breakdown.items[5];
      expect(otherItem.categoryId).toBe('other');
      expect(otherItem.categoryName).toBe('أخرى');
      expect(otherItem.amount).toBe(10000);
      expect(otherItem.percentage).toBe(Math.round((10000 / total) * 1000) / 10);
      expect(otherItem.transactionCount).toBe(1);
    });
  });

  describe('3. Cash Flow Trend Analytics (Weekly Distribution)', () => {
    it('divides month into weeks and calculates income, expense, and net correctly', async () => {
      // Week 1 (Oct 3): Income 5,000.00 SAR
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          amount: 500000,
          type: 'income',
          date: '2026-10-03'
        },
        testDb
      );

      // Week 1 (Oct 5): Expense 500.00 SAR
      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 50000,
          type: 'expense',
          date: '2026-10-05'
        },
        testDb
      );

      // Week 2 (Oct 10): Expense 300.00 SAR
      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 30000,
          type: 'expense',
          date: '2026-10-10'
        },
        testDb
      );

      const trend = await getCashFlowTrendAnalytics(testDb, { month: '2026-10' });

      expect(trend.month).toBe('2026-10');
      expect(trend.weeks).toHaveLength(5); // October has 31 days -> 5 weeks

      // Week 1
      const w1 = trend.weeks[0];
      expect(w1.weekLabel).toBe('الأسبوع 1');
      expect(w1.dateRange).toBe('1 - 7');
      expect(w1.income).toBe(500000);
      expect(w1.expense).toBe(50000);
      expect(w1.net).toBe(450000);

      // Week 2
      const w2 = trend.weeks[1];
      expect(w2.weekLabel).toBe('الأسبوع 2');
      expect(w2.income).toBe(0);
      expect(w2.expense).toBe(30000);
      expect(w2.net).toBe(-30000);

      // Totals
      expect(trend.totals.income).toBe(500000);
      expect(trend.totals.expense).toBe(80000);
      expect(trend.totals.net).toBe(420000);
    });
  });

  describe('4. Full Dashboard Aggregation (getDashboardData)', () => {
    it('seeds defaults and aggregates all subsystems into unified payload', async () => {
      // Empty fresh DB to test auto-seeding
      const freshDb = new ExpenseDatabase(`fresh_db_${Date.now()}`);

      const data = await getDashboardData(freshDb, { month: '2026-10' });

      // Verify auto-seeding
      expect(data.accounts.length).toBeGreaterThanOrEqual(2);
      expect(data.currency).toBe('SAR');

      // Verify structure
      expect(data.metrics).toBeDefined();
      expect(data.metrics.financialPosition).toBeDefined();
      expect(data.metrics.cashFlow).toBeDefined();
      expect(data.categoryBreakdown).toBeDefined();
      expect(data.cashFlowTrend).toBeDefined();
      expect(data.recentTransactions).toBeDefined();
      expect(Array.isArray(data.recentTransactions)).toBe(true);
    });

    it('enriches recent transactions with category and account metadata', async () => {
      // Add a transaction
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          amount: 15000,
          type: 'expense',
          date: '2026-10-20',
          notes: 'عشاء عمل'
        },
        testDb
      );

      // Add a transfer
      await createTransfer(
        {
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          amount: 20000,
          date: '2026-10-21',
          notes: 'سحب كاش من الصراف'
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      expect(data.recentTransactions).toHaveLength(2);

      // Latest is the transfer
      const txTransfer = data.recentTransactions[0];
      expect(txTransfer.type).toBe('transfer');
      expect(txTransfer.categoryName).toBe('تحويل مالي');
      expect(txTransfer.accountName).toBe('الحساب الجاري');
      expect(txTransfer.destinationAccountName).toBe('نقدية المحفظة');

      // Second is the expense
      const txExpense = data.recentTransactions[1];
      expect(txExpense.type).toBe('expense');
      expect(txExpense.categoryName).toBe('طعام ومطاعم');
      expect(txExpense.accountName).toBe('الحساب الجاري');
      expect(txExpense.notes).toBe('عشاء عمل');
    });
  });
});
