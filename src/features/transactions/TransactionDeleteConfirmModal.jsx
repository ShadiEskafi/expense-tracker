import { useEffect } from 'react';
import { TrashIcon, CloseIcon } from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';

/**
 * Transaction Delete Confirmation Modal (F011)
 * Explains soft-delete behavior and balance restoration per ADR-003 & ADR-011.
 */
export function TransactionDeleteConfirmModal({
  transaction,
  isOpen,
  onClose,
  onConfirm,
  isDeleting
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !transaction) return null;

  const formattedAmount = formatCurrency(transaction.amount, 'SAR');

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        className="modal-content surface-card delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header">
          <div className="delete-icon-badge">
            <TrashIcon size={24} className="color-expense" />
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="إلغاء"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="delete-dialog-content">
          <h2 id="delete-dialog-title" className="text-h3">
            هل أنت متأكد من حذف هذه المعاملة؟
          </h2>
          <p id="delete-dialog-desc" className="text-body color-secondary">
            سيتم حذف المعاملة بقيمة <strong className="tnum color-expense">{formattedAmount}</strong>، وسيتم تلقائياً استعادة رصيد الحساب المالي المرتبط وفقاً لقواعد الدفتر المالي.
          </p>
        </div>

        <div className="modal-actions-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
          </button>
        </div>
      </div>
    </div>
  );
}
