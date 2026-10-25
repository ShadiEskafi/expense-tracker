import { formatAmountNumber } from './dashboardUtils.js';
import { ArrowDownIcon, ArrowUpIcon } from '../common/Icons.jsx';

/**
 * Dashboard KPI Cards Widget
 * Renders the 5 primary financial health indicators:
 * 1. Net Financial Position (صافي المركز المالي)
 * 2. Available Liquid Funds (الأموال السائلة المتاحة)
 * 3. Total Liabilities & Debts (الالتزامات والديون)
 * 4. Current Month Expenses (مصاريف الشهر مع مقارنة الشهر السابق MoM)
 * 5. Current Month Income & Surplus (دخل الشهر وصافي الفائض)
 *
 * Adheres strictly to:
 * - design-system/data-visualization.md § 1
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function DashboardKpiCards({ metrics, currency = 'SAR' }) {
  if (!metrics) return null;

  const { financialPosition, cashFlow, monthOverMonth } = metrics;

  const netPosition = financialPosition?.netPosition ?? financialPosition?.netFinancialPosition ?? 0;
  const availableFunds = financialPosition?.availableFunds ?? 0;
  const totalLiabilities = financialPosition?.totalLiabilities ?? 0;
  const totalExpenses = cashFlow?.totalExpense ?? cashFlow?.totalExpenses ?? 0;
  const totalIncome = cashFlow?.totalIncome ?? 0;
  const netCashFlow = cashFlow?.netCashFlow ?? 0;

  const expensePctChange =
    monthOverMonth?.expenseDeltaPercentage ??
    monthOverMonth?.expensePercentageChange ??
    0;
  const isExpenseDecreased = expensePctChange < 0;
  const isExpenseIncreased = expensePctChange > 0;

  return (
    <section className="dashboard-kpi-grid" aria-label="مؤشرات المركز المالي الرئيسية">
      {/* 1. Net Financial Position (Hero Highlight) */}
      <div className="kpi-card kpi-card-hero" data-testid="kpi-net-position">
        <div className="kpi-header">
          <span className="kpi-label text-caption">صافي المركز المالي</span>
          <span className="kpi-tag text-micro">الوضع الكلي</span>
        </div>
        <div className="kpi-amount-row">
          <span className={`kpi-amount text-display financial-num ${netPosition < 0 ? 'color-expense' : ''}`}>
            {netPosition < 0 ? '-' : ''}{formatAmountNumber(netPosition, currency)}
          </span>
          <span className="kpi-currency text-body">{currency}</span>
        </div>
        <p className="kpi-subtitle text-caption">
          الأصول المتاحة مطروحاً منها الالتزامات ومستحقات البطاقات
        </p>
      </div>

      {/* 2. Available Liquid Funds */}
      <div className="kpi-card" data-testid="kpi-available-funds">
        <div className="kpi-header">
          <span className="kpi-label text-caption">الأموال السائلة المتاحة</span>
          <span className="kpi-badge-green text-micro">جاهز للصرف</span>
        </div>
        <div className="kpi-amount-row">
          <span className="kpi-amount text-h1 color-income financial-num">
            {formatAmountNumber(availableFunds, currency)}
          </span>
          <span className="kpi-currency text-caption">{currency}</span>
        </div>
        <p className="kpi-subtitle text-caption">
          كاش الحسابات الجارية والمحافظ الرقمية
        </p>
      </div>

      {/* 3. Total Liabilities & Debts */}
      <div className="kpi-card" data-testid="kpi-liabilities">
        <div className="kpi-header">
          <span className="kpi-label text-caption">الالتزامات والديون</span>
          {totalLiabilities > 0 ? (
            <span className="kpi-badge-amber text-micro">مستحق السداد</span>
          ) : (
            <span className="kpi-badge-neutral text-micro">لا توجد ديون</span>
          )}
        </div>
        <div className="kpi-amount-row">
          <span className="kpi-amount text-h1 color-liability financial-num">
            {totalLiabilities > 0 ? `-${formatAmountNumber(totalLiabilities, currency)}` : '0.00'}
          </span>
          <span className="kpi-currency text-caption">{currency}</span>
        </div>
        <p className="kpi-subtitle text-caption">
          مستحقات بطاقات الائتمان والالتزامات المؤجلة
        </p>
      </div>

      {/* 4. Current Month Expenses (with MoM Delta) */}
      <div className="kpi-card" data-testid="kpi-month-expenses">
        <div className="kpi-header">
          <span className="kpi-label text-caption">مصاريف الشهر الحالي</span>
          {isExpenseDecreased && (
            <span className="mom-delta-badge positive text-micro" title="انخفاض في المصاريف مقارنة بالشهر السابق (توفير إيجابي)">
              <ArrowDownIcon size={12} />
              <span>{Math.abs(expensePctChange)}%</span>
            </span>
          )}
          {isExpenseIncreased && (
            <span className="mom-delta-badge alert text-micro" title="ارتفاع في المصاريف مقارنة بالشهر السابق">
              <ArrowUpIcon size={12} />
              <span>+{expensePctChange}%</span>
            </span>
          )}
          {!isExpenseDecreased && !isExpenseIncreased && (
            <span className="mom-delta-badge neutral text-micro">0%</span>
          )}
        </div>
        <div className="kpi-amount-row">
          <span className="kpi-amount text-h1 color-expense financial-num">
            {formatAmountNumber(totalExpenses, currency)}
          </span>
          <span className="kpi-currency text-caption">{currency}</span>
        </div>
        <p className="kpi-subtitle text-caption">
          {isExpenseDecreased
            ? 'وفرت أكثر مقارنة بالشهر السابق'
            : isExpenseIncreased
            ? 'زيادة في الإنفاق مقارنة بالشهر السابق'
            : 'إنفاق متقارب مع الشهر السابق'}
        </p>
      </div>

      {/* 5. Current Month Income & Surplus */}
      <div className="kpi-card" data-testid="kpi-month-income">
        <div className="kpi-header">
          <span className="kpi-label text-caption">دخل الشهر الحالي</span>
          <span className={`kpi-badge-${netCashFlow >= 0 ? 'green' : 'amber'} text-micro`}>
            {netCashFlow >= 0 ? 'فائض نقدي' : 'عجز مؤقت'}
          </span>
        </div>
        <div className="kpi-amount-row">
          <span className="kpi-amount text-h1 color-income financial-num">
            {formatAmountNumber(totalIncome, currency)}
          </span>
          <span className="kpi-currency text-caption">{currency}</span>
        </div>
        <div className="kpi-surplus-row text-caption">
          <span>صافي الفائض: </span>
          <span className={`financial-num font-semibold ${netCashFlow >= 0 ? 'color-income' : 'color-expense'}`}>
            {netCashFlow >= 0 ? `+${formatAmountNumber(netCashFlow, currency)}` : `-${formatAmountNumber(Math.abs(netCashFlow), currency)}`} {currency}
          </span>
        </div>
      </div>
    </section>
  );
}
