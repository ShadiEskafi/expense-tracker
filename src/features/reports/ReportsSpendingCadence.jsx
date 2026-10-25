import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { formatCurrency } from '../../utils/currency.js';

/**
 * Custom Tooltip for Timeline Cadence Chart
 */
function CadenceTooltip({ active, payload, label, currency }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const net = (data.income || 0) - (data.expense || 0);

    return (
      <div className="reports-chart-tooltip" role="tooltip">
        <div className="chart-tooltip-title">{label || data.label}</div>
        <div className="chart-tooltip-row income-row">
          <span>الدخل:</span>
          <span className="tnum">+{formatCurrency(Math.round((data.income || 0) * 100), currency)}</span>
        </div>
        <div className="chart-tooltip-row expense-row">
          <span>المصروف:</span>
          <span className="tnum">-{formatCurrency(Math.round((data.expense || 0) * 100), currency)}</span>
        </div>
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--color-border-subtle)',
            margin: 'var(--space-1) 0'
          }}
        />
        <div
          className={`chart-tooltip-row ${net >= 0 ? 'income-row' : 'expense-row'}`}
        >
          <span>الصافي:</span>
          <span className="tnum">
            {net >= 0 ? '+' : ''}
            {formatCurrency(Math.round(net * 100), currency)}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * ReportsSpendingCadence (F012)
 * Renders chronological spending and income distribution over time
 * (Daily for periods <= 31 days, Monthly for longer horizons).
 *
 * References:
 * - design-system/data-visualization.md § 3
 * - design-system/accessibility.md
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function ReportsSpendingCadence({
  timelineData = [],
  currency = 'SAR',
  daysInPeriod = 30
}) {
  const isDaily = daysInPeriod <= 31;
  const hasActivity = timelineData.some((item) => (item.income || 0) > 0 || (item.expense || 0) > 0);

  return (
    <div className="reports-widget-card" aria-label="النسق الزمني للصرف والدخل">
      <div className="widget-card-header">
        <div>
          <h3 className="widget-card-title">النسق الزمني للصرف والدخل</h3>
          <span className="widget-card-subtitle">
            {isDaily ? 'توزيع المعاملات اليومية خلال الفترة' : 'توزيع التدفق الشهري على مدار العام'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-micro)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--color-income)' }} />
            <span>الدخل</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--font-size-micro)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--color-expense)' }} />
            <span>المصروف</span>
          </div>
        </div>
      </div>

      {!hasActivity ? (
        <div className="empty-state-text" style={{ padding: 'var(--space-6) 0', textAlign: 'center' }}>
          لا توجد معاملات مسجلة في هذا النطاق الزمني لعرض المنحنى.
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timelineData}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-border-subtle)"
                />
                <XAxis
                  dataKey="shortLabel"
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                />
                <YAxis
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CadenceTooltip currency={currency} />} />
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                  name="الدخل"
                  maxBarSize={28}
                />
                <Bar
                  dataKey="expense"
                  fill="var(--color-expense)"
                  radius={[4, 4, 0, 0]}
                  name="المصروف"
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Accessible Table Fallback */}
          <div className="breakdown-table-wrap">
            <table
              className="breakdown-table"
              aria-label="جدول تفصيلي للتدفق المالي عبر الزمن"
            >
              <thead>
                <tr>
                  <th scope="col">التاريخ / الفترة</th>
                  <th scope="col">الدخل</th>
                  <th scope="col">المصروف</th>
                  <th scope="col">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {timelineData
                  .filter((item) => (item.income || 0) > 0 || (item.expense || 0) > 0)
                  .map((item) => {
                    const netMajor = (item.income || 0) - (item.expense || 0);
                    return (
                      <tr key={item.key || item.date}>
                        <td>{item.label}</td>
                        <td className="tnum color-income font-medium">
                          +{formatCurrency(Math.round((item.income || 0) * 100), currency)}
                        </td>
                        <td className="tnum color-expense font-medium">
                          -{formatCurrency(Math.round((item.expense || 0) * 100), currency)}
                        </td>
                        <td className={`tnum font-bold ${netMajor >= 0 ? 'color-income' : 'color-expense'}`}>
                          {netMajor >= 0 ? '+' : ''}
                          {formatCurrency(Math.round(netMajor * 100), currency)}
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
