import { formatAmountNumber } from './dashboardUtils.js';
import {
  CategoryIcon,
  ChevronLeftIcon,
  PlusIcon,
  TransactionsIcon,
  TransferIcon
} from '../common/Icons.jsx';

/**
 * Formats a transaction date string (YYYY-MM-DD) into user-friendly Arabic text.
 */
function formatTransactionDate(dateStr) {
  if (!dateStr) return '';
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return 'اليوم';
  if (dateStr === yesterday) return 'أمس';

  // Format as "25 أكتوبر"
  try {
    const [year, month, day] = dateStr.split('-');
    const dateObj = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    return new Intl.DateTimeFormat('ar-SA', {
      month: 'short',
      day: 'numeric'
    }).format(dateObj);
  } catch {
    return dateStr;
  }
}

/**
 * Recent Transactions Widget
 * Lists the 5 most recent transactions with categorized iconography,
 * ledger metadata, and tabular financial formatting.
 *
 * References:
 * - design-system/screens.md § 1
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function RecentTransactionsWidget({
  transactions = [],
  currency = 'SAR',
  onNavigateTransactions,
  onOpenQuickAdd
}) {
  return (
    <section className="dashboard-widget surface-card recent-transactions-widget" aria-label="آخر المعاملات المسجلة">
      <div className="widget-header">
        <div>
          <h2 className="widget-title text-h3">آخر المعاملات المسجلة</h2>
          <span className="widget-subtitle text-caption">أحدث 5 عمليات مسجلة</span>
        </div>
        {onNavigateTransactions && (
          <button
            type="button"
            className="section-action-link text-caption"
            onClick={onNavigateTransactions}
            aria-label="عرض كافة المعاملات"
          >
            <span>عرض الكل</span>
            <ChevronLeftIcon size={16} />
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="tx-empty-state" data-testid="recent-transactions-empty">
          <div className="empty-icon-wrap">
            <TransactionsIcon size={36} className="placeholder-icon" />
          </div>
          <h3 className="empty-title text-h3">لا توجد معاملات مسجلة حتى الآن</h3>
          <p className="empty-desc text-caption">
            سجل أول معاملة مصروف أو دخل لتبدأ في بناء سجلك المالي الآمن.
          </p>
          {onOpenQuickAdd && (
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenQuickAdd}
            >
              <PlusIcon size={16} />
              <span>تسجيل أول معاملة</span>
            </button>
          )}
        </div>
      ) : (
        <div className="transactions-list" role="list">
          {transactions.map((tx) => {
            const isIncome = tx.type === 'income';
            const isExpense = tx.type === 'expense';
            const isTransfer = tx.type === 'transfer';

            const sign = isIncome ? '+' : isExpense ? '-' : '↔';
            const colorClass = isIncome ? 'color-income' : isExpense ? 'color-expense' : 'color-transfer';

            const displayTitle = tx.notes && tx.notes.trim() ? tx.notes : tx.categoryName;
            const formattedDate = formatTransactionDate(tx.date);

            return (
              <div
                key={tx.id}
                role="listitem"
                className="tx-item-card"
                tabIndex={0}
                onClick={onNavigateTransactions}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateTransactions?.();
                  }
                }}
                data-testid={`recent-tx-${tx.id}`}
              >
                {/* 1. Category Icon Badge */}
                <div
                  className="tx-icon-badge"
                  style={{
                    backgroundColor: `${tx.categoryColor}18`, // 10% opacity tint
                    color: tx.categoryColor
                  }}
                >
                  {isTransfer ? (
                    <TransferIcon size={18} />
                  ) : (
                    <CategoryIcon name={tx.categoryIcon} size={18} />
                  )}
                </div>

                {/* 2. Transaction Information */}
                <div className="tx-details">
                  <div className="tx-title-row">
                    <span className="tx-title-text text-body font-semibold" title={displayTitle}>
                      {displayTitle}
                    </span>
                  </div>
                  <div className="tx-meta-row text-caption">
                    <span className="tx-account-name">
                      {isTransfer
                        ? `${tx.accountName} ← ${tx.destinationAccountName}`
                        : `${tx.accountName} • ${tx.categoryName}`}
                    </span>
                    <span className="tx-date-separator">•</span>
                    <span className="tx-date-badge">{formattedDate}</span>
                  </div>
                </div>

                {/* 3. Transaction Amount */}
                <div className={`tx-amount-col ${colorClass}`}>
                  <span className="tx-amount-value text-body font-bold financial-num">
                    {sign}&nbsp;{formatAmountNumber(tx.amount, currency)}
                  </span>
                  <span className="tx-currency text-caption">{currency}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
