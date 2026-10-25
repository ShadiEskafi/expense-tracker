import { useEffect } from 'react';
import {
  CloseIcon,
  EditIcon,
  TrashIcon,
  CalendarIcon,
  WalletIcon,
  TagIcon,
  NoteIcon,
  CategoryIcon,
  TransferIcon
} from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';
import { formatArabicDate, getArabicDayName } from './filter.js';

/**
 * Transaction Detail Modal (F011)
 * Displays full transaction breakdown, category, accounts, and actions.
 *
 * Compliant with:
 * - design-system/screens.md § 2
 * - /impeccable, /make-interfaces-feel-better, /transitions-dev
 */
export function TransactionDetailModal({
  transaction,
  onClose,
  onEdit,
  onDelete
}) {
  useEffect(() => {
    if (!transaction) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transaction, onClose]);

  if (!transaction) return null;

  const isIncome = transaction.type === 'income';
  const isExpense = transaction.type === 'expense';
  const isTransfer = transaction.type === 'transfer';

  const typeLabel = isIncome ? 'دخل' : isExpense ? 'مصروف' : 'تحويل داخلي';
  const typeClass = isIncome ? 'badge-income' : isExpense ? 'badge-expense' : 'badge-transfer';
  const sign = isIncome ? '+' : isExpense ? '-' : '↔';

  const formattedAmount = formatCurrency(transaction.amount, 'SAR');
  const formattedDate = formatArabicDate(transaction.date);
  const dayName = getArabicDayName(transaction.date);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-content surface-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="header-type-wrap">
            <span className={`status-badge ${typeClass}`}>
              {typeLabel}
            </span>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Hero Amount Display */}
        <div className="tx-hero-amount-section">
          <div className="hero-category-icon" style={{ backgroundColor: transaction.category?.color ? `${transaction.category.color}20` : 'var(--color-bg-surface-subtle)' }}>
            {isTransfer ? (
              <TransferIcon size={32} style={{ color: 'var(--color-transfer)' }} />
            ) : (
              <CategoryIcon
                name={transaction.category?.icon || 'more-horizontal'}
                size={32}
                style={{ color: transaction.category?.color || 'var(--color-brand-primary)' }}
              />
            )}
          </div>
          <div className={`hero-amount-value tnum ${isIncome ? 'color-income' : isExpense ? 'color-expense' : 'color-transfer'}`}>
            <span className="amount-sign">{sign} </span>
            <span>{formattedAmount}</span>
          </div>
          <h2 id="tx-detail-title" className="hero-category-name text-h3">
            {isTransfer ? 'تحويل بين الحسابات' : transaction.category?.name || 'بدون تصنيف'}
          </h2>
        </div>

        {/* Details List */}
        <div className="tx-details-grid">
          {/* Date */}
          <div className="detail-item">
            <div className="detail-label">
              <CalendarIcon size={16} />
              <span>التاريخ</span>
            </div>
            <div className="detail-value text-body-bold">
              {dayName}، {formattedDate}
            </div>
          </div>

          {/* Account / Accounts */}
          {isTransfer ? (
            <>
              <div className="detail-item">
                <div className="detail-label">
                  <WalletIcon size={16} />
                  <span>من حساب</span>
                </div>
                <div className="detail-value text-body-bold">
                  {transaction.account?.name || 'الحساب المصدر'}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">
                  <WalletIcon size={16} />
                  <span>إلى حساب</span>
                </div>
                <div className="detail-value text-body-bold">
                  {transaction.destinationAccount?.name || 'الحساب الوجهة'}
                </div>
              </div>
            </>
          ) : (
            <div className="detail-item">
              <div className="detail-label">
                <WalletIcon size={16} />
                <span>الحساب</span>
              </div>
              <div className="detail-value text-body-bold">
                {transaction.account?.name || 'غير محدد'}
              </div>
            </div>
          )}

          {/* Notes */}
          {transaction.notes && (
            <div className="detail-item full-width">
              <div className="detail-label">
                <NoteIcon size={16} />
                <span>ملاحظات</span>
              </div>
              <div className="detail-value text-body tx-notes-box">
                {transaction.notes}
              </div>
            </div>
          )}

          {/* Tags */}
          {Array.isArray(transaction.tags) && transaction.tags.length > 0 && (
            <div className="detail-item full-width">
              <div className="detail-label">
                <TagIcon size={16} />
                <span>الوسوم</span>
              </div>
              <div className="detail-tags-row">
                {transaction.tags.map((tag, idx) => (
                  <span key={idx} className="tag-pill">
                    {`#${tag}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="modal-actions-footer">
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => onDelete(transaction)}
          >
            <TrashIcon size={16} />
            <span>حذف</span>
          </button>
          <div className="actions-right">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
            >
              <span>إغلاق</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onEdit(transaction)}
            >
              <EditIcon size={16} />
              <span>تعديل</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
