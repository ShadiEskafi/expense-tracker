import { useState, useEffect, useCallback } from 'react';
import {
  LockIcon,
  UnlockIcon,
  InfoIcon,
  CoinsIcon,
} from '../../components/common/Icons.jsx';
import { getCurrency } from '../../utils/currency.js';
import {
  getBaseCurrency,
  checkCurrencyLockStatus,
  setBaseCurrency
} from '../../services/currencyLock.js';
import { CurrencySelectorModal } from './CurrencySelectorModal.jsx';
import { db } from '../../db/db.js';

export function CurrencyLockCard({
  database = db,
  refreshTrigger = 0,
  onCurrencyChanged
}) {
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [lockStatus, setLockStatus] = useState({
    isLocked: false,
    reason: null,
    transactionCount: 0,
    nonZeroAccountCount: 0,
    explanationAr: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successToast, setSuccessToast] = useState(null);

  const loadCurrencyData = useCallback(() => {
    let isCancelled = false;

    Promise.all([
      getBaseCurrency(database),
      checkCurrencyLockStatus(database)
    ])
      .then(([code, status]) => {
        if (!isCancelled) {
          setCurrencyCode(code);
          setLockStatus(status);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load currency lock data:', err);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [database]);

  useEffect(() => {
    return loadCurrencyData();
  }, [loadCurrencyData, refreshTrigger]);

  const currencyMeta = getCurrency(currencyCode);

  const handleSelectCurrency = async (newCode) => {
    await setBaseCurrency(newCode, database);
    setSuccessToast(`تم اعتماد ${getCurrency(newCode).nameAr} (${newCode}) كعملة أساسية بنجاح.`);
    loadCurrencyData();
    if (onCurrencyChanged) {
      onCurrencyChanged(newCode);
    }
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  return (
    <div className="surface-card currency-lock-card">
      <div className="surface-card-header">
        <div className="currency-card-title-group">
          <div className="currency-card-icon-wrapper" aria-hidden="true">
            <CoinsIcon size={22} className="currency-card-icon" />
          </div>
          <div>
            <h3 className="text-h2">العملة الأساسية وسياسة الثبات</h3>
            <span className="text-caption">
              العملة المحاسبية المعتمدة لكافة الحسابات، التقارير، والمعاملات المالية
            </span>
          </div>
        </div>

        {/* Lock Status Pill */}
        <div className="currency-status-pill-container">
          {lockStatus.isLocked ? (
            <span
              className="status-badge-locked text-caption"
              role="status"
              aria-label="العملة مقفلة"
            >
              <LockIcon size={14} className="badge-lock-icon" />
              مقفلة لحماية السجلات
            </span>
          ) : (
            <span
              className="status-badge-active text-caption"
              role="status"
              aria-label="العملة قابلة للتعديل"
            >
              <UnlockIcon size={14} className="badge-unlock-icon" />
              قابلة للتعديل بحرية
            </span>
          )}
        </div>
      </div>

      {/* Success feedback toast */}
      {successToast && (
        <div className="currency-success-toast text-caption" role="status">
          ✓ {successToast}
        </div>
      )}

      {/* Main Currency Display Box */}
      <div className="currency-display-box">
        <div className="currency-identity-col">
          <span className="currency-flag-large" aria-hidden="true">
            {currencyMeta.flag}
          </span>
          <div className="currency-identity-text">
            <div className="currency-name-row">
              <h4 className="text-h3 font-bold">{currencyMeta.nameAr}</h4>
              <span className="currency-iso-badge tabular-nums text-caption">
                {currencyMeta.code}
              </span>
            </div>
            <span className="currency-specs-text text-caption">
              الرمز: <strong>{currencyMeta.symbolAr}</strong> ({currencyMeta.symbolEn}) •{' '}
              {currencyMeta.exponent === 3 ? '3 خانات عشرية (فلس/مليم)' : 'خانتان عشريتان (هللة/سنت)'}
            </span>
          </div>
        </div>

        <div className="currency-action-col">
          <button
            type="button"
            className={lockStatus.isLocked ? 'btn-secondary btn-locked' : 'btn-primary'}
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading}
            aria-disabled={lockStatus.isLocked}
          >
            {lockStatus.isLocked ? (
              <>
                <LockIcon size={16} />
                <span>عرض تفاصيل القفل</span>
              </>
            ) : (
              'تغيير العملة الأساسية'
            )}
          </button>
        </div>
      </div>

      {/* Educational Explanation Callout */}
      <div
        className={`currency-explanation-callout ${lockStatus.isLocked ? 'locked-callout' : 'unlocked-callout'}`}
        role="region"
        aria-label="توضيح سياسة ثبات العملة"
      >
        <div className="callout-icon-wrapper" aria-hidden="true">
          {lockStatus.isLocked ? (
            <LockIcon size={18} className="callout-icon text-neutral-500" />
          ) : (
            <InfoIcon size={18} className="callout-icon text-brand-primary" />
          )}
        </div>
        <div className="callout-text-content">
          <strong className="text-body font-semibold">
            {lockStatus.isLocked
              ? 'لماذا تم قفل اختيار العملة الأساسية؟'
              : 'نصيحة هامة قبل بدء الاستخدام:'}
          </strong>
          <p className="text-caption">
            {lockStatus.explanationAr}
          </p>
          {lockStatus.isLocked && (
            <div className="lock-stats-row text-micro">
              <span className="stat-item tabular-nums">
                المعاملات المسجلة: <strong>{lockStatus.transactionCount}</strong>
              </span>
              <span className="stat-divider">•</span>
              <span className="stat-item tabular-nums">
                حسابات بأرصدة قائمة: <strong>{lockStatus.nonZeroAccountCount}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <CurrencySelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentCurrency={currencyCode}
        onSelectCurrency={handleSelectCurrency}
        isLocked={lockStatus.isLocked}
        lockExplanation={lockStatus.explanationAr}
      />
    </div>
  );
}
