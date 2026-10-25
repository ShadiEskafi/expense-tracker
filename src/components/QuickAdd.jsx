import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../db/db.js';
import { createTransaction } from '../services/transaction.js';
import { createTransfer } from '../services/transfer.js';
import { getAccounts } from '../services/account.js';
import { getCategories } from '../services/category.js';
import { parseAmountInput, DEFAULT_CURRENCY_CODE } from '../utils/currency.js';
import { LAST_USED_ACCOUNT_KEY, getTodayIsoDate } from './quickAddConstants.js';
import {
  CloseIcon,
  PlusIcon,
  CheckIcon,
  CalendarIcon,
  WalletIcon,
  TransferIcon,
  TagIcon,
  NoteIcon,
  CategoryIcon,
} from './common/Icons.jsx';
import './QuickAdd.css';

/**
 * Quick Add Transaction Flow (<5s Target)
 * Modal / Bottom-Sheet component for rapid, accessible transaction entry.
 *
 * References:
 * - project-summary.md § 23 (FTUX & Quick Add Flow <5s UX Target)
 * - design-system/forms.md & screens.md
 * - skills: transitions-dev, make-interfaces-feel-better, ui-ux-pro-max, impeccable
 */
export function QuickAdd({
  isOpen = false,
  onClose,
  onSuccess,
  initialType = 'expense',
  initialData = null,
  accounts: propAccounts = null,
  categories: propCategories = null,
  defaultAccountId = null,
  currencyCode = DEFAULT_CURRENCY_CODE,
  database = db,
}) {
  const [type, setType] = useState(() => initialData?.type || initialType);
  const [amount, setAmount] = useState(() => (initialData?.amount ? String(initialData.amount / 100) : ''));
  const [categoryId, setCategoryId] = useState(() => initialData?.category_id || '');
  const [accountId, setAccountId] = useState(() => initialData?.account_id || defaultAccountId || '');
  const [destinationAccountId, setDestinationAccountId] = useState(() => initialData?.destination_account_id || '');
  const [date, setDate] = useState(() => initialData?.date || getTodayIsoDate());
  const [notes, setNotes] = useState(() => initialData?.notes || '');
  const [tagsInput, setTagsInput] = useState(() =>
    Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : ''
  );
  const [showDetails, setShowDetails] = useState(() =>
    Boolean(initialData?.notes || initialData?.tags?.length)
  );

  const [accounts, setAccounts] = useState(propAccounts || []);
  const [categories, setCategories] = useState(propCategories || []);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errors, setErrors] = useState({});

  const amountInputRef = useRef(null);

  const [prevInitialData, setPrevInitialData] = useState(initialData);
  if (initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setType(initialData?.type || initialType);
    setAmount(initialData?.amount ? String(initialData.amount / 100) : '');
    setCategoryId(initialData?.category_id || '');
    setAccountId(initialData?.account_id || defaultAccountId || '');
    setDestinationAccountId(initialData?.destination_account_id || '');
    setDate(initialData?.date || getTodayIsoDate());
    setNotes(initialData?.notes || '');
    setTagsInput(Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : '');
    setShowDetails(Boolean(initialData?.notes || initialData?.tags?.length));
  }

  // Load accounts and categories from database if not passed via props
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadMetadata() {
      setIsLoadingMeta(true);
      try {
        const [accList, catList] = await Promise.all([
          propAccounts ? Promise.resolve(propAccounts) : getAccounts(database, { isArchived: false }),
          propCategories ? Promise.resolve(propCategories) : getCategories(database),
        ]);

        if (!isMounted) return;

        setAccounts(accList);
        setCategories(catList);

        // Determine default source account
        if (!accountId) {
          const lastUsedId = defaultAccountId || (typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_USED_ACCOUNT_KEY) : null);
          const matchedAcc = accList.find((a) => a.id === lastUsedId);
          if (matchedAcc) {
            setAccountId(matchedAcc.id);
          } else if (accList.length > 0) {
            // Default to cash or first active account
            const cashAcc = accList.find((a) => a.type === 'cash') || accList[0];
            setAccountId(cashAcc.id);
          }
        }

        // Determine default destination account for transfer
        if (accList.length > 1 && !destinationAccountId) {
          const other = accList.find((a) => a.id !== accountId);
          if (other) setDestinationAccountId(other.id);
        }
      } catch (err) {
        console.error('Failed to load accounts/categories for QuickAdd:', err);
      } finally {
        if (isMounted) setIsLoadingMeta(false);
      }
    }

    loadMetadata();

    return () => {
      isMounted = false;
    };
  }, [isOpen, propAccounts, propCategories, defaultAccountId, database, accountId, destinationAccountId]);

  // Auto-focus amount input on modal open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (amountInputRef.current) {
          amountInputRef.current.focus();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle global Escape key to close modal
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

  // Filter categories by active type (expense / income)
  const availableCategories = categories.filter((cat) => cat.type === type);

  // Switch type handler
  const handleTypeChange = (newType) => {
    setType(newType);
    setErrors((prev) => ({ ...prev, categoryId: undefined, transferAccounts: undefined }));
    // If current category doesn't match new type, reset category selection
    const stillValid = categories.some((c) => c.id === categoryId && c.type === newType);
    if (!stillValid && newType !== 'transfer') {
      setCategoryId('');
    }
  };

  // Submit transaction logic
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();

    const newErrors = {};

    // 1. Amount Validation
    const amountStr = String(amount).trim();
    const parsed = parseAmountInput(amountStr, currencyCode);
    if (!parsed.isValid) {
      newErrors.amount = parsed.error || 'يرجى إدخال مبلغ صحيح أكبر من الصفر';
    }

    // 2. Category Validation (for expense and income)
    if (type !== 'transfer' && !categoryId) {
      newErrors.categoryId = type === 'income' ? 'يرجى اختيار تصنيف للدخل' : 'يرجى اختيار تصنيف للمصروف';
    }

    // 3. Transfer Accounts Validation
    if (type === 'transfer') {
      if (!accountId) {
        newErrors.transferAccounts = 'يرجى تحديد حساب المصدر';
      } else if (!destinationAccountId) {
        newErrors.transferAccounts = 'يرجى تحديد حساب الوجهة';
      } else if (accountId === destinationAccountId) {
        newErrors.transferAccounts = 'يرجى اختيار حسابين مختلفين للتحويل';
      }
    } else if (!accountId && accounts.length > 0) {
      newErrors.accountId = 'يرجى تحديد الحساب';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const { minorUnits: parsedMinorUnits } = parseAmountInput(amountStr, currencyCode);
      const parsedTags = tagsInput
        ? tagsInput
            .split(/[,،#]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      let resultTransaction = null;

      if (type === 'transfer') {
        resultTransaction = await createTransfer(
          {
            amount: parsedMinorUnits,
            account_id: accountId,
            destination_account_id: destinationAccountId,
            date: date || getTodayIsoDate(),
            notes: notes.trim() || undefined,
            tags: parsedTags,
          },
          database
        );
      } else {
        resultTransaction = await createTransaction(
          {
            type,
            amount: parsedMinorUnits,
            category_id: categoryId,
            account_id: accountId,
            date: date || getTodayIsoDate(),
            notes: notes.trim() || undefined,
            tags: parsedTags,
          },
          database
        );
      }

      // Persist last used account
      if (typeof localStorage !== 'undefined' && accountId) {
        try {
          localStorage.setItem(LAST_USED_ACCOUNT_KEY, accountId);
        } catch {
          // Ignore storage quota errors
        }
      }

      const successLabel =
        type === 'income' ? 'تم تسجيل الدخل بنجاح' : type === 'transfer' ? 'تم تنفيذ التحويل بنجاح' : 'تم حفظ المصروف بنجاح';

      setSuccessMessage(successLabel);

      if (onSuccess) {
        onSuccess(resultTransaction);
      }

      // Close modal after brief celebratory moment
      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(null);
        setAmount('');
        setNotes('');
        setTagsInput('');
        setShowDetails(false);
        onClose();
      }, 550);
    } catch (err) {
      console.error('Failed to create transaction:', err);
      setErrors({
        general: err.message || 'حدث خطأ غير متوقع أثناء الحفظ، يرجى المحاولة ثانية',
      });
      setIsSubmitting(false);
    }
  }, [
    amount,
    currencyCode,
    type,
    categoryId,
    accountId,
    destinationAccountId,
    accounts.length,
    tagsInput,
    date,
    notes,
    database,
    onSuccess,
    onClose,
  ]);

  // Handle keyboard shortcut inside form (Enter triggers submit)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName?.toLowerCase() !== 'textarea') {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="quick-add-overlay"
      onClick={onClose}
      role="presentation"
      data-testid="quick-add-overlay"
    >
      <div
        className="quick-add-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid="quick-add-dialog"
      >
        {/* 1. Header with Title & Accessible Close Button */}
        <div className="quick-add-header">
          <div className="quick-add-header-info">
            <h2 id="quick-add-title" className="quick-add-title">
              {type === 'income' ? 'تسجيل دخل جديد' : type === 'transfer' ? 'تحويل بين الحسابات' : 'تسجيل مصروف سريع'}
            </h2>
            <span className="quick-add-subtitle">
              إدخال فوري مكتمل خلال أقل من 5 ثوانٍ
            </span>
          </div>
          <button
            type="button"
            className="quick-add-close-btn"
            onClick={onClose}
            aria-label="إغلاق نافذة التسجيل"
            data-testid="quick-add-close-btn"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* 2. Transaction Type Switcher (Segmented Control) */}
        <div
          className="quick-add-type-switcher"
          role="tablist"
          aria-label="نوع المعاملة"
          data-testid="quick-add-type-switcher"
        >
          <button
            type="button"
            role="tab"
            aria-selected={type === 'expense'}
            className={`quick-add-type-btn ${type === 'expense' ? 'is-active is-expense' : ''}`}
            onClick={() => handleTypeChange('expense')}
            data-testid="tab-type-expense"
          >
            مصروف
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === 'income'}
            className={`quick-add-type-btn ${type === 'income' ? 'is-active is-income' : ''}`}
            onClick={() => handleTypeChange('income')}
            data-testid="tab-type-income"
          >
            دخل
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === 'transfer'}
            className={`quick-add-type-btn ${type === 'transfer' ? 'is-active is-transfer' : ''}`}
            onClick={() => handleTypeChange('transfer')}
            data-testid="tab-type-transfer"
          >
            تحويل داخلي
          </button>
        </div>

        {/* 3. Hero Amount Input Section */}
        <div
          className={`quick-add-amount-card ${errors.amount ? 'has-error' : ''}`}
          data-testid="quick-add-amount-card"
        >
          <div className="quick-add-amount-row">
            <span className="quick-add-currency-badge">
              {currencyCode === 'SAR' ? 'ر.س' : currencyCode}
            </span>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              className="quick-add-amount-input"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amount) {
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }
              }}
              aria-label="المبلغ المالي"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'quick-add-amount-error' : undefined}
              data-testid="quick-add-amount-input"
            />
          </div>
          {errors.amount && (
            <span id="quick-add-amount-error" className="quick-add-error-text" role="alert">
              {errors.amount}
            </span>
          )}
        </div>

        {/* 4. Visual Category Chips Grid (Only for Expense & Income) */}
        {type !== 'transfer' && (
          <div
            className={`quick-add-category-container ${errors.categoryId ? 'has-error' : ''}`}
            data-testid="quick-add-category-section"
          >
            <div className="quick-add-section-label">
              <span>التصنيف المالي *</span>
              {errors.categoryId && (
                <span className="quick-add-error-text" role="alert">
                  {errors.categoryId}
                </span>
              )}
            </div>

            <div
              className="quick-add-category-grid"
              role="radiogroup"
              aria-label="اختر تصنيف المعاملة"
            >
              {availableCategories.map((cat) => {
                const isSelected = categoryId === cat.id;
                const catColor = cat.color || (type === 'income' ? '#059669' : '#E11D48');
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`quick-add-category-chip ${isSelected ? 'is-selected' : ''}`}
                    style={{ '--active-cat-color': catColor }}
                    onClick={() => {
                      setCategoryId(cat.id);
                      if (errors.categoryId) {
                        setErrors((prev) => ({ ...prev, categoryId: undefined }));
                      }
                    }}
                    data-testid={`category-chip-${cat.slug || cat.id}`}
                  >
                    <div
                      className="quick-add-cat-icon-wrap"
                      style={{
                        backgroundColor: isSelected ? catColor : `${catColor}18`,
                        color: isSelected ? '#FFFFFF' : catColor,
                      }}
                    >
                      <CategoryIcon name={cat.icon} size={18} />
                    </div>
                    <span className="quick-add-cat-label">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Account & Date Row */}
        {type === 'transfer' ? (
          <div className="quick-add-meta-row" data-testid="transfer-accounts-row">
            <div className="quick-add-field-group">
              <label htmlFor="source-account-select" className="quick-add-field-label">
                <WalletIcon size={14} /> من حساب (المصدر)
              </label>
              <select
                id="source-account-select"
                className={`quick-add-select ${errors.transferAccounts ? 'has-error' : ''}`}
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setErrors((prev) => ({ ...prev, transferAccounts: undefined }));
                }}
                data-testid="transfer-source-select"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="quick-add-field-group">
              <label htmlFor="destination-account-select" className="quick-add-field-label">
                <TransferIcon size={14} /> إلى حساب (الوجهة)
              </label>
              <select
                id="destination-account-select"
                className={`quick-add-select ${errors.transferAccounts ? 'has-error' : ''}`}
                value={destinationAccountId}
                onChange={(e) => {
                  setDestinationAccountId(e.target.value);
                  setErrors((prev) => ({ ...prev, transferAccounts: undefined }));
                }}
                data-testid="transfer-destination-select"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="quick-add-meta-row" data-testid="standard-account-date-row">
            <div className="quick-add-field-group">
              <label htmlFor="account-select" className="quick-add-field-label">
                <WalletIcon size={14} /> {type === 'income' ? 'إيداع في حساب' : 'خصم من حساب'}
              </label>
              <select
                id="account-select"
                className="quick-add-select"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setErrors((prev) => ({ ...prev, accountId: undefined }));
                }}
                data-testid="account-select"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="quick-add-field-group">
              <label htmlFor="transaction-date" className="quick-add-field-label">
                <CalendarIcon size={14} /> التاريخ
              </label>
              <input
                id="transaction-date"
                type="date"
                className="quick-add-input-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="transaction-date-input"
              />
            </div>
          </div>
        )}

        {errors.transferAccounts && (
          <span className="quick-add-error-text" role="alert" data-testid="transfer-accounts-error">
            {errors.transferAccounts}
          </span>
        )}

        {/* 6. Collapsible Details Toggle ("إضافة تفاصيل") */}
        <button
          type="button"
          className="quick-add-details-toggle"
          onClick={() => setShowDetails((prev) => !prev)}
          aria-expanded={showDetails}
          data-testid="toggle-details-btn"
        >
          <PlusIcon size={16} />
          {showDetails ? 'إخفاء التفاصيل الإضافية' : 'إضافة تفاصيل (ملاحظات، وسوم)'}
        </button>

        {showDetails && (
          <div className="quick-add-details-panel" data-testid="details-panel">
            <div className="quick-add-field-group">
              <label htmlFor="transaction-notes" className="quick-add-field-label">
                <NoteIcon size={14} /> ملاحظات / وصف
              </label>
              <textarea
                id="transaction-notes"
                className="quick-add-textarea"
                placeholder="أضف وصفاً مختصراً للمعاملة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                data-testid="notes-textarea"
              />
            </div>

            <div className="quick-add-field-group">
              <label htmlFor="transaction-tags" className="quick-add-field-label">
                <TagIcon size={14} /> الوسوم (Tags)
              </label>
              <input
                id="transaction-tags"
                type="text"
                className="quick-add-input-text"
                placeholder="مثال: قهوة، عمل، سفر"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                data-testid="tags-input"
              />
            </div>
          </div>
        )}

        {/* General Error Banner */}
        {errors.general && (
          <div className="quick-add-error-text" role="alert" data-testid="general-error-banner">
            {errors.general}
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div className="quick-add-success-banner" role="status" data-testid="success-banner">
            <CheckIcon size={20} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 7. Modal Actions / Submit Button */}
        <div className="quick-add-footer">
          <button
            type="button"
            className={`quick-add-submit-btn is-${type}`}
            disabled={isSubmitting || isLoadingMeta}
            onClick={handleSubmit}
            data-testid="submit-transaction-btn"
          >
            {isSubmitting ? (
              <span>جاري الحفظ...</span>
            ) : type === 'income' ? (
              <span>حفظ الدخل (Enter)</span>
            ) : type === 'transfer' ? (
              <span>تأكيد التحويل (Enter)</span>
            ) : (
              <span>حفظ المصروف (Enter)</span>
            )}
          </button>
          <button
            type="button"
            className="quick-add-cancel-btn"
            onClick={onClose}
            disabled={isSubmitting}
            data-testid="cancel-transaction-btn"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuickAdd;
