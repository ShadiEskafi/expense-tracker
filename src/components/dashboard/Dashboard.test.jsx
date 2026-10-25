import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import { seedDefaultCategories, getCategories } from '../../services/category.js';
import { createAccount } from '../../services/account.js';
import { createTransaction } from '../../services/transaction.js';
import { createTransfer } from '../../services/transfer.js';
import { getDashboardData } from '../../services/dashboardAnalytics.js';
import { DashboardKpiCards } from './DashboardKpiCards.jsx';
import { AccountBalanceCards } from './AccountBalanceCards.jsx';
import { CategoryBreakdownChart } from './CategoryBreakdownChart.jsx';
import { CashFlowTrendChart } from './CashFlowTrendChart.jsx';
import { RecentTransactionsWidget } from './RecentTransactionsWidget.jsx';
import { DashboardBanner } from './DashboardBanner.jsx';
import { Dashboard } from './Dashboard.jsx';

describe('F010: Dashboard Financial Overview & Analytics Widgets', () => {
  let testDb;
  let cashAccount;
  let bankAccount;
  let creditCardAccount;
  let foodCategory;
  let salaryCategory;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`dashboard_component_test_${Date.now()}_${Math.random()}`);
    await seedDefaultCategories(testDb, null);

    const categories = await getCategories(testDb, { includeDeleted: true });
    foodCategory = categories.find((c) => c.slug === 'cat_food');
    salaryCategory = categories.find((c) => c.slug === 'cat_salary');

    cashAccount = await createAccount(
      {
        name: 'نقدية المحفظة',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 100000 // 1,000.00 SAR
      },
      testDb
    );

    bankAccount = await createAccount(
      {
        name: 'الحساب الجاري',
        type: 'bank',
        currency: 'SAR',
        initial_balance: 1400000 // 14,000.00 SAR
      },
      testDb
    );

    creditCardAccount = await createAccount(
      {
        name: 'بطاقة الائتمان',
        type: 'credit_card',
        currency: 'SAR',
        initial_balance: 0
      },
      testDb
    );
  });

  describe('1. Dashboard KPI Cards (Financial Health Indicators)', () => {
    it('renders all 5 KPI cards with formatted figures and Arabic labels', async () => {
      // Add income and expense
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          amount: 2000000, // 20,000.00 SAR
          type: 'income',
          date: '2026-10-01'
        },
        testDb
      );

      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 50000, // 500.00 SAR
          type: 'expense',
          date: '2026-10-05'
        },
        testDb
      );

      // Charge credit card 300.00 SAR (liability)
      await createTransaction(
        {
          account_id: creditCardAccount.id,
          category_id: foodCategory.id,
          amount: 30000, // 300.00 SAR
          type: 'expense',
          date: '2026-10-08'
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <DashboardKpiCards metrics={data.metrics} currency={data.currency} />
      );

      // 1. Net Position
      expect(html).toContain('صافي المركز المالي');
      expect(html).toContain('34,200.00'); // (1000 - 500) + (14000 + 20000) - 300 = 34,200

      // 2. Available Funds
      expect(html).toContain('الأموال السائلة المتاحة');
      expect(html).toContain('34,500.00'); // 500 cash + 34,000 bank

      // 3. Liabilities
      expect(html).toContain('الالتزامات والديون');
      expect(html).toContain('مستحق السداد');
      expect(html).toContain('-300.00');

      // 4. Month Expenses
      expect(html).toContain('مصاريف الشهر الحالي');
      expect(html).toContain('800.00'); // 500 + 300

      // 5. Month Income & Surplus
      expect(html).toContain('دخل الشهر الحالي');
      expect(html).toContain('20,000.00');
      expect(html).toContain('صافي الفائض:');
      expect(html).toContain('+19,200.00');
    });

    it('renders negative net position with alert class when liabilities exceed assets', () => {
      const mockMetrics = {
        financialPosition: {
          netPosition: -500000, // -5,000.00 SAR
          availableFunds: 100000,
          totalLiabilities: 600000
        },
        cashFlow: {
          totalExpenses: 600000,
          totalIncome: 100000,
          netCashFlow: -500000
        },
        monthOverMonth: {
          expensePercentageChange: 25.0
        }
      };

      const html = renderToString(
        <DashboardKpiCards metrics={mockMetrics} currency="SAR" />
      );

      expect(html).toContain('-5,000.00');
      expect(html).toContain('color-expense');
      expect(html).toContain('عجز مؤقت');
    });
  });

  describe('2. Account Balance Cards Widget', () => {
    it('renders individual account cards with types, names, and ledger balances', async () => {
      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <AccountBalanceCards
          accounts={data.accounts}
          currency={data.currency}
          onNavigateAccounts={vi.fn()}
        />
      );

      expect(html).toContain('المحافظ والحسابات');
      expect(html).toContain('نقدية المحفظة');
      expect(html).toContain('الحساب الجاري');
      expect(html).toContain('بطاقة الائتمان');
      expect(html).toContain('نقدية (كاش)');
      expect(html).toContain('حساب بنكي');
      expect(html).toContain('بطاقة ائتمان');
      expect(html).toContain('1,000.00');
      expect(html).toContain('14,000.00');
      expect(html).toContain('إدارة الحسابات');
    });

    it('shows liability badge for credit card account when debt is present', async () => {
      // Charge credit card
      await createTransaction(
        {
          account_id: creditCardAccount.id,
          category_id: foodCategory.id,
          amount: 75000, // 750.00 SAR
          type: 'expense',
          date: '2026-10-10'
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <AccountBalanceCards
          accounts={data.accounts}
          currency={data.currency}
        />
      );

      expect(html).toContain('750.00');
      expect(html).toContain('مستحق السداد');
    });

    it('renders empty state when accounts list is empty', () => {
      const html = renderToString(
        <AccountBalanceCards accounts={[]} currency="SAR" onOpenQuickAdd={vi.fn()} />
      );

      expect(html).toContain('لا توجد حسابات مضافة حتى الآن');
      expect(html).toContain('إضافة أول عملية');
    });
  });

  describe('3. Category Spending Breakdown Widget (Donut & Accessible Table)', () => {
    it('renders accessible fallback table with category names, amounts, and percentages', async () => {
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          amount: 25000, // 250.00 SAR
          type: 'expense',
          date: '2026-10-12'
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <CategoryBreakdownChart
          breakdown={data.categoryBreakdown}
          currency={data.currency}
        />
      );

      expect(html).toContain('توزيع المصاريف حسب التصنيف');
      expect(html).toContain('طعام ومطاعم');
      expect(html).toContain('250.00');
      expect(html).toContain('100%');
      expect(html).toContain('جدول تفصيلي لتوزيع المصاريف');
    });

    it('renders encouraging empty state when no expenses exist for the month', () => {
      const emptyBreakdown = {
        month: '2026-10',
        totalExpense: 0,
        categoryCount: 0,
        items: []
      };

      const html = renderToString(
        <CategoryBreakdownChart
          breakdown={emptyBreakdown}
          currency="SAR"
          onOpenQuickAdd={vi.fn()}
        />
      );

      expect(html).toContain('لا توجد مصاريف مسجلة لهذا الشهر بعد');
      expect(html).toContain('تسجيل أول مصروف');
    });
  });

  describe('4. Cash Flow Trend Chart Widget (Grouped Bar & Accessible Table)', () => {
    it('renders weekly breakdown rows and totals in accessible table', async () => {
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          amount: 1000000, // 10,000.00 SAR
          type: 'income',
          date: '2026-10-02' // Week 1
        },
        testDb
      );

      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 20000, // 200.00 SAR
          type: 'expense',
          date: '2026-10-15' // Week 3
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <CashFlowTrendChart trend={data.cashFlowTrend} currency={data.currency} />
      );

      expect(html).toContain('اتجاه التدفق النقدي');
      expect(html).toContain('الأسبوع 1');
      expect(html).toContain('+10,000.00');
      expect(html).toContain('الأسبوع 3');
      expect(html).toContain('-200.00');
      expect(html).toContain('المجموع الشهري');
      expect(html).toContain('+9,800.00');
    });

    it('renders encouraging empty state when no cash flow exists', () => {
      const emptyTrend = {
        month: '2026-10',
        weeks: [],
        totals: { income: 0, expense: 0, net: 0 }
      };

      const html = renderToString(
        <CashFlowTrendChart trend={emptyTrend} currency="SAR" onOpenQuickAdd={vi.fn()} />
      );

      expect(html).toContain('لا توجد تدفقات نقدية مسجلة لهذا الشهر بعد');
      expect(html).toContain('تسجيل معاملة جديدة');
    });
  });

  describe('5. Recent Transactions Widget', () => {
    it('renders latest 5 transactions with proper formatting and signs', async () => {
      // 1. Expense
      await createTransaction(
        {
          account_id: cashAccount.id,
          category_id: foodCategory.id,
          amount: 4500, // 45.00 SAR
          type: 'expense',
          date: '2026-10-22',
          notes: 'قهوة صباحية'
        },
        testDb
      );

      // 2. Income
      await createTransaction(
        {
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          amount: 800000, // 8,000.00 SAR
          type: 'income',
          date: '2026-10-23',
          notes: 'دفعة مشروع'
        },
        testDb
      );

      // 3. Transfer
      await createTransfer(
        {
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          amount: 15000, // 150.00 SAR
          date: '2026-10-24',
          notes: 'سحب كاش'
        },
        testDb
      );

      const data = await getDashboardData(testDb, { month: '2026-10' });

      const html = renderToString(
        <RecentTransactionsWidget
          transactions={data.recentTransactions}
          currency={data.currency}
          onNavigateTransactions={vi.fn()}
        />
      );

      expect(html).toContain('آخر المعاملات المسجلة');
      expect(html).toContain('سحب كاش');
      expect(html).toContain('150.00');
      expect(html).toContain('↔');
      expect(html).toContain('دفعة مشروع');
      expect(html).toContain('8,000.00');
      expect(html).toContain('+');
      expect(html).toContain('قهوة صباحية');
      expect(html).toContain('45.00');
      expect(html).toContain('-');
      expect(html).toContain('عرض الكل');
    });

    it('renders empty state when no transactions exist', () => {
      const html = renderToString(
        <RecentTransactionsWidget transactions={[]} currency="SAR" onOpenQuickAdd={vi.fn()} />
      );

      expect(html).toContain('لا توجد معاملات مسجلة حتى الآن');
      expect(html).toContain('تسجيل أول معاملة');
    });
  });

  describe('6. Welcome FTUX Banner Widget', () => {
    it('renders title, description, and action button', () => {
      const onOpenQuickAdd = vi.fn();
      const html = renderToString(<DashboardBanner onOpenQuickAdd={onOpenQuickAdd} />);

      expect(html).toContain('جاهز لإدارة مصاريفك بكل ثقة؟');
      expect(html).toContain('تطبيق مَصاريفي يعمل بكامل طاقته محلياً');
      expect(html).toContain('تسجيل معاملة سريعة');
    });
  });

  describe('7. Full Dashboard Component', () => {
    it('renders loading skeleton while fetching data', () => {
      const html = renderToString(
        <Dashboard database={testDb} onOpenQuickAdd={vi.fn()} />
      );

      // Initial SSR render starts with loading state
      expect(html).toContain('dashboard-loading-skeleton');
    });
  });
});
