import { useState, useEffect } from 'react';
import {
  CloseIcon,
  FilterIcon,
  RotateCcwIcon,
  CheckIcon,
  CategoryIcon,
  WalletIcon
} from '../../components/common/Icons.jsx';
import { DATE_PRESETS } from './filter.js';

/**
 * Transaction Filter Drawer (F011)
 * Slide-in drawer or modal for advanced multi-filtering by:
 * - Transaction type
 * - Multiple categories
 * - Multiple accounts
 * - Date preset & custom date range
 * - Amount bounds (min / max)
 * - Tags
 *
 * Compliant with:
 * - design-system/screens.md § 2
 * - /impeccable, /make-interfaces-feel-better, /ui-ux-pro-max
 */
export function TransactionFilterDrawer({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  categories = [],
  accounts = []
}) {
  const [draft, setDraft] = useState(filters);

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTypeToggle = (type) => {
    setDraft((prev) => ({
      ...prev,
      type: prev.type === type ? 'all' : type
    }));
  };

  const handleCategoryToggle = (catId) => {
    setDraft((prev) => {
      const current = prev.categoryIds || [];
      const next = current.includes(catId)
        ? current.filter((id) => id !== catId)
        : [...current, catId];
      return { ...prev, categoryIds: next };
    });
  };

  const handleAccountToggle = (accId) => {
    setDraft((prev) => {
      const current = prev.accountIds || [];
      const next = current.includes(accId)
        ? current.filter((id) => id !== accId)
        : [...current, accId];
      return { ...prev, accountIds: next };
    });
  };

  const handleDatePresetChange = (presetId) => {
    setDraft((prev) => ({
      ...prev,
      datePreset: presetId
    }));
  };

  const handleApply = (e) => {
    e.preventDefault();
    onApplyFilters(draft);
    onClose();
  };

  const handleReset = () => {
    onResetFilters();
    onClose();
  };

  // Filter categories relevant to type selection
  const visibleCategories = categories.filter((c) => {
    if (draft.type === 'expense') return c.type === 'expense';
    if (draft.type === 'income') return c.type === 'income';
    return true;
  });

  return (
    <div
      className="filter-drawer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="filter-drawer-panel surface-card"
        role="dialog"
        aria-modal="true"
        aria-label="خيارات التصفية المتقدمة"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />
        {/* Header */}
        <div className="filter-drawer-header">
          <div className="header-title-wrap">
            <FilterIcon size={20} className="filter-header-icon" />
            <h2 className="text-h3">تصفية المعاملات المتقدمة</h2>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="إغلاق التصفية"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="filter-drawer-body">
          {/* 1. Transaction Type */}
          <div className="filter-section">
            <label className="filter-section-title text-caption-bold">نوع المعاملة</label>
            <div className="type-segmented-group" role="radiogroup">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'expense', label: 'مصاريف' },
                { id: 'income', label: 'دخل' },
                { id: 'transfer', label: 'تحويلات' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.type === t.id}
                  className={`type-btn ${draft.type === t.id ? 'active' : ''}`}
                  onClick={() => handleTypeToggle(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Date Presets & Custom Range */}
          <div className="filter-section">
            <label className="filter-section-title text-caption-bold">الفترة الزمنية</label>
            <div className="presets-chips-grid">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`preset-chip ${draft.datePreset === p.id ? 'active' : ''}`}
                  onClick={() => handleDatePresetChange(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {draft.datePreset === 'custom' && (
              <div className="custom-date-inputs">
                <div className="form-field">
                  <label htmlFor="filter-start-date" className="text-caption">من تاريخ</label>
                  <input
                    id="filter-start-date"
                    type="date"
                    className="input-field"
                    value={draft.startDate || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="filter-end-date" className="text-caption">إلى تاريخ</label>
                  <input
                    id="filter-end-date"
                    type="date"
                    className="input-field"
                    value={draft.endDate || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Categories Selection */}
          {visibleCategories.length > 0 && draft.type !== 'transfer' && (
            <div className="filter-section">
              <div className="section-header-row">
                <label className="filter-section-title text-caption-bold">التصنيفات</label>
                {draft.categoryIds?.length > 0 && (
                  <button
                    type="button"
                    className="clear-link text-caption"
                    onClick={() => setDraft((prev) => ({ ...prev, categoryIds: [] }))}
                  >
                    إلغاء التحديد ({draft.categoryIds.length})
                  </button>
                )}
              </div>
              <div className="categories-chips-wrap">
                {visibleCategories.map((cat) => {
                  const isSelected = draft.categoryIds?.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`cat-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleCategoryToggle(cat.id)}
                    >
                      <span
                        className="cat-dot"
                        style={{ backgroundColor: cat.color || 'var(--color-brand-primary)' }}
                      >
                        <CategoryIcon name={cat.icon} size={14} />
                      </span>
                      <span className="cat-chip-name">{cat.name}</span>
                      {isSelected && <CheckIcon size={14} className="check-indicator" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Accounts Selection */}
          {accounts.length > 0 && (
            <div className="filter-section">
              <div className="section-header-row">
                <label className="filter-section-title text-caption-bold">الحسابات والمحافظ</label>
                {draft.accountIds?.length > 0 && (
                  <button
                    type="button"
                    className="clear-link text-caption"
                    onClick={() => setDraft((prev) => ({ ...prev, accountIds: [] }))}
                  >
                    إلغاء التحديد ({draft.accountIds.length})
                  </button>
                )}
              </div>
              <div className="accounts-chips-wrap">
                {accounts.map((acc) => {
                  const isSelected = draft.accountIds?.includes(acc.id);
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      className={`acc-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleAccountToggle(acc.id)}
                    >
                      <WalletIcon size={14} className="acc-chip-icon" />
                      <span className="acc-chip-name">{acc.name}</span>
                      {isSelected && <CheckIcon size={14} className="check-indicator" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Amount Range (Minor units) */}
          <div className="filter-section">
            <label className="filter-section-title text-caption-bold">نطاق المبلغ (ر.س)</label>
            <div className="amount-range-grid">
              <div className="form-field">
                <label htmlFor="filter-min-amount" className="text-caption">الحد الأدنى</label>
                <input
                  id="filter-min-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="input-field tnum"
                  value={draft.minAmount !== null && draft.minAmount !== undefined ? draft.minAmount / 100 : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100);
                    setDraft((prev) => ({ ...prev, minAmount: isNaN(val) ? null : val }));
                  }}
                />
              </div>
              <div className="form-field">
                <label htmlFor="filter-max-amount" className="text-caption">الحد الأقصى</label>
                <input
                  id="filter-max-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="لا يوجد"
                  className="input-field tnum"
                  value={draft.maxAmount !== null && draft.maxAmount !== undefined ? draft.maxAmount / 100 : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100);
                    setDraft((prev) => ({ ...prev, maxAmount: isNaN(val) ? null : val }));
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="filter-drawer-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleReset}
          >
            <RotateCcwIcon size={16} />
            <span>إعادة ضبط</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleApply}
          >
            <CheckIcon size={16} />
            <span>تطبيق الفلاتر</span>
          </button>
        </div>
      </div>
    </div>
  );
}
