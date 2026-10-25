import { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatAmountNumber } from './dashboardUtils.js';
import { CategoryIcon, PlusIcon, LineChartIcon } from '../common/Icons.jsx';

/**
 * Custom Tooltip for Recharts Donut
 */
function DonutCustomTooltip({ active, payload, currency }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="chart-tooltip surface-card">
        <div className="tooltip-header">
          <span className="cat-color-dot" style={{ backgroundColor: data.color }} />
          <span className="tooltip-title text-body font-semibold">{data.categoryName}</span>
        </div>
        <div className="tooltip-body">
          <div className="tooltip-row">
            <span className="text-caption">المبلغ:</span>
            <span className="text-body font-semibold financial-num">
              {formatAmountNumber(data.amount, currency)} {currency}
            </span>
          </div>
          <div className="tooltip-row">
            <span className="text-caption">النسبة من الإجمالي:</span>
            <span className="text-body font-semibold financial-num">{data.percentage}%</span>
          </div>
          <div className="tooltip-row">
            <span className="text-caption">عدد المعاملات:</span>
            <span className="text-caption financial-num">{data.transactionCount}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Spending Category Breakdown Chart Widget
 * Recharts Donut Chart + Accessible Table Fallback
 *
 * References:
 * - design-system/data-visualization.md § 2
 * - design-system/accessibility.md
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function CategoryBreakdownChart({
  breakdown,
  currency = 'SAR',
  onOpenQuickAdd
}) {
  const [activeIndex, setActiveIndex] = useState(null);

  const totalExpense = breakdown?.totalExpense ?? 0;
  const rawItems = breakdown?.items;
  const items = rawItems || [];

  // Recharts data format: amounts converted to major units for consistent chart scaling
  const chartData = useMemo(() => {
    if (!rawItems || rawItems.length === 0) return [];
    return rawItems.map((item) => ({
      ...item,
      chartValue: item.amount / 100 // for proportional slice sizing
    }));
  }, [rawItems]);

  const activeItem = activeIndex !== null && chartData[activeIndex] ? chartData[activeIndex] : null;

  return (
    <section className="dashboard-widget surface-card category-breakdown-widget" aria-label="توزيع المصاريف حسب التصنيف">
      <div className="widget-header">
        <div>
          <h2 className="widget-title text-h3">توزيع المصاريف حسب التصنيف</h2>
          <span className="widget-subtitle text-caption">الشهر الحالي</span>
        </div>
        {items.length > 0 && (
          <span className="badge-count text-micro">
            {items.length} تصنيفات
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="chart-empty-state" data-testid="category-breakdown-empty">
          <div className="empty-icon-wrap">
            <LineChartIcon size={36} className="placeholder-icon" />
          </div>
          <h3 className="empty-title text-h3">لا توجد مصاريف مسجلة لهذا الشهر بعد</h3>
          <p className="empty-desc text-caption">
            ابدأ بتسجيل أول مصروف لتظهر تحليلاتك ونسب توزيع الميزانية بوضوح.
          </p>
          {onOpenQuickAdd && (
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenQuickAdd}
            >
              <PlusIcon size={16} />
              <span>تسجيل أول مصروف</span>
            </button>
          )}
        </div>
      ) : (
        <div className="breakdown-content-container">
          {/* 1. Visual Donut Chart */}
          <div className="donut-chart-container" aria-hidden="true">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={chartData}
                  dataKey="chartValue"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={92}
                  paddingAngle={3}
                  cornerRadius={4}
                  stroke="var(--color-bg-surface)"
                  strokeWidth={2}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.categoryId}-${index}`}
                      fill={entry.color}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.6}
                      className="donut-slice"
                    />
                  ))}
                </Pie>
                <Tooltip content={<DonutCustomTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Central summary inside donut ring */}
            <div className="donut-center-overlay">
              <span className="center-label text-micro">
                {activeItem ? activeItem.categoryName : 'إجمالي المصاريف'}
              </span>
              <span className="center-amount text-h3 financial-num">
                {formatAmountNumber(activeItem ? activeItem.amount : totalExpense, currency)}
              </span>
              <span className="center-currency text-micro">
                {activeItem ? `${activeItem.percentage}%` : currency}
              </span>
            </div>
          </div>

          {/* 2. Mandatory Accessible Table Fallback (A11y) */}
          <div className="table-fallback-wrapper">
            <table
              className="a11y-breakdown-table"
              aria-label="جدول تفصيلي لتوزيع المصاريف حسب التصنيف للشهر الحالي"
            >
              <thead>
                <tr>
                  <th scope="col" className="text-right">التصنيف</th>
                  <th scope="col" className="text-left">المبلغ ({currency})</th>
                  <th scope="col" className="text-left">النسبة</th>
                  <th scope="col" className="text-center">العمليات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.categoryId}
                    className={`breakdown-table-row ${activeIndex === index ? 'is-highlighted' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    <td>
                      <div className="cat-cell-content">
                        <span
                          className="cat-color-dot"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <CategoryIcon name={item.icon} size={16} className="cat-icon-svg" />
                        <span className="cat-name-label text-body font-medium">{item.categoryName}</span>
                      </div>
                    </td>
                    <td className="amount-cell text-left financial-num font-semibold">
                      {formatAmountNumber(item.amount, currency)}
                    </td>
                    <td className="pct-cell text-left">
                      <div className="pct-bar-wrapper">
                        <div
                          className="pct-bar-fill"
                          style={{
                            width: `${Math.min(item.percentage, 100)}%`,
                            backgroundColor: item.color
                          }}
                          aria-hidden="true"
                        />
                        <span className="pct-value-text financial-num text-caption">
                          {item.percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="count-cell text-center text-caption financial-num">
                      {item.transactionCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
