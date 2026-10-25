import { useState, useEffect } from 'react';
import { CloseIcon } from '../common/Icons';

/**
 * Quick Add Modal / Bottom Sheet Shell (Foundation for F009)
 * Accessible dialog with Escape key listening, autofocus, and smooth transitions.
 * Ref: design-system/screens.md & components.md
 */
export function QuickAddModalPlaceholder({ isOpen = false, onClose }) {
  const [selectedType, setSelectedType] = useState('expense');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
      aria-hidden="true"
    >
      <div
        className="quick-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-titles">
            <h3 id="quick-add-modal-title" className="modal-title text-h2">
              تسجيل معاملة سريعة
            </h3>
            <span className="modal-subtitle text-caption">
              تسجيل فوري للمصاريف والمدخولات في ثوانٍ معدودة
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق النافذة"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Transaction Type Segmented Control */}
        <div className="segmented-control" role="tablist" aria-label="نوع المعاملة">
          <button
            type="button"
            role="tab"
            aria-selected={selectedType === 'expense'}
            className={`segmented-tab ${selectedType === 'expense' ? 'is-active type-expense' : ''}`}
            onClick={() => setSelectedType('expense')}
          >
            مصروف
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedType === 'income'}
            className={`segmented-tab ${selectedType === 'income' ? 'is-active type-income' : ''}`}
            onClick={() => setSelectedType('income')}
          >
            دخل
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedType === 'transfer'}
            className={`segmented-tab ${selectedType === 'transfer' ? 'is-active type-transfer' : ''}`}
            onClick={() => setSelectedType('transfer')}
          >
            تحويل داخلي
          </button>
        </div>

        {/* Placeholder Content Ready for F009 */}
        <div className="quick-add-body">
          <div className="quick-add-amount-preview">
            <span className="amount-currency text-body">ر.س</span>
            <span className="amount-digits text-display">0.00</span>
          </div>

          <p className="quick-add-hint text-caption">
            جاهز لاستقبال تدفق الإدخال السريع (&lt;5 ثوانٍ) في الميزة التالية (F009).
          </p>
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
          >
            حفظ المعاملة
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
