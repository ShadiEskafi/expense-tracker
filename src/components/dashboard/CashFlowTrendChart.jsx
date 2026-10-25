import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { formatAmountNumber } from './dashboardUtils.js';
import { LineChartIcon, PlusIcon } from '../common/Icons.jsx';

/**
 * Custom Tooltip for Cash Flow Grouped Bar Chart
 */
function CashFlowCustomTooltip({ active, payload, label, currency }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const net = data.rawIncome - data.rawExpense;

    return (
      <div className="chart-tooltip surface-card">
        <div className="tooltip-header">
          <span className="tooltip-title text-body font-semibold">{label}</span>
          <span className="text-caption">({data.dateRange})</span>
        </div>
        <div className="tooltip-body">
          <div className="tooltip-row">
            <span className="color-indicator income" />
            <span className="text-caption">الدخل:</span>
            <span className="text-body font-semibold color-income financial-num">
              +{formatAmountNumber(data.rawIncome, currency)} {currency}
            </span>
          </div>
          <div className="tooltip-row">
            <span className="color-indicator expense" />
            <span className="text-caption">المصروف:</span>
            <span className="text-body font-semibold color-expense financial-num">
              -{formatAmountNumber(data.rawExpense, currency)} {currency}
            </span>
          </div>
          <div className="tooltip-divider" />
          <div className="tooltip-row">
            <span className="text-caption">صافي الفائض:</span>
            <span
              className={`text-body font-semibold financial-num ${
                net >= 0 ? 'color-income' : 'color-expense'
              }`}
            >
              {net >= 0 ? `+${formatAmountNumber(net, currency)}` : `-${formatAmountNumber(Math.abs(net), currency)}`} {currency}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Cash Flow Trend Chart Widget
 * Grouped Bar Chart (Income vs Expense) + Accessible Table Fallback
 *
 * References:
 * - design-system/data-visualization.md § 3
 * - design-system/accessibility.md
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function CashFlowTrendChart({
  trend,
  currency = 'SAR',
  onOpenQuickAdd
}) {
  const rawWeeks = trend?.weeks;
  const weeks = rawWeeks || [];
  const totals = trend?.totals ?? { income: 0, expense: 0, net: 0 };
  const hasData = totals.income > 0 || totals.expense > 0;

  // Prepare chart data with major units for consistent chart scaling
  const chartData = useMemo(() => {
    if (!rawWeeks || rawWeeks.length === 0) return [];
    return rawWeeks.map((w) => ({
      name: w.weekLabel,
      dateRange: w.dateRange,
      incomeMajor: w.income / 100,
      expenseMajor: w.expense / 100,
      rawIncome: w.income,
      rawExpense: w.expense,
      rawNet: w.net
    }));
  }, [rawWeeks]);

  return (
    <section className="dashboard-widget surface-card cash-flow-widget" aria-label="اتجاه التدفق النقدي">
      <div className="widget-header">
        <div>
          <h2 className="widget-title text-h3">اتجاه التدفق النقدي</h2>
          <span className="widget-subtitle text-caption">مقارنة الدخل والمصروف أسبوعياً</span>
        </div>
        <div className="chart-legend" aria-hidden="true">
          <div className="legend-item">
            <span className="legend-dot income" />
            <span className="text-caption">الدخل</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot expense" />
            <span className="text-caption">المصروف</span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="chart-empty-state" data-testid="cash-flow-empty">
          <div className="empty-icon-wrap">
            <LineChartIcon size={36} className="placeholder-icon" />
          </div>
          <h3 className="empty-title text-h3">لا توجد تدفقات نقدية مسجلة لهذا الشهر بعد</h3>
          <p className="empty-desc text-caption">
            سجل دخلك ومصاريفك لمشاهدة مقارنة التدفق النقدي الأسبوعي وتحديد فرص التوفير.
          </p>
          {onOpenQuickAdd && (
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenQuickAdd}
            >
              <PlusIcon size={16} />
              <span>تسجيل معاملة جديدة</span>
            </button>
          )}
        </div>
      ) : (
        <div className="trend-content-container">
          {/* 1. Visual Bar Chart */}
          <div className="bar-chart-container" aria-hidden="true">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 16, right: 8, bottom: 8, left: 8 }}
                barGap={6}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border-subtle)"
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                />
                <YAxis
                  orientation="right"
                  width={36}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CashFlowCustomTooltip currency={currency} />} />
                <Bar
                  dataKey="incomeMajor"
                  name="الدخل"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expenseMajor"
                  name="المصروف"
                  fill="var(--color-expense)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 2. Accessible Table Fallback (A11y) */}
          <div className="table-fallback-wrapper">
            <table
              className="a11y-breakdown-table"
              aria-label="جدول مقارنة التدفق النقدي الأسبوعي للشهر الحالي"
            >
              <thead>
                <tr>
                  <th scope="col" className="text-right">الأسبوع</th>
                  <th scope="col" className="text-right">الفترة</th>
                  <th scope="col" className="text-left">الدخل ({currency})</th>
                  <th scope="col" className="text-left">المصروف ({currency})</th>
                  <th scope="col" className="text-left">صافي الفائض</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.weekNumber}>
                    <td className="font-medium text-body">{w.weekLabel}</td>
                    <td className="text-caption text-secondary">{w.dateRange}</td>
                    <td className="amount-cell text-left color-income financial-num">
                      +{formatAmountNumber(w.income, currency)}
                    </td>
                    <td className="amount-cell text-left color-expense financial-num">
                      -{formatAmountNumber(w.expense, currency)}
                    </td>
                    <td className="amount-cell text-left financial-num font-semibold">
                      <span className={w.net >= 0 ? 'color-income' : 'color-expense'}>
                        {w.net >= 0 ? `+${formatAmountNumber(w.net, currency)}` : `-${formatAmountNumber(Math.abs(w.net), currency)}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="table-total-row">
                  <td colSpan={2} className="font-semibold text-body">المجموع الشهري</td>
                  <td className="amount-cell text-left color-income financial-num font-semibold">
                    +{formatAmountNumber(totals.income, currency)}
                  </td>
                  <td className="amount-cell text-left color-expense financial-num font-semibold">
                    -{formatAmountNumber(totals.expense, currency)}
                  </td>
                  <td className="amount-cell text-left financial-num font-bold">
                    <span className={totals.net >= 0 ? 'color-income' : 'color-expense'}>
                      {totals.net >= 0 ? `+${formatAmountNumber(totals.net, currency)}` : `-${formatAmountNumber(Math.abs(totals.net), currency)}`}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
