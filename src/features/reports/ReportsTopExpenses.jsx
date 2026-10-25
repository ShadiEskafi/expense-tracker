import { CategoryIcon, WalletIcon, CalendarIcon, CloseIcon } from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';
import { formatArabicDate } from './reportsAnalytics.js';

/**
 * ReportsTopExpenses (F012)
 * Displays ordered list of the highest-value individual expenses recorded
 * within the selected timeframe to identify major spending outlays.
 *
 * Compliant with:
 * - project-summary.md § 14 (Top Expenses Ranking)
 * - design-system/screens.md § 8
 * - /impeccable, /make-interfaces-feel-better
 */
export function ReportsTopExpenses({
  topExpenses = [],
  currency = 'SAR',
  selectedCategoryId = null,
  selectedCategoryName = '',
  onClearCategoryFilter,
  onSelectTransaction
}) {
  return (
    <div className="reports-top-expenses-card" aria-label="أعلى المصاريف الفردية">
      <div className="widget-card-header">
        <div>
          <h3 className="widget-card-title">أعلى المصاريف الفردية</h3>
          <span className="widget-card-subtitle">
            قائمة مرتبة بأكبر النفقات حجماً للتحكم في بنود الصرف الكبرى
          </span>
        </div>
        {topExpenses.length > 0 && (
          <span className="badge-count text-micro">
            {topExpenses.length} {topExpenses.length === 1 ? 'مصروف' : 'مصاريف'}
          </span>
        )}
      </div>

      {/* Active Drilldown Banner */}
      {selectedCategoryId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: 'var(--font-size-caption)'
          }}
        >
          <span>
            تصفية أعلى المصاريف حسب تصنيف: <strong>{selectedCategoryName || 'التصنيف المختار'}</strong>
          </span>
          <button
            type="button"
            className="btn-icon"
            onClick={onClearCategoryFilter}
            style={{ width: 28, height: 28 }}
            aria-label="إلغاء تصفية التصنيف"
            title="إلغاء التصفية"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {topExpenses.length === 0 ? (
        <div className="empty-state-text" style={{ padding: 'var(--space-6) 0', textAlign: 'center' }}>
          لا توجد مصاريف فردية مسجلة في هذا النطاق الزمني.
        </div>
      ) : (
        <div className="top-expenses-list">
          {topExpenses.map((tx) => (
            <div
              key={tx.id}
              className="top-expense-item"
              onClick={() => onSelectTransaction && onSelectTransaction(tx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTransaction && onSelectTransaction(tx);
                }
              }}
              aria-label={`المصروف رقم ${tx.rank}: ${tx.description} بقيمة ${formatCurrency(tx.amount, currency)}`}
            >
              {/* Right: Rank + Icon + Notes */}
              <div className="top-expense-right">
                <span className={`rank-badge ${tx.rank <= 3 ? `rank-${tx.rank}` : ''}`}>
                  {tx.rank}
                </span>

                <div
                  className="cat-icon-badge"
                  style={{
                    backgroundColor: `${tx.categoryColor}20`,
                    color: tx.categoryColor
                  }}
                  aria-hidden="true"
                >
                  <CategoryIcon name={tx.categoryIcon} size={18} />
                </div>

                <div className="top-expense-info">
                  <span className="top-expense-title">
                    {tx.notes || tx.categoryName || 'مصروف عام'}
                  </span>
                  <div className="top-expense-meta">
                    <span style={{ color: tx.categoryColor, fontWeight: 500 }}>
                      {tx.categoryName}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <WalletIcon size={12} />
                      {tx.accountName}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <CalendarIcon size={12} />
                      {formatArabicDate(tx.date)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Left: Formatted Amount */}
              <div className="top-expense-left">
                <span className="top-expense-amount tnum">
                  -{formatCurrency(tx.amount, currency)}
                </span>
                <span className="text-micro" style={{ color: 'var(--color-text-muted)' }}>
                  تفاصيل ↗
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
