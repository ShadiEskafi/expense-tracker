import { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CategoryIcon } from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';

/**
 * Custom Tooltip for Recharts Donut
 */
function CategoryDonutTooltip({ active, payload, currency }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="reports-chart-tooltip" role="tooltip">
        <div className="chart-tooltip-title">{data.categoryName}</div>
        <div className="chart-tooltip-row expense-row">
          <span>المبلغ:</span>
          <span className="tnum">{formatCurrency(data.amount, currency)}</span>
        </div>
        <div className="chart-tooltip-row">
          <span>النسبة من المصاريف:</span>
          <span className="tnum">{data.percentage}%</span>
        </div>
        <div className="chart-tooltip-row">
          <span>عدد المعاملات:</span>
          <span className="tnum">{data.transactionCount}</span>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * ReportsCategoryBreakdown (F012)
 * Renders category expenditure breakdown with an interactive Donut chart,
 * category drilldown filter pills, and a ranked accessible data table with progress bars.
 *
 * Compliant with:
 * - design-system/screens.md § 8
 * - design-system/data-visualization.md § 2
 * - /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function ReportsCategoryBreakdown({
  categoryBreakdown = [],
  totalExpense = 0,
  currency = 'SAR',
  selectedCategoryId = null,
  onSelectCategory
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Prepare chart data with major units
  const chartData = useMemo(() => {
    if (!categoryBreakdown || categoryBreakdown.length === 0) return [];
    return categoryBreakdown.map((item) => ({
      ...item,
      chartValue: item.amount / 100
    }));
  }, [categoryBreakdown]);

  const activeItem =
    hoveredIndex !== null && chartData[hoveredIndex]
      ? chartData[hoveredIndex]
      : selectedCategoryId
      ? chartData.find((c) => c.categoryId === selectedCategoryId)
      : null;

  return (
    <div className="reports-widget-card" aria-label="توزيع المصاريف حسب التصنيف">
      <div className="widget-card-header">
        <div>
          <h3 className="widget-card-title">توزيع المصاريف حسب التصنيف</h3>
          <span className="widget-card-subtitle">
            ترتيب تنازلي لنسب استهلاك النفقات في الفترة
          </span>
        </div>
        {categoryBreakdown.length > 0 && (
          <span className="badge-count text-micro">
            {categoryBreakdown.length} {categoryBreakdown.length === 1 ? 'تصنيف' : 'تصنيفات'}
          </span>
        )}
      </div>

      {/* Category Filter Drilldown Pills */}
      {categoryBreakdown.length > 0 && (
        <div className="category-filter-chips" aria-label="تصفية حسب التصنيف">
          <button
            type="button"
            className={`category-filter-chip ${selectedCategoryId === null ? 'active' : ''}`}
            onClick={() => onSelectCategory && onSelectCategory(null)}
          >
            كل التصنيفات
          </button>
          {categoryBreakdown.map((cat) => (
            <button
              key={cat.categoryId}
              type="button"
              className={`category-filter-chip ${selectedCategoryId === cat.categoryId ? 'active' : ''}`}
              onClick={() =>
                onSelectCategory &&
                onSelectCategory(selectedCategoryId === cat.categoryId ? null : cat.categoryId)
              }
            >
              <span className="chip-color-dot" style={{ backgroundColor: cat.color }} />
              <span>{cat.categoryName}</span>
              <span className="tnum font-semibold">({cat.percentage}%)</span>
            </button>
          ))}
        </div>
      )}

      {categoryBreakdown.length === 0 ? (
        <div className="empty-state-text" style={{ padding: 'var(--space-6) 0', textAlign: 'center' }}>
          لا توجد مصاريف مسجلة لعرض مخطط التوزيع.
        </div>
      ) : (
        <>
          {/* Recharts Donut Visual Container */}
          <div style={{ position: 'relative', width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="chartValue"
                  cornerRadius={4}
                  stroke="var(--color-bg-surface)"
                  strokeWidth={2}
                  onMouseEnter={(_, index) => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cat-cell-${entry.categoryId}-${index}`}
                      fill={entry.color}
                      opacity={
                        hoveredIndex === null && !selectedCategoryId
                          ? 1
                          : hoveredIndex === index || selectedCategoryId === entry.categoryId
                          ? 1
                          : 0.4
                      }
                      style={{ cursor: 'pointer', outline: 'none' }}
                      onClick={() =>
                        onSelectCategory &&
                        onSelectCategory(
                          selectedCategoryId === entry.categoryId ? null : entry.categoryId
                        )
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<CategoryDonutTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Central Summary Inside Donut Ring */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}
            >
              <div className="text-micro font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {activeItem ? activeItem.categoryName : 'إجمالي المصاريف'}
              </div>
              <div className="text-h3 font-bold tnum" style={{ color: 'var(--color-text-primary)' }}>
                {formatCurrency(activeItem ? activeItem.amount : totalExpense, currency)}
              </div>
              <div className="text-micro font-semibold" style={{ color: activeItem ? activeItem.color : 'var(--color-text-muted)' }}>
                {activeItem ? `${activeItem.percentage}% من المجموع` : `${categoryBreakdown.length} تصنيفات`}
              </div>
            </div>
          </div>

          {/* Accessible Breakdown Table & Visual Progress Bars */}
          <div className="breakdown-table-wrap">
            <table
              className="breakdown-table a11y-breakdown-table"
              aria-label="جدول ترتيب تصنيفات النفقات حسب القيمة والنسبة المئوية"
            >
              <thead>
                <tr>
                  <th scope="col" style={{ width: '40%' }}>التصنيف</th>
                  <th scope="col" style={{ width: '35%' }}>النسبة والشريط</th>
                  <th scope="col" style={{ width: '25%', textAlign: 'left' }}>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.map((cat) => {
                  const isSelected = selectedCategoryId === cat.categoryId;
                  return (
                    <tr
                      key={cat.categoryId}
                      className={`clickable-row ${isSelected ? 'selected-row' : ''}`}
                      onClick={() =>
                        onSelectCategory &&
                        onSelectCategory(isSelected ? null : cat.categoryId)
                      }
                      title="انقر لتصفية أعلى المصاريف بهذا التصنيف"
                    >
                      <td>
                        <div className="category-name-cell">
                          <div
                            className="cat-icon-badge"
                            style={{
                              backgroundColor: `${cat.color}20`,
                              color: cat.color
                            }}
                          >
                            <CategoryIcon name={cat.icon} size={18} />
                          </div>
                          <div>
                            <div className="font-semibold">{cat.categoryName}</div>
                            <div className="text-micro" style={{ color: 'var(--color-text-muted)' }}>
                              {cat.transactionCount} {cat.transactionCount === 1 ? 'معاملة' : 'معاملات'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="tnum font-semibold text-micro" style={{ width: '42px' }}>
                            {cat.percentage}%
                          </span>
                          <div className="cat-progress-track">
                            <div
                              className="cat-progress-fill"
                              style={{
                                width: `${Math.min(100, Math.max(2, cat.percentage))}%`,
                                backgroundColor: cat.color
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="tnum font-bold color-expense">
                          {formatCurrency(cat.amount, currency)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
