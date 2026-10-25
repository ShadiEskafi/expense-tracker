import { useEffect } from 'react';
import { DownloadIcon, CloseIcon, FilterIcon, TransactionsIcon } from '../../components/common/Icons.jsx';

/**
 * Transaction Export Options Modal (F015)
 *
 * Prompts the user when active filters exist to choose between exporting
 * only the filtered results or the entire transaction history.
 *
 * @see design-system/user-flows.md § 10
 * @see design-system/screens.md § 2
 */
export function TransactionExportModal({
  isOpen,
  onClose,
  filteredCount,
  totalCount,
  onExportFiltered,
  onExportAll,
  isExporting
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isExporting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!isExporting) onClose();
      }}
    >
      <div
        className="modal-content surface-card export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        aria-describedby="export-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />

        <div className="modal-header">
          <div className="export-icon-badge" aria-hidden="true">
            <DownloadIcon size={24} className="color-primary" />
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={isExporting}
            aria-label="إغلاق نافذة التصدير"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="export-dialog-body">
          <h2 id="export-dialog-title" className="text-h2">
            خيارات تصدير ملف CSV
          </h2>
          <p id="export-dialog-desc" className="text-caption">
            لديك فلاتر تصفية نشطة حالياً. يرجى تحديد نطاق المعاملات الذي ترغب في تصديره بترميز UTF-8 المتوافق مع برامج الجداول:
          </p>

          <div className="export-options-list">
            {/* Option 1: Filtered Transactions */}
            <button
              type="button"
              className="export-option-card surface-card"
              onClick={onExportFiltered}
              disabled={isExporting || filteredCount === 0}
              aria-label={`تصدير النتائج المفلترة فقط (${filteredCount} معاملة)`}
            >
              <div className="export-option-icon" aria-hidden="true">
                <FilterIcon size={20} />
              </div>
              <div className="export-option-content">
                <div className="export-option-title-row">
                  <span className="text-body font-semibold">تصدير النتائج المفلترة فقط</span>
                  <span className="badge badge-active tnum">{filteredCount} معاملة</span>
                </div>
                <span className="text-caption">
                  تصدير المعاملات المطابقة لمعايير البحث والفلاتر الحالية فقط
                </span>
              </div>
            </button>

            {/* Option 2: All Transactions */}
            <button
              type="button"
              className="export-option-card surface-card"
              onClick={onExportAll}
              disabled={isExporting || totalCount === 0}
              aria-label={`تصدير كافة المعاملات (${totalCount} معاملة)`}
            >
              <div className="export-option-icon" aria-hidden="true">
                <TransactionsIcon size={20} />
              </div>
              <div className="export-option-content">
                <div className="export-option-title-row">
                  <span className="text-body font-semibold">تصدير السجل بالكامل</span>
                  <span className="badge tnum">{totalCount} معاملة</span>
                </div>
                <span className="text-caption">
                  تصدير كافة المعاملات المسجلة في التطبيق دون التقيد بالفلاتر
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary modal-cancel-btn"
            onClick={onClose}
            disabled={isExporting}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
