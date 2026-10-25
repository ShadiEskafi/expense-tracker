import { useState, useEffect } from 'react';
import {
  CloseIcon,
  CategoryIcon
} from '../../components/common/Icons';
import {
  getCategoryUsage,
  getReassignmentCandidates
} from '../../services/categoryGuard';
import { hexToRgba } from './categoryConstants';

function CategoryDeleteModalContent({
  category,
  database,
  onConfirmDelete,
  onClose
}) {
  const [loading, setLoading] = useState(true);
  const [transactionCount, setTransactionCount] = useState(0);
  const [candidates, setCandidates] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  // Load usage count and candidates asynchronously when mounted
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getCategoryUsage(category.id, database),
      getReassignmentCandidates(category.id, database)
    ])
      .then(([usage, replacementCandidates]) => {
        if (!isMounted) return;
        setTransactionCount(usage.transactionCount);
        setCandidates(replacementCandidates);
        if (replacementCandidates.length > 0) {
          setSelectedTargetId(replacementCandidates[0].id);
        } else {
          setSelectedTargetId('');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'تعذر التحقق من المعاملات المرتبطة');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [category.id, database]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onClose]);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError('');

      if (transactionCount > 0 && !selectedTargetId) {
        throw new Error('يرجى اختيار تصنيف بديل لنقل المعاملات إليه قبل الحذف');
      }

      await onConfirmDelete({
        categoryId: category.id,
        reassignToCategoryId: transactionCount > 0 ? selectedTargetId : null
      });

      onClose();
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حذف التصنيف');
    } finally {
      setIsDeleting(false);
    }
  };

  const badgeBg = hexToRgba(category.color, 0.15);

  return (
    <div
      className="cat-modal-container cat-delete-modal-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div className="sheet-drag-handle" aria-hidden="true" />
      {/* Header */}
      <div className="cat-modal-header">
        <div className="cat-modal-header-titles">
          <h3 id="delete-modal-title" className="cat-modal-title text-danger">
            حذف التصنيف
          </h3>
          <p className="cat-modal-subtitle">
            حذف تصنيف «{category.name}» مع التحقق من المعاملات
          </p>
        </div>
        <button
          type="button"
          className="cat-modal-close-btn"
          onClick={onClose}
          aria-label="إغلاق النافذة"
          disabled={isDeleting}
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="cat-modal-body">
        {/* Target Category Header Card */}
        <div className="cat-delete-target-preview">
          <div
            className="cat-preview-icon-wrap"
            style={{ backgroundColor: badgeBg, color: category.color }}
            aria-hidden="true"
          >
            <CategoryIcon name={category.icon} size={24} />
          </div>
          <div className="cat-delete-target-meta">
            <span className="cat-delete-target-name">{category.name}</span>
            <span className="cat-delete-target-type">
              {category.type === 'expense' ? 'تصنيف مصروف' : 'تصنيف دخل'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="cat-delete-loading-state">
            <span className="cat-spinner" aria-hidden="true" />
            <p>جاري فحص المعاملات المرتبطة بالتصنيف...</p>
          </div>
        ) : transactionCount === 0 ? (
          /* Case 1: Zero active transactions */
          <div className="cat-delete-safe-prompt">
            <div className="cat-safe-badge-banner">
              <span className="cat-safe-icon" aria-hidden="true">✓</span>
              <div>
                <strong>لا توجد معاملات مسجلة</strong>
                <p>
                  هذا التصنيف غير مرتبط بأي معاملات حالية، ويمكن حذفه بأمان دون التأثير
                  على أي أرقام أو تقارير.
                </p>
              </div>
            </div>
            <p className="cat-delete-confirm-text">
              هل أنت متأكد من رغبتك في حذف تصنيف «{category.name}»؟
            </p>
          </div>
        ) : (
          /* Case 2: In-use category requiring reassignment guard */
          <div className="cat-delete-guard-section">
            <div className="cat-guard-alert-banner">
              <div className="cat-guard-alert-header">
                <span className="cat-guard-badge" aria-hidden="true">!</span>
                <strong>حماية سلامة البيانات المالية</strong>
              </div>
              <p>
                هذا التصنيف مرتبط بـ{' '}
                <strong className="tabular-num">{transactionCount}</strong>{' '}
                {transactionCount === 1 ? 'معاملة نشطة' : 'معاملات نشطة'}. لحماية سجلاتك
                المالية وتفادي وجود معاملات يتيمة، يجب نقل كافة المعاملات إلى تصنيف بديل
                قبل إتمام الحذف.
              </p>
            </div>

            {candidates.length === 0 ? (
              <div className="cat-no-candidates-warning">
                لا توجد تصنيفات أخرى متاحة من نوع «
                {category.type === 'expense' ? 'مصروف' : 'دخل'}» لنقل المعاملات إليها. يرجى
                إنشاء تصنيف جديد أولاً قبل حذف هذا التصنيف.
              </div>
            ) : (
              <div className="cat-reassignment-select-group">
                <label htmlFor="reassignment-target-select" className="cat-form-label">
                  اختر التصنيف البديل لنقل المعاملات إليه:
                </label>
                <select
                  id="reassignment-target-select"
                  className="cat-form-select"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                >
                  {candidates.map((cand) => (
                    <option key={cand.id} value={cand.id}>
                      {cand.name} {cand.is_default ? '(افتراضي)' : '(مخصص)'}
                    </option>
                  ))}
                </select>

                <p className="cat-reassignment-hint">
                  سيتم نقل جميع الـ <span className="tabular-num">{transactionCount}</span> معاملات
                  تلقائياً إلى التصنيف المختار داخل معاملة ذرية آمنة.
                </p>
              </div>
            )}
          </div>
        )}

        {error && <div className="cat-modal-error-banner">{error}</div>}
      </div>

      {/* Footer */}
      <div className="cat-modal-footer">
        <button
          type="button"
          className="cat-btn cat-btn-secondary"
          onClick={onClose}
          disabled={isDeleting}
        >
          إلغاء
        </button>

        <button
          type="button"
          className="cat-btn cat-btn-danger"
          onClick={handleDelete}
          disabled={
            loading ||
            isDeleting ||
            (transactionCount > 0 && (!selectedTargetId || candidates.length === 0))
          }
        >
          {isDeleting
            ? 'جاري التنفيذ...'
            : transactionCount > 0
            ? 'نقل المعاملات وحذف التصنيف'
            : 'تأكيد الحذف'}
        </button>
      </div>
    </div>
  );
}

/**
 * CategoryDeleteModal — Deletion Guard & Transaction Reassignment Modal
 * Protects financial records by preventing accidental deletion of categories
 * referenced by active transactions.
 * Follows /impeccable, /make-interfaces-feel-better, and /transitions-dev.
 */
export function CategoryDeleteModal({
  isOpen,
  category = null,
  database,
  onConfirmDelete,
  onClose
}) {
  if (!isOpen || !category) return null;

  return (
    <div
      className="cat-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <CategoryDeleteModalContent
        key={category.id}
        category={category}
        database={database}
        onConfirmDelete={onConfirmDelete}
        onClose={onClose}
      />
    </div>
  );
}
