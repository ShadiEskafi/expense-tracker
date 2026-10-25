import { useState } from 'react';
import {
  CloseIcon,
  CheckIcon,
  CategoryIcon
} from '../../components/common/Icons';
import {
  CATEGORY_COLOR_PALETTE,
  CATEGORY_ICON_OPTIONS,
  hexToRgba
} from './categoryConstants';

/**
 * Inner form component with clean state initialization from props.
 * Re-mounted with key whenever category changes.
 */
function CategoryFormContent({
  category,
  defaultType,
  onSave,
  onClose,
  isSubmitting,
  setIsSubmitting
}) {
  const isEditing = Boolean(category);

  const [name, setName] = useState(() => (category ? category.name || '' : ''));
  const [type, setType] = useState(() => (category ? category.type || 'expense' : defaultType));
  const [icon, setIcon] = useState(() =>
    category
      ? category.icon || (category.type === 'income' ? 'banknote' : 'tag')
      : defaultType === 'income'
      ? 'banknote'
      : 'tag'
  );
  const [color, setColor] = useState(() =>
    category
      ? category.color || '#6366F1'
      : defaultType === 'income'
      ? '#059669'
      : '#F97316'
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('يرجى إدخال اسم التصنيف');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSave({
        id: category?.id,
        name: trimmed,
        type,
        icon,
        color,
        is_default: category?.is_default || false
      });
      onClose();
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ التصنيف');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewBadgeBg = hexToRgba(color, 0.15);

  return (
    <form onSubmit={handleSubmit} className="cat-modal-form" noValidate>
      {/* Category Type Toggle */}
      <div className="cat-form-group">
        <label className="cat-form-label" id="type-select-label">
          نوع التصنيف
        </label>
        <div
          className="cat-type-segmented"
          role="radiogroup"
          aria-labelledby="type-select-label"
        >
          <button
            type="button"
            role="radio"
            aria-checked={type === 'expense'}
            className={`cat-type-seg-btn ${type === 'expense' ? 'active expense' : ''}`}
            onClick={() => {
              setType('expense');
              if (!isEditing && color === '#059669') setColor('#F97316');
            }}
          >
            مصروف
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={type === 'income'}
            className={`cat-type-seg-btn ${type === 'income' ? 'active income' : ''}`}
            onClick={() => {
              setType('income');
              if (!isEditing && color === '#F97316') setColor('#059669');
            }}
          >
            دخل
          </button>
        </div>
      </div>

      {/* Name Field */}
      <div className="cat-form-group">
        <label htmlFor="cat-name-input" className="cat-form-label">
          اسم التصنيف <span className="cat-required-mark">*</span>
        </label>
        <input
          id="cat-name-input"
          type="text"
          className={`cat-form-input ${error ? 'has-error' : ''}`}
          placeholder="مثال: اشتراكات، رحلات، استشارات..."
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          maxLength={40}
          autoComplete="off"
          autoFocus
        />
        {error && <span className="cat-form-error-msg">{error}</span>}
      </div>

      {/* Live Preview Card */}
      <div className="cat-preview-section">
        <span className="cat-form-label">معاينة بطاقة التصنيف</span>
        <div className="cat-preview-card">
          <div
            className="cat-preview-icon-wrap"
            style={{ backgroundColor: previewBadgeBg, color }}
            aria-hidden="true"
          >
            <CategoryIcon name={icon} size={24} />
          </div>
          <div className="cat-preview-info">
            <span className="cat-preview-title">
              {name.trim() || 'اسم التصنيف'}
            </span>
            <span className="cat-preview-type">
              {type === 'expense' ? 'تصنيف مصروف' : 'تصنيف دخل'}
            </span>
          </div>
          <div className="cat-preview-pill" style={{ color, borderColor: previewBadgeBg }}>
            {isEditing && category?.is_default ? 'افتراضي' : 'مخصص'}
          </div>
        </div>
      </div>

      {/* Icon Picker */}
      <div className="cat-form-group">
        <label className="cat-form-label" id="icon-picker-label">
          اختر الأيقونة
        </label>
        <div
          className="cat-icon-grid"
          role="radiogroup"
          aria-labelledby="icon-picker-label"
        >
          {CATEGORY_ICON_OPTIONS.map((item) => {
            const isSelected = icon === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`cat-icon-option-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => setIcon(item.id)}
                title={item.label}
                aria-label={item.label}
              >
                <CategoryIcon name={item.id} size={22} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Picker */}
      <div className="cat-form-group">
        <label className="cat-form-label" id="color-picker-label">
          اختر اللون الدلالي
        </label>
        <div
          className="cat-color-grid"
          role="radiogroup"
          aria-labelledby="color-picker-label"
        >
          {CATEGORY_COLOR_PALETTE.map((c) => {
            const isSelected = color.toUpperCase() === c.hex.toUpperCase();
            return (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`cat-color-swatch-btn ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => setColor(c.hex)}
                title={c.label}
                aria-label={c.label}
              >
                {isSelected && (
                  <CheckIcon size={16} className="cat-color-check-icon" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal Footer / Actions */}
      <div className="cat-modal-footer">
        <button
          type="button"
          className="cat-btn cat-btn-secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          إلغاء
        </button>
        <button
          type="submit"
          className="cat-btn cat-btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'جاري الحفظ...'
            : isEditing
            ? 'حفظ التعديلات'
            : 'إضافة التصنيف'}
        </button>
      </div>
    </form>
  );
}

/**
 * CategoryFormModal — Accessible Dialog for Creating and Editing Categories
 * Conforms to /impeccable, /make-interfaces-feel-better, and /transitions-dev.
 */
export function CategoryFormModal({
  isOpen,
  category = null,
  defaultType = 'expense',
  onSave,
  onClose
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isEditing = Boolean(category);

  return (
    <div
      className="cat-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="presentation"
    >
      <div
        className="cat-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
      >
        {/* Modal Header */}
        <div className="cat-modal-header">
          <div className="cat-modal-header-titles">
            <h3 id="category-modal-title" className="cat-modal-title">
              {isEditing ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}
            </h3>
            <p className="cat-modal-subtitle">
              {isEditing
                ? `تخصيص بيانات وأيقونة ولون تصنيف «${category.name}»`
                : 'أنشئ تصنيفاً مخصصاً يناسب نمط نفقاتك أو إيراداتك'}
            </p>
          </div>
          <button
            type="button"
            className="cat-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            disabled={isSubmitting}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Modal Form Content */}
        <CategoryFormContent
          key={category?.id || 'new-category'}
          category={category}
          defaultType={defaultType}
          onSave={onSave}
          onClose={onClose}
          isSubmitting={isSubmitting}
          setIsSubmitting={setIsSubmitting}
        />
      </div>
    </div>
  );
}
