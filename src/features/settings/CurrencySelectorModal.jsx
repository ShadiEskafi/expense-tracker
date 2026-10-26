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

/**
 * Common regional currencies in the Middle East & Arab region,
 * including the Israeli New Shekel (ILS) widely used in Palestinian territories.
 */
const REGIONAL_CURRENCIES = ['SAR', 'AED', 'ILS', 'EGP', 'KWD', 'JOD', 'QAR', 'BHD', 'OMR', 'IQD'];

/**
 * Ordered priority list for intuitive discovery without burying regional currencies
 */
const CURRENCY_PRIORITY_ORDER = [
  'SAR', 'USD', 'EUR', 'AED', 'ILS', 'EGP', 'KWD', 'JOD', 'QAR', 'BHD', 'OMR', 'GBP', 'TRY', 'IQD', 'JPY', 'KRW'
];

/**
 * Normalizes Arabic text for flexible multi-variant search
 */
function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .trim();
}

/**
 * CurrencySelectorModal (F014 + UX Polish)
 *
 * Implements mobile-native bottom sheet modal for base currency configuration:
 * - Read-only locked state when financial records exist
 * - Interactive searchable selection when unlocked
 * - Full ILS (Israeli New Shekel) currency support
 */
export function CurrencySelectorModal({
  isOpen,
  onClose,
  currentCurrency = 'SAR',
  onSelectCurrency,
  isLocked = false,
  lockExplanation = ''
}) {
  if (!isOpen) return null;

  return (
    <CurrencySelectorDialog
      onClose={onClose}
      currentCurrency={currentCurrency}
      onSelectCurrency={onSelectCurrency}
      isLocked={isLocked}
      lockExplanation={lockExplanation}
    />
  );
}

function CurrencySelectorDialog({
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

  // Auto-focus search input when unlocked
  useEffect(() => {
    if (!isLocked) {
      searchInputRef.current?.focus();
    }
  }, [isLocked]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  // Retrieve currencies sorted by priority order
  const allCurrenciesList = useMemo(() => {
    const list = getAllCurrencies();
    return list.sort((a, b) => {
      const idxA = CURRENCY_PRIORITY_ORDER.indexOf(a.code);
      const idxB = CURRENCY_PRIORITY_ORDER.indexOf(b.code);
      const posA = idxA === -1 ? 999 : idxA;
      const posB = idxB === -1 ? 999 : idxB;
      return posA - posB;
    });
  }, []);

  const activeCurrencyMeta = useMemo(() => {
    return CURRENCIES[currentCurrency] || CURRENCIES.SAR;
  }, [currentCurrency]);

  const filteredCurrencies = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);

    return allCurrenciesList.filter((item) => {
      // Scope filter
      const isRegional = REGIONAL_CURRENCIES.includes(item.code);
      if (selectedScope === 'arab' && !isRegional) {
        return false;
      }
      if (selectedScope === 'global' && isRegional) {
        return false;
      }

      // Query filter
      if (!normalizedQuery) return true;

      const codeMatch = item.code.toLowerCase().includes(normalizedQuery);
      const nameArMatch = normalizeSearchText(item.nameAr).includes(normalizedQuery);
      const nameArShortMatch = item.nameArShort ? normalizeSearchText(item.nameArShort).includes(normalizedQuery) : false;
      const nameEnMatch = (item.nameEn || '').toLowerCase().includes(normalizedQuery);
      const symbolArMatch = normalizeSearchText(item.symbolAr).includes(normalizedQuery);
      const symbolEnMatch = (item.symbolEn || '').toLowerCase().includes(normalizedQuery);

      return codeMatch || nameArMatch || nameArShortMatch || nameEnMatch || symbolArMatch || symbolEnMatch;
    });
  }, [allCurrenciesList, searchQuery, selectedScope]);

  const handleConfirm = async () => {
    if (isLocked) {
      onClose();
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

  return (
    <div
      className="currency-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="presentation"
    >
      <div
        className={`currency-modal-card ${isLocked ? 'is-locked-view' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="currency-modal-title"
      >
        {/* Mobile Drag Handle */}
        <div className="sheet-drag-handle" aria-hidden="true" />

        {/* ==============================================================
            LOCKED READ-ONLY STATE
            ============================================================== */}
        {isLocked ? (
          <>
            {/* Header */}
            <div className="currency-modal-header">
              <div className="currency-header-title-wrap">
                <div className="currency-header-icon-badge locked" aria-hidden="true">
                  <LockIcon size={20} />
                </div>
                <div>
                  <h2 id="currency-modal-title" className="currency-modal-title">
                    العملة الأساسية مقفلة
                  </h2>
                  <p className="currency-modal-subtitle">
                    حماية سلامة السجلات المالية والأرصدة
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="currency-modal-close-btn"
                onClick={onClose}
                aria-label="إغلاق النافذة"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* Locked Content Body */}
            <div className="currency-locked-body">
              {/* Educational Explanation Banner */}
              <div className="currency-locked-callout" role="alert">
                <LockIcon size={20} className="locked-callout-icon" />
                <div className="locked-callout-text">
                  <strong>تعديل العملة مقفل حالياً</strong>
                  <p>
                    {lockExplanation ||
                      'لا يمكن تغيير العملة بعد تسجيل بيانات مالية، لأن التطبيق لا يقوم بتحويل القيم القديمة بين العملات.'}
                  </p>
                </div>
              </div>

              {/* Active Currency Display Card */}
              <div className="currency-active-card">
                <span className="currency-active-label">العملة الأساسية النشطة حالياً:</span>
                <div className="currency-active-row">
                  <div className="currency-option-flag" aria-hidden="true">
                    {activeCurrencyMeta.flag}
                  </div>
                  <div className="currency-active-details">
                    <span className="currency-active-name">{activeCurrencyMeta.nameAr}</span>
                    <div className="currency-active-badges">
                      <span className="currency-badge-code" dir="ltr">{activeCurrencyMeta.code}</span>
                      <span className="currency-badge-symbol" dir="ltr">{activeCurrencyMeta.symbolAr}</span>
                    </div>
                  </div>
                  <div className="currency-locked-status-pill">
                    <CheckIcon size={14} />
                    <span>معتمدة</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Read-Only Footer */}
            <div className="currency-modal-footer">
              <button
                type="button"
                className="currency-primary-btn full-width"
                onClick={onClose}
              >
                حسناً، فهمت ذلك
              </button>
            </div>
          </>
        ) : (
          /* ==============================================================
             UNLOCKED SELECTION STATE
             ============================================================== */
          <>
            {/* Header */}
            <div className="currency-modal-header">
              <div className="currency-header-title-wrap">
                <div>
                  <h2 id="currency-modal-title" className="currency-modal-title">
                    اختيار العملة الأساسية
                  </h2>
                  <p className="currency-modal-subtitle">
                    حدد العملة المعتمدة لكافة حساباتك ومعاملاتك وتقاريرك المالية
                  </p>
                </div>
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

            {/* Error message */}
            {errorMessage && (
              <div className="currency-modal-error-alert" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Search Input */}
            <div className="currency-search-container">
              <SearchIcon size={18} className="currency-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                className="currency-search-input"
                placeholder="ابحث بالاسم، الرمز، أو الكود (مثل شيكل، ILS، ريال، SAR)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                <div className="currency-empty-search">
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
                      className={`currency-option-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCode(item.code)}
                    >
                      <div className="currency-option-flag" aria-hidden="true">
                        {item.flag}
                      </div>

                      <div className="currency-option-info">
                        <span className="currency-option-name">
                          {item.nameAr}
                        </span>
                        <div className="currency-option-meta-tags">
                          <span className="currency-option-code" dir="ltr">
                            {item.code}
                          </span>
                          <span className="currency-option-symbol" dir="ltr">
                            {item.symbolAr}
                          </span>
                        </div>
                      </div>

                      <div className={`currency-option-radio ${isSelected ? 'checked' : ''}`} aria-hidden="true">
                        {isSelected && <CheckIcon size={14} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="currency-modal-footer">
              <button
                type="button"
                className="currency-secondary-btn"
                onClick={onClose}
                disabled={isSubmitting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="currency-primary-btn currency-confirm-btn"
                onClick={handleConfirm}
                disabled={isSubmitting || selectedCode === currentCurrency}
              >
                {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد العملة الأساسية'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
