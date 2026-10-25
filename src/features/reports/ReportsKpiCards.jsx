import {
  TrendingUpIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  WalletIcon
} from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';

/**
 * ReportsKpiCards (F012)
 * Displays 5 period-specific financial health KPI metrics:
 * 1. Total Expense (إجمالي المصاريف)
 * 2. Total Income (إجمالي الدخل)
 * 3. Net Cash Flow (صافي التدفق المالي)
 * 4. Daily Average Spend (متوسط الصرف اليومي)
 * 5. Savings Rate (معدل الادخار)
 *
 * References:
 * - design-system/screens.md § 8
 * - design-system/data-visualization.md § 1
 * - /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function ReportsKpiCards({ metrics, currency = 'SAR', daysInPeriod = 30 }) {
  const {
    totalExpense = 0,
    totalIncome = 0,
    netCashFlow = 0,
    dailyAverageExpense = 0,
    savingsRate = 0,
    expenseCount = 0,
    incomeCount = 0
  } = metrics || {};

  const isSurplus = netCashFlow >= 0;

  return (
    <div className="reports-kpi-grid" aria-label="مؤشرات الفترة المالية">
      {/* 1. Total Period Expenses */}
      <div className="reports-kpi-card expense-card" data-testid="kpi-total-expense">
        <div className="kpi-card-header">
          <span className="kpi-card-label">إجمالي المصاريف</span>
          <div className="kpi-card-icon-wrap" aria-hidden="true">
            <ArrowDownIcon size={18} />
          </div>
        </div>
        <div className="kpi-card-value text-h2 tnum">
          {formatCurrency(totalExpense, currency)}
        </div>
        <div className="kpi-card-footer">
          <span className="kpi-badge kpi-badge-negative">
            {`${expenseCount} ${expenseCount === 1 ? 'مصروف' : 'معاملات صرف'}`}
          </span>
        </div>
      </div>

      {/* 2. Total Period Income */}
      <div className="reports-kpi-card income-card" data-testid="kpi-total-income">
        <div className="kpi-card-header">
          <span className="kpi-card-label">إجمالي الدخل</span>
          <div className="kpi-card-icon-wrap" aria-hidden="true">
            <ArrowUpIcon size={18} />
          </div>
        </div>
        <div className="kpi-card-value text-h2 tnum">
          {formatCurrency(totalIncome, currency)}
        </div>
        <div className="kpi-card-footer">
          <span className="kpi-badge kpi-badge-positive">
            {`${incomeCount} ${incomeCount === 1 ? 'إيداع' : 'عمليات دخل'}`}
          </span>
        </div>
      </div>

      {/* 3. Net Period Cash Flow */}
      <div className="reports-kpi-card cashflow-card" data-testid="kpi-net-cashflow">
        <div className="kpi-card-header">
          <span className="kpi-card-label">صافي التدفق المالي</span>
          <div className="kpi-card-icon-wrap" aria-hidden="true">
            <TrendingUpIcon size={18} />
          </div>
        </div>
        <div className="kpi-card-value text-h2 tnum">
          {formatCurrency(netCashFlow, currency)}
        </div>
        <div className="kpi-card-footer">
          <span
            className={`kpi-badge ${
              isSurplus ? 'kpi-badge-positive' : 'kpi-badge-negative'
            }`}
          >
            {isSurplus ? 'فائض مالي +' : 'عجز في الميزانية -'}
          </span>
        </div>
      </div>

      {/* 4. Daily Average Spend */}
      <div className="reports-kpi-card daily-card" data-testid="kpi-daily-average">
        <div className="kpi-card-header">
          <span className="kpi-card-label">متوسط الصرف اليومي</span>
          <div className="kpi-card-icon-wrap" aria-hidden="true">
            <CalendarIcon size={18} />
          </div>
        </div>
        <div className="kpi-card-value text-h2 tnum">
          {formatCurrency(dailyAverageExpense, currency)}
        </div>
        <div className="kpi-card-footer">
          <span className="kpi-badge kpi-badge-neutral">
            {`موزع على ${daysInPeriod} ${daysInPeriod <= 10 && daysInPeriod >= 3 ? 'أيام' : 'يوم'}`}
          </span>
        </div>
      </div>

      {/* 5. Savings Rate */}
      <div className="reports-kpi-card" data-testid="kpi-savings-rate">
        <div className="kpi-card-header">
          <span className="kpi-card-label">معدل الادخار</span>
          <div className="kpi-card-icon-wrap" aria-hidden="true">
            <WalletIcon size={18} />
          </div>
        </div>
        <div className="kpi-card-value text-h2 tnum">
          {`${savingsRate}%`}
        </div>
        <div className="kpi-card-footer">
          <span
            className={`kpi-badge ${
              savingsRate >= 20
                ? 'kpi-badge-positive'
                : savingsRate > 0
                ? 'kpi-badge-neutral'
                : 'kpi-badge-negative'
            }`}
          >
            {savingsRate >= 20 ? 'ادخار ممتاز' : savingsRate > 0 ? 'ادخار معتدل' : 'لا يوجد ادخار'}
          </span>
        </div>
      </div>
    </div>
  );
}
