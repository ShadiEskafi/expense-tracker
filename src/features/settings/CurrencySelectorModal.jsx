import { useState, useMemo, useEffect, useRef } from 'react';
import {
  CloseIcon,
  SearchIcon,
  CheckIcon,
  LockIcon
} from '../../components/common/Icons.jsx';
import { CURRENCIES, getAllCurrencies } from '../../utils/currency.js';

/**
 * Filter scopes for currencies
 */
const SCOPES = [
  { id: 'all', label: 'الكل' },
  { id: 'arab', label: 'العملات العربية' },
  { id: 'global', label: 'العملات العالمية' }
];

const ARAB_CURRENCIES = ['SAR', 'AED', 'KWD', 'EGP', 'QAR', 'BHD', 'OMR', 'JOD'];

export function CurrencySelectorModal({
  isOpen,
  onClose,
  currentCurrency = 'SAR',
  onSelectCurrency,
  isLocked = false,
  lockExplanation = ''
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState('all');
  const [selectedCode, setSelectedCode] = useState(currentCurrency);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const searchInputRef = useRef(null);

  // Auto-focus search input on mount
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle ESC key
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

  const allCurrenciesList = useMemo(() => {
    return getAllCurrencies();
  }, []);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allCurrenciesList.filter((item) => {
      // Scope filter
      if (selectedScope === 'arab' && !ARAB_CURRENCIES.includes(item.code)) {
        return false;
      }
      if (selectedScope === 'global' && ARAB_CURRENCIES.includes(item.code)) {
        return false;
      }

      // Query filter
      if (!q) return true;

      const codeMatch = item.code.toLowerCase().includes(q);
      const nameArMatch = item.nameAr.toLowerCase().includes(q);
      const nameEnMatch = item.nameEn.toLowerCase().includes(q);
      const symbolArMatch = item.symbolAr.toLowerCase().includes(q);
      const symbolEnMatch = item.symbolEn.toLowerCase().includes(q);

      return codeMatch || nameArMatch || nameEnMatch || symbolArMatch || symbolEnMatch;
    });
  }, [allCurrenciesList, searchQuery, selectedScope]);

  const handleConfirm = async () => {
    if (isLocked) {
      setErrorMessage(lockExplanation || 'العملة مقفلة ولا يمكن تعديلها لوجود بيانات مسجلة.');
      return;
    }

    if (!selectedCode || !CURRENCIES[selectedCode]) {
      setErrorMessage('يرجى اختيار عملة صالحة من القائمة.');
      return;
    }

    if (selectedCode === currentCurrency) {
      onClose();
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onSelectCurrency(selectedCode);
      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'حدث خطأ أثناء حفظ العملة الأساسية.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="currency-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="currency-modal-card surface-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="currency-modal-title"
      >
        {/* Header */}
        <div className="currency-modal-header">
          <div>
            <h2 id="currency-modal-title" className="text-h3">
              اختيار العملة الأساسية
            </h2>
            <p className="text-caption">
              حدد العملة المعتمدة لكافة حساباتك ومعاملاتك وتقاريرك المالية
            </p>
          </div>
          <button
            type="button"
            className="currency-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق نافذة العملات"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Lock warning if locked */}
        {isLocked && (
          <div className="currency-modal-lock-alert" role="alert">
            <LockIcon size={18} className="lock-alert-icon" />
            <div className="lock-alert-text">
              <strong className="text-body font-semibold">تعديل العملة مقفل حالياً</strong>
              <p className="text-caption">{lockExplanation}</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="currency-modal-error-alert" role="alert">
            <span className="text-caption">{errorMessage}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="currency-search-container">
          <SearchIcon size={18} className="currency-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="currency-search-input text-body"
            placeholder="ابحث باسم العملة، الرمز، أو كود ISO (مثل SAR، درهم، USD)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLocked}
            aria-label="البحث عن عملة"
          />
          {searchQuery && (
            <button
              type="button"
              className="currency-search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="مسح نص البحث"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        {/* Filter scopes */}
        <div className="currency-scopes-row" role="tablist" aria-label="تصنيفات العملات">
          {SCOPES.map((scope) => (
            <button
              key={scope.id}
              type="button"
              role="tab"
              aria-selected={selectedScope === scope.id}
              className={`currency-scope-pill ${selectedScope === scope.id ? 'active' : ''}`}
              onClick={() => setSelectedScope(scope.id)}
            >
              {scope.label}
            </button>
          ))}
        </div>

        {/* Currency Options List */}
        <div
          className="currency-options-list"
          role="radiogroup"
          aria-label="قائمة العملات المدعومة"
        >
          {filteredCurrencies.length === 0 ? (
            <div className="currency-empty-search text-caption">
              لم يتم العثور على عملة مطابقة لبحثك «{searchQuery}»
            </div>
          ) : (
            filteredCurrencies.map((item) => {
              const isSelected = selectedCode === item.code;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isLocked}
                  className={`currency-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedCode(item.code)}
                >
                  <div className="currency-option-flag" aria-hidden="true">
                    {item.flag}
                  </div>

                  <div className="currency-option-info">
                    <div className="currency-option-title-row">
                      <span className="currency-option-name text-body font-semibold">
                        {item.nameAr}
                      </span>
                      <span className="currency-option-code tabular-nums text-caption">
                        {item.code}
                      </span>
                    </div>
                    <div className="currency-option-sub-row">
                      <span className="currency-option-symbol text-caption">
                        الرمز: <strong>{item.symbolAr}</strong> ({item.symbolEn})
                      </span>
                      <span className="currency-option-exp text-micro">
                        {item.exponent === 3 ? '3 خانات (فلس)' : 'خانتان عشريتان'}
                      </span>
                    </div>
                  </div>

                  <div className={`currency-option-radio ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <CheckIcon size={14} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="currency-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="btn-primary currency-confirm-btn"
            onClick={handleConfirm}
            disabled={isLocked || isSubmitting || selectedCode === currentCurrency}
          >
            {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد العملة الأساسية'}
          </button>
        </div>
      </div>
    </div>
  );
}
