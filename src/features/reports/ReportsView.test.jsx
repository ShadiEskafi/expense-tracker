import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import { ReportsView } from './ReportsView.jsx';
import { ReportsKpiCards } from './ReportsKpiCards.jsx';
import { ReportsCategoryBreakdown } from './ReportsCategoryBreakdown.jsx';
import { ReportsSpendingCadence } from './ReportsSpendingCadence.jsx';
import { ReportsTopExpenses } from './ReportsTopExpenses.jsx';
import { ReportsPeriodControls } from './ReportsPeriodControls.jsx';
import { seedDefaultCategories } from '../../services/category.js';

describe('Reports & Analytics Component Tests (F012)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`reports_view_test_${Date.now()}_${Math.random()}`);
    await testDb.open();
    await seedDefaultCategories(testDb, null);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('1. ReportsView Layout & Shell Rendering', () => {
    it('renders the Reports view title and subtitle', () => {
      const html = renderToString(<ReportsView database={testDb} />);
      expect(html).toContain('التقارير والتحليلات المالية');
      expect(html).toContain('تحليل معمق لعادات الإنفاق');
    });

    it('renders all 4 period presets in the toolbar', () => {
      const html = renderToString(<ReportsView database={testDb} />);
      expect(html).toContain('هذا الأسبوع');
      expect(html).toContain('هذا الشهر');
      expect(html).toContain('هذا العام');
      expect(html).toContain('فترة مخصصة');
    });

    it('renders empty state when no transactions exist in the period', () => {
      const html = renderToString(<ReportsView database={testDb} />);
      expect(html).toContain('لا توجد معاملات مسجلة في هذه الفترة');
    });
  });

  describe('2. ReportsKpiCards Rendering', () => {
    it('renders all 5 KPI cards with formatted figures and badges', () => {
      const metrics = {
        totalExpense: 125000, // 1,250.00 SAR
        totalIncome: 350000,  // 3,500.00 SAR
        netCashFlow: 225000,  // +2,250.00 SAR
        dailyAverageExpense: 4032, // 40.32 SAR
        savingsRate: 64.3,
        expenseCount: 4,
        incomeCount: 1
      };

      const html = renderToString(
        <ReportsKpiCards metrics={metrics} currency="SAR" daysInPeriod={31} />
      );

      // Total expense
      expect(html).toContain('إجمالي المصاريف');
      expect(html).toContain('1,250.00');
      expect(html).toContain('معاملات صرف');

      // Total income
      expect(html).toContain('إجمالي الدخل');
      expect(html).toContain('3,500.00');
      expect(html).toContain('إيداع');

      // Net cash flow
      expect(html).toContain('صافي التدفق المالي');
      expect(html).toContain('2,250.00');
      expect(html).toContain('فائض مالي +');

      // Daily average
      expect(html).toContain('متوسط الصرف اليومي');
      expect(html).toContain('40.32');
      expect(html).toContain('موزع على 31 يوم');

      // Savings rate
      expect(html).toContain('معدل الادخار');
      expect(html).toContain('64.3%');
      expect(html).toContain('ادخار ممتاز');
    });

    it('renders deficit badge when net cash flow is negative', () => {
      const metrics = {
        totalExpense: 50000,
        totalIncome: 20000,
        netCashFlow: -30000,
        dailyAverageExpense: 1613,
        savingsRate: 0,
        expenseCount: 2,
        incomeCount: 1
      };

      const html = renderToString(
        <ReportsKpiCards metrics={metrics} currency="SAR" daysInPeriod={31} />
      );

      expect(html).toContain('عجز في الميزانية -');
      expect(html).toContain('لا يوجد ادخار');
    });
  });

  describe('3. ReportsCategoryBreakdown Rendering', () => {
    it('renders category chips, accessible table, and progress bars', () => {
      const categories = [
        {
          categoryId: 'cat-food',
          categoryName: 'مطاعم وأغذية',
          color: '#EF4444',
          icon: 'utensils',
          amount: 80000,
          percentage: 80,
          transactionCount: 3
        },
        {
          categoryId: 'cat-shop',
          categoryName: 'تسوق',
          color: '#3B82F6',
          icon: 'shopping-bag',
          amount: 20000,
          percentage: 20,
          transactionCount: 1
        }
      ];

      const html = renderToString(
        <ReportsCategoryBreakdown
          categoryBreakdown={categories}
          totalExpense={100000}
          currency="SAR"
          selectedCategoryId={null}
        />
      );

      expect(html).toContain('توزيع المصاريف حسب التصنيف');
      expect(html).toContain('كل التصنيفات');
      expect(html).toContain('مطاعم وأغذية');
      expect(html).toContain('80%');
      expect(html).toContain('800.00');
      expect(html).toContain('تسوق');
      expect(html).toContain('20%');
      expect(html).toContain('200.00');
      expect(html).toContain('a11y-breakdown-table');
    });
  });

  describe('4. ReportsSpendingCadence Rendering', () => {
    it('renders timeline title, legend, and accessible table', () => {
      const timelineData = [
        { key: '2026-10-01', date: '2026-10-01', label: 'الخميس 1', shortLabel: '1/10', income: 1000, expense: 200, net: 800 },
        { key: '2026-10-02', date: '2026-10-02', label: 'الجمعة 2', shortLabel: '2/10', income: 0, expense: 150, net: -150 }
      ];

      const html = renderToString(
        <ReportsSpendingCadence
          timelineData={timelineData}
          currency="SAR"
          daysInPeriod={31}
        />
      );

      expect(html).toContain('النسق الزمني للصرف والدخل');
      expect(html).toContain('الدخل');
      expect(html).toContain('المصروف');
      expect(html).toContain('الخميس 1');
      expect(html).toContain('الجمعة 2');
    });
  });

  describe('5. ReportsTopExpenses Rendering', () => {
    it('renders ranked top expenses with rank badges, metadata, and amounts', () => {
      const topExpenses = [
        {
          rank: 1,
          id: 'tx-1',
          amount: 150000,
          date: '2026-10-12',
          notes: 'شراء هاتف محمول',
          description: 'شراء هاتف محمول',
          categoryId: 'cat-shop',
          categoryName: 'إلكترونيات',
          categoryColor: '#3B82F6',
          categoryIcon: 'shopping-bag',
          accountId: 'acc-bank',
          accountName: 'البنك التجاري'
        },
        {
          rank: 2,
          id: 'tx-2',
          amount: 45000,
          date: '2026-10-15',
          notes: 'عشاء فاخر',
          description: 'عشاء فاخر',
          categoryId: 'cat-food',
          categoryName: 'مطاعم',
          categoryColor: '#EF4444',
          categoryIcon: 'utensils',
          accountId: 'acc-cash',
          accountName: 'نقدية'
        }
      ];

      const html = renderToString(
        <ReportsTopExpenses
          topExpenses={topExpenses}
          currency="SAR"
          selectedCategoryId={null}
        />
      );

      expect(html).toContain('أعلى المصاريف الفردية');
      expect(html).toContain('شراء هاتف محمول');
      expect(html).toContain('1,500.00');
      expect(html).toContain('عشاء فاخر');
      expect(html).toContain('450.00');
      expect(html).toContain('البنك التجاري');
      expect(html).toContain('نقدية');
    });

    it('renders drilldown indicator when selectedCategoryId is present', () => {
      const html = renderToString(
        <ReportsTopExpenses
          topExpenses={[]}
          currency="SAR"
          selectedCategoryId="cat-food"
          selectedCategoryName="مطاعم وأغذية"
        />
      );

      expect(html).toContain('تصفية أعلى المصاريف حسب تصنيف:');
      expect(html).toContain('مطاعم وأغذية');
    });
  });

  describe('6. ReportsPeriodControls Rendering', () => {
    it('renders controls with period headline', () => {
      const html = renderToString(
        <ReportsPeriodControls
          preset="this_month"
          onSelectPreset={() => {}}
          startDate="2026-10-01"
          endDate="2026-10-31"
          onNavigatePeriod={() => {}}
          onResetToCurrent={() => {}}
          isNavigatedAway={false}
        />
      );

      expect(html).toContain('شهر أكتوبر 2026');
      expect(html).toContain('الفترة السابقة');
      expect(html).toContain('الفترة التالية');
    });

    it('renders custom date inputs when preset is custom', () => {
      const html = renderToString(
        <ReportsPeriodControls
          preset="custom"
          onSelectPreset={() => {}}
          startDate="2026-10-05"
          endDate="2026-10-20"
          customStartDate="2026-10-05"
          customEndDate="2026-10-20"
          onNavigatePeriod={() => {}}
          onResetToCurrent={() => {}}
          isNavigatedAway={false}
        />
      );

      expect(html).toContain('من تاريخ:');
      expect(html).toContain('إلى تاريخ:');
      expect(html).toContain('تطبيق النطاق');
    });
  });
});
