import { useState, useEffect } from 'react';
import {
  CloseIcon,
  CheckIcon
} from '../../components/common/Icons.jsx';
import { parseAmountInput } from '../../utils/currency.js';

/**
 * Transaction Edit Modal (F011)
 * Allows non-destructive editing of transaction amount, category, account, date, notes, and tags.
 *
 * References:
 * - ADR-003 (Ledger Recalculation)
 * - /impeccable, /make-interfaces-feel-better, /transitions-dev
 */
export function TransactionEditModal({
  transaction,
  isOpen,
  onClose,
  onSave,
  categories = [],
  accounts = []
}) {
  const [amountStr, setAmountStr] = useState(
    transaction?.amount ? (transaction.amount / 100).toFixed(2) : ''
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [accountId, setAccountId] = useState(transaction?.account_id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(transaction?.destination_account_id || '');
  const [date, setDate] = useState(transaction?.date || '');
  const [notes, setNotes] = useState(transaction?.notes || '');
  const [tagsStr, setTagsStr] = useState(
    Array.isArray(transaction?.tags) ? transaction.tags.join('، ') : ''
  );
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !transaction) return null;

  const isTransfer = transaction.type === 'transfer';
  const visibleCategories = categories.filter((c) => c.type === transaction.type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    // 1. Amount validation
    const parsedAmount = parseAmountInput(amountStr);
    if (!parsedAmount || parsedAmount.minorUnits <= 0) {
      newErrors.amount = 'يرجى إدخال مبلغ صحيح أكبر من الصفر';
    }

    // 2. Account validation
    if (!accountId) {
      newErrors.accountId = 'يرجى اختيار الحساب المالي';
    }

    // 3. Category validation (for expense & income)
    if (!isTransfer && !categoryId) {
      newErrors.categoryId = 'يرجى تحديد التصنيف';
    }

    // 4. Transfer destination account validation
    if (isTransfer) {
      if (!destinationAccountId) {
        newErrors.destinationAccountId = 'يرجى اختيار الحساب المحول إليه';
      } else if (destinationAccountId === accountId) {
        newErrors.destinationAccountId = 'لا يمكن التحويل لنفس الحساب المصدر';
      }
    }

    // 5. Date validation
    if (!date) {
      newErrors.date = 'يرجى اختيار تاريخ المعاملة';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Parse tags
    const tags = tagsStr
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const updates = {
      amount: parsedAmount.minorUnits,
      account_id: accountId,
      date,
      notes: notes.trim(),
      tags
    };

    if (isTransfer) {
      updates.destination_account_id = destinationAccountId;
    } else {
      updates.category_id = categoryId;
    }

    try {
      setIsSubmitting(true);
      await onSave(transaction.id, updates, transaction.type);
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'حدث خطأ أثناء حفظ التعديلات' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        className="modal-content surface-card edit-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header">
          <h2 id="edit-dialog-title" className="text-h3">
            تعديل المعاملة
          </h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="إلغاء"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-form">
          {errors.form && (
            <div className="error-banner">
              <span>{errors.form}</span>
            </div>
          )}

          {/* Amount input */}
          <div className="form-field">
            <label htmlFor="edit-amount" className="text-caption-bold">المبلغ (ر.س) *</label>
            <input
              id="edit-amount"
              type="text"
              inputMode="decimal"
              className={`input-field tnum ${errors.amount ? 'input-error' : ''}`}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                if (errors.amount) setErrors((prev) => ({ ...prev, amount: null }));
              }}
              required
            />
            {errors.amount && <span className="field-error-text text-caption">{errors.amount}</span>}
          </div>

          {/* Category Selector (Non-transfer) */}
          {!isTransfer && (
            <div className="form-field">
              <label htmlFor="edit-category" className="text-caption-bold">التصنيف *</label>
              <select
                id="edit-category"
                className={`input-field select-field ${errors.categoryId ? 'input-error' : ''}`}
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: null }));
                }}
                required
              >
                <option value="">اختر التصنيف...</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && <span className="field-error-text text-caption">{errors.categoryId}</span>}
            </div>
          )}

          {/* Account Selector */}
          <div className="form-field">
            <label htmlFor="edit-account" className="text-caption-bold">
              {isTransfer ? 'الحساب المصدر *' : 'الحساب المالي *'}
            </label>
            <select
              id="edit-account"
              className={`input-field select-field ${errors.accountId ? 'input-error' : ''}`}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (errors.accountId) setErrors((prev) => ({ ...prev, accountId: null }));
              }}
              required
            >
              <option value="">اختر الحساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {errors.accountId && <span className="field-error-text text-caption">{errors.accountId}</span>}
          </div>

          {/* Destination Account (if transfer) */}
          {isTransfer && (
            <div className="form-field">
              <label htmlFor="edit-destination-account" className="text-caption-bold">
                الحساب المحول إليه *
              </label>
              <select
                id="edit-destination-account"
                className={`input-field select-field ${errors.destinationAccountId ? 'input-error' : ''}`}
                value={destinationAccountId}
                onChange={(e) => {
                  setDestinationAccountId(e.target.value);
                  if (errors.destinationAccountId) setErrors((prev) => ({ ...prev, destinationAccountId: null }));
                }}
                required
              >
                <option value="">اختر الحساب المحول إليه...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {errors.destinationAccountId && (
                <span className="field-error-text text-caption">{errors.destinationAccountId}</span>
              )}
            </div>
          )}

          {/* Date */}
          <div className="form-field">
            <label htmlFor="edit-date" className="text-caption-bold">التاريخ *</label>
            <input
              id="edit-date"
              type="date"
              className={`input-field ${errors.date ? 'input-error' : ''}`}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (errors.date) setErrors((prev) => ({ ...prev, date: null }));
              }}
              required
            />
            {errors.date && <span className="field-error-text text-caption">{errors.date}</span>}
          </div>

          {/* Notes */}
          <div className="form-field">
            <label htmlFor="edit-notes" className="text-caption-bold">ملاحظات و تفاصيل (اختياري)</label>
            <textarea
              id="edit-notes"
              className="input-field textarea-field"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="وصف المعاملة، المتجر، أو المستفيد..."
            />
          </div>

          {/* Tags */}
          <div className="form-field">
            <label htmlFor="edit-tags" className="text-caption-bold">الوسوم (مفصولة بفواصل)</label>
            <input
              id="edit-tags"
              type="text"
              className="input-field"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="عمل، مقاضي، رحلة..."
            />
          </div>

          {/* Actions */}
          <div className="modal-actions-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              <CheckIcon size={16} />
              <span>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
