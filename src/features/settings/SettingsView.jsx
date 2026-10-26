import { useState, useEffect } from 'react';
import { CurrencyLockCard } from './CurrencyLockCard.jsx';
import { BackupRestoreModal } from './BackupRestoreModal.jsx';
import { SupabaseAuthModal } from './SupabaseAuthModal.jsx';
import { SignOutSafetyModal } from './SignOutSafetyModal.jsx';
import {
  CategoriesIcon,
  SunIcon,
  MoonIcon,
  CloudCheckIcon,
  CloudSyncIcon,
  SettingsIcon,
  DownloadIcon,
  UploadIcon,
  UserIcon,
  LogOutIcon,
  ShieldCheckIcon,
  LockIcon,
  CheckIcon
} from '../../components/common/Icons.jsx';
import { exportTransactions } from '../../utils/csvExport.js';
import { downloadBackup } from '../../services/backupRestore.js';
import {
  getCurrentUser,
  signOutUser,
  syncWithCloud,
  subscribeToAuthChanges,
  getLastSyncTimestamp,
  formatLastSyncTimeArabic,
  SignOutBlockedError
} from '../../services/cloudSync.js';
import {
  isStoragePersisted,
  requestStoragePersistence,
  getStorageEstimate
} from '../../services/storagePersistence.js';
import { db } from '../../db/db.js';
import { inspectSignOutSafety } from '../../services/signOutSafety.js';
import './SettingsView.css';

/**
 * Settings & Data Safety View (F014 + F015 + F016 + F018 + Shell Hub)
 * Ref: design-system/screens.md (Section 9: Settings & Data Safety)
 */
export function SettingsView({
  theme = 'light',
  onToggleTheme,
  onSelectTab,
  database = db,
  refreshTrigger = 0,
  onCurrencyChanged,
  onDataRestored
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState(null);

  // Storage Durability State (F020)
  const [isPersisted, setIsPersisted] = useState(false);
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);
  const [persistenceToast, setPersistenceToast] = useState(null);
  const [storageEstimate, setStorageEstimate] = useState(null);

  // Cloud Sync & Auth State (F018)
  const [currentUser, setCurrentUser] = useState(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncToast, setCloudSyncToast] = useState(null);
  const [lastSyncText, setLastSyncText] = useState('غير متزامن بعد');
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isCheckingSignOut, setIsCheckingSignOut] = useState(false);
  const [isProcessingSignOut, setIsProcessingSignOut] = useState(false);
  const [signOutPendingCount, setSignOutPendingCount] = useState(0);
  const [signOutError, setSignOutError] = useState(null);
  const [signOutInfo, setSignOutInfo] = useState(null);

  // Load active user and last sync timestamp
  useEffect(() => {
    let isCancelled = false;
    const updateCloudState = () => {
      Promise.all([
        getCurrentUser(),
        getLastSyncTimestamp(database)
      ]).then(([user, timestamp]) => {
        if (isCancelled) return;
        setCurrentUser(user);
        setLastSyncText(formatLastSyncTimeArabic(timestamp));
      }).catch((e) => {
        console.warn('[SettingsView] Error loading cloud state:', e);
      });
    };

    updateCloudState();
    const unsub = subscribeToAuthChanges(updateCloudState);
    return () => {
      isCancelled = true;
      unsub();
    };
  }, [database, refreshTrigger]);

  // Load storage durability & quota status (F020)
  useEffect(() => {
    let isCancelled = false;
    const checkStorage = async () => {
      try {
        const [persisted, estimate] = await Promise.all([
          isStoragePersisted(),
          getStorageEstimate()
        ]);
        if (!isCancelled) {
          setIsPersisted(persisted);
          setStorageEstimate(estimate);
        }
      } catch (e) {
        console.warn('[SettingsView] Error checking storage persistence:', e);
      }
    };
    checkStorage();
    return () => {
      isCancelled = true;
    };
  }, [refreshTrigger]);

  const handleRequestPersistence = async () => {
    try {
      setIsRequestingPersistence(true);
      setPersistenceToast(null);
      const granted = await requestStoragePersistence();
      setIsPersisted(granted);
      const estimate = await getStorageEstimate();
      setStorageEstimate(estimate);
      if (granted) {
        setPersistenceToast('تم تفعيل التخزين الدائم بنجاح؛ بياناتك محمية الآن من الحذف التلقائي.');
      } else {
        setPersistenceToast('المتصفح لم يمنح إذن التخزين الدائم حالياً؛ يمكنك الاعتماد على النسخ الاحتياطية كإجراء بديل.');
      }
      setTimeout(() => setPersistenceToast(null), 4000);
    } catch (err) {
      console.warn('[SettingsView] Persistence request error:', err);
      setPersistenceToast('حدث خطأ أثناء طلب التخزين الدائم.');
      setTimeout(() => setPersistenceToast(null), 4000);
    } finally {
      setIsRequestingPersistence(false);
    }
  };

  const handleManualCloudSync = async () => {
    try {
      setIsSyncingCloud(true);
      setCloudSyncToast(null);
      const outcome = await syncWithCloud({ database });
      if (outcome.success) {
        setLastSyncText(formatLastSyncTimeArabic(outcome.lastSyncTimestamp));
        const pushed = outcome.push?.pushedCount || 0;
        const pulled = (outcome.pull?.accountsCount || 0) + (outcome.pull?.transactionsCount || 0);
        setCloudSyncToast(`تمت المزامنة بنجاح (تم رفع ${pushed} واستقبال ${pulled} تحديث).`);
      } else {
        setCloudSyncToast(outcome.message || 'الخدمة السحابية غير متصلة.');
      }
      setTimeout(() => setCloudSyncToast(null), 4000);
    } catch (err) {
      console.error('[SettingsView] Manual sync error:', err);
      setCloudSyncToast('حدث خطأ أثناء المزامنة السحابية.');
      setTimeout(() => setCloudSyncToast(null), 4000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsCheckingSignOut(true);
      const { pendingCount } = await inspectSignOutSafety(database);
      setSignOutPendingCount(pendingCount);
      setSignOutError(null);
      setSignOutInfo(null);
      setIsSignOutModalOpen(true);
    } catch (err) {
      setCloudSyncToast('تعذر فحص التغييرات المحلية: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsCheckingSignOut(false);
    }
  };

  const handleSignOutSync = async () => {
    try {
      setIsProcessingSignOut(true);
      setSignOutError(null);
      setSignOutInfo(null);
      const outcome = await syncWithCloud({ database });
      const { pendingCount } = await inspectSignOutSafety(database);
      setSignOutPendingCount(pendingCount);
      if (!outcome.success || pendingCount > 0) {
        setSignOutError(outcome.message || 'لا تزال هناك تعديلات غير متزامنة. تحقق من اتصالك ثم حاول مجدداً.');
        return;
      }
      setLastSyncText(formatLastSyncTimeArabic(outcome.lastSyncTimestamp));
      setSignOutInfo('اكتملت المزامنة. يمكنك الآن تأكيد تسجيل الخروج.');
    } catch (err) {
      setSignOutError('تعذرت المزامنة: ' + (err.message || 'حاول مجدداً عند عودة الاتصال.'));
    } finally {
      setIsProcessingSignOut(false);
    }
  };

  const handleSignOutBackup = async () => {
    try {
      setIsProcessingSignOut(true);
      setSignOutError(null);
      const result = await downloadBackup(database);
      setSignOutInfo(`تم تنزيل النسخة الاحتياطية (${result.filename}). تبقى التعديلات المحلية محفوظة.`);
    } catch (err) {
      setSignOutError('تعذر تنزيل النسخة الاحتياطية: ' + (err.message || 'حاول مجدداً.'));
    } finally {
      setIsProcessingSignOut(false);
    }
  };

  const handleConfirmSignOut = async () => {
    try {
      setIsProcessingSignOut(true);
      setSignOutError(null);
      await signOutUser({ database });
      setIsSignOutModalOpen(false);
      setCurrentUser(null);
      setCloudSyncToast('تم تسجيل الخروج وحذف بيانات الحساب السحابي من هذا الجهاز.');
      if (typeof onDataRestored === 'function') onDataRestored();
    } catch (err) {
      if (err instanceof SignOutBlockedError) {
        setSignOutPendingCount(err.pendingCount);
        setSignOutError('ظهرت تعديلات جديدة لم تُزامن. أكمل مزامنتها قبل الخروج.');
      } else {
        setSignOutError('تعذر تسجيل الخروج: ' + (err.message || 'حاول مجدداً.'));
      }
    } finally {
      setIsProcessingSignOut(false);
    }
  };

  const handleAuthSuccess = (result) => {
    if (result?.user) {
      setCurrentUser(result.user);
    }
    getLastSyncTimestamp(database).then((ts) => {
      setLastSyncText(formatLastSyncTimeArabic(ts));
    });
    setCloudSyncToast('تم تسجيل الدخول ودمج بياناتك بنجاح.');
    setTimeout(() => setCloudSyncToast(null), 4000);
    if (typeof onDataRestored === 'function') {
      onDataRestored(result);
    }
  };

  const handleExportAllCsv = async () => {
    try {
      setIsExporting(true);
      const res = await exportTransactions({ database });
      setExportToast(`تم تصدير ${res.count} معاملة كملف CSV بنجاح.`);
      setTimeout(() => setExportToast(null), 3500);
    } catch (err) {
      console.error('Failed to export transactions from settings:', err);
      setExportToast('تعذر تصدير المعاملات.');
      setTimeout(() => setExportToast(null), 3500);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      setIsDownloadingBackup(true);
      const res = await downloadBackup(database);
      setExportToast(`تم تنزيل النسخة الاحتياطية بنجاح (${res.filename}).`);
      setTimeout(() => setExportToast(null), 3500);
    } catch (err) {
      console.error('Failed to download backup:', err);
      setExportToast('تعذر تنزيل النسخة الاحتياطية.');
      setTimeout(() => setExportToast(null), 3500);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleRestoreSuccess = (result) => {
    setExportToast('تمت استعادة النسخة الاحتياطية وتحديث البيانات بنجاح.');
    setTimeout(() => setExportToast(null), 4000);

    if (result?.metadata?.base_currency && onCurrencyChanged) {
      onCurrencyChanged(result.metadata.base_currency);
    }
    if (onDataRestored) {
      onDataRestored(result);
    }
  };
  return (
    <div className="hub-view settings-view">
      {/* 1. Header Hero Card */}
      <div className="surface-card settings-header-card">
        <div className="settings-header-icon-group">
          <div className="settings-header-icon-wrapper" aria-hidden="true">
            <SettingsIcon size={24} className="settings-header-icon" />
          </div>
          <div>
            <h2 className="text-h1">الإعدادات وسلامة البيانات</h2>
            <p className="text-caption">
              التحكم في العملة الأساسية، المظهر، التصنيفات، واستدامة السجلات المالية
            </p>
          </div>
        </div>
      </div>

      {/* 2. Base Currency & Immutability Lock Card (F014) */}
      <CurrencyLockCard
        database={database}
        refreshTrigger={refreshTrigger}
        onCurrencyChanged={onCurrencyChanged}
      />

      {/* 3. General Preferences Card */}
      <div className="surface-card settings-preferences-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">تفضيلات الواجهة والمظهر</h3>
            <span className="text-caption">تخصيص تجربة التصفح والوضع البصري</span>
          </div>
        </div>

        <div className="settings-options-list">
          {/* Theme switcher */}
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">مظهر التطبيق</span>
              <span className="text-caption">
                التبديل الفوري بين الوضع الفاتح والوضع الداكن المريح للعين
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary theme-toggle-btn"
              onClick={onToggleTheme}
              aria-label="تبديل مظهر التطبيق"
            >
              {theme === 'dark' ? (
                <>
                  <MoonIcon size={16} />
                  <span>الوضع الداكن (نشط)</span>
                </>
              ) : (
                <>
                  <SunIcon size={16} />
                  <span>الوضع الفاتح (نشط)</span>
                </>
              )}
            </button>
          </div>

          {/* Categories Management Shortcut */}
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">إدارة التصنيفات المالية</span>
              <span className="text-caption">
                تخصيص تصنيفات المصاريف والدخل وإدارتها مع حماية المعاملات المرتبطة
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary categories-shortcut-btn"
              onClick={() => onSelectTab && onSelectTab('categories')}
            >
              <CategoriesIcon size={16} />
              <span>إدارة التصنيفات</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Data Portability & CSV Export Card (F015) */}
      <div className="surface-card settings-export-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">تصدير البيانات والنسخ الاحتياطي</h3>
            <span className="text-caption">تصدير السجل المالي التاريخي بصيغ مفتوحة قابلة للاستخدام في أي تطبيق</span>
          </div>
        </div>

        <div className="settings-options-list">
          {/* CSV Export Option (F015) */}
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">تصدير كافة المعاملات كملف CSV</span>
              <span className="text-caption">
                تصدير كافة المعاملات بترميز UTF-8 مع BOM لضمان التوافق التام مع Excel و Numbers و Google Sheets
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary csv-export-btn"
              onClick={handleExportAllCsv}
              disabled={isExporting}
              aria-label="تصدير كافة المعاملات كملف CSV"
            >
              <DownloadIcon size={16} />
              <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير كملف CSV'}</span>
            </button>
          </div>

          {/* JSON Backup & Restore Options (F016) */}
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">نسخة احتياطية كاملة واستعادة (JSON)</span>
              <span className="text-caption">
                تنزيل نسخة احتياطية شاملة لكافة الحسابات والتصنيفات والمعاملات والإعدادات، أو استعادة نسخة سابقة بشكل ذري وآمن
              </span>
            </div>
            <div className="backup-actions-group">
              <button
                type="button"
                className="btn-secondary json-backup-download-btn"
                onClick={handleDownloadBackup}
                disabled={isDownloadingBackup}
                aria-label="تنزيل نسخة احتياطية كاملة بصيغة JSON"
              >
                <DownloadIcon size={16} />
                <span>{isDownloadingBackup ? 'جارٍ التنزيل...' : 'تنزيل نسخة JSON'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary json-backup-restore-btn"
                onClick={() => setIsRestoreModalOpen(true)}
                aria-label="استعادة نسخة احتياطية سابقة بصيغة JSON"
              >
                <UploadIcon size={16} />
                <span>استعادة نسخة JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feedback toast */}
        {exportToast && (
          <div className="currency-success-toast text-caption" role="status">
            ✓ {exportToast}
          </div>
        )}
      </div>

      {/* Backup & Restore Modal (F016) */}
      <BackupRestoreModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        database={database}
        onRestoreSuccess={handleRestoreSuccess}
      />

      {/* 5. Cloud Sync & Supabase Auth Card (F018) */}
      <div className="surface-card settings-cloud-sync-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">المزامنة السحابية والمصادقة (Supabase)</h3>
            <span className="text-caption">مزامنة فورية وتأمين حسابك عبر الأجهزة</span>
          </div>
          <span
            className={`cloud-status-badge ${currentUser ? 'connected' : 'guest'}`}
            role="status"
          >
            {currentUser ? (
              <>
                <CloudCheckIcon size={14} />
                متصل بالسحابة
              </>
            ) : (
              <>
                <CloudSyncIcon size={14} />
                وضع الضيف (محلي)
              </>
            )}
          </span>
        </div>

        {currentUser ? (
          <div className="cloud-user-details-box">
            <div className="cloud-user-email-wrap">
              <div className="cloud-user-avatar">
                <UserIcon size={18} />
              </div>
              <div>
                <strong className="text-body font-semibold">{currentUser.email}</strong>
                <p className="text-caption text-secondary">
                  آخر مزامنة ناجحة: {lastSyncText}
                </p>
              </div>
            </div>

            <div className="cloud-sync-actions-row">
              <button
                type="button"
                className="btn-primary"
                onClick={handleManualCloudSync}
                disabled={isSyncingCloud}
                aria-label="مزامنة التغييرات الآن مع الخادم السحابي"
              >
                <CloudSyncIcon
                  size={16}
                  className={isSyncingCloud ? 'sync-icon-spinning' : ''}
                />
                <span>{isSyncingCloud ? 'جارٍ المزامنة...' : 'مزامنة الآن'}</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleSignOut}
                disabled={isSyncingCloud || isCheckingSignOut}
                aria-label="تسجيل الخروج من الحساب السحابي"
              >
                <LogOutIcon size={16} />
                <span>{isCheckingSignOut ? 'جارٍ فحص البيانات...' : 'تسجيل الخروج'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="cloud-user-details-box">
            <div>
              <strong className="text-body font-semibold">حساب محلي غير متزامن</strong>
              <p className="text-caption text-secondary">
                يمكنك ربط حسابك السحابي لحفظ ومزامنة كافة بياناتك الحالية تلقائياً وبأمان عبر كافة أجهزتك.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsAuthModalOpen(true)}
              aria-label="تسجيل الدخول أو إنشاء حساب سحابي"
            >
              <CloudSyncIcon size={16} />
              <span>تسجيل الدخول / ربط الحساب</span>
            </button>
          </div>
        )}

        {/* Cloud feedback toast */}
        {cloudSyncToast && (
          <div className="currency-success-toast text-caption" role="status">
            {cloudSyncToast}
          </div>
        )}
      </div>

      {/* Supabase Auth Modal (F018) */}
      <SupabaseAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        database={database}
        onAuthSuccess={handleAuthSuccess}
      />

      <SignOutSafetyModal
        isOpen={isSignOutModalOpen}
        pendingCount={signOutPendingCount}
        isProcessing={isProcessingSignOut}
        errorMessage={signOutError}
        infoMessage={signOutInfo}
        onSync={handleSignOutSync}
        onBackup={handleSignOutBackup}
        onConfirm={handleConfirmSignOut}
        onClose={() => setIsSignOutModalOpen(false)}
      />

      {/* 6. Local-First Engine & Storage Safety Card (F020) */}
      <div className="surface-card settings-storage-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">التخزين المحلي وسلامة البيانات</h3>
            <span className="text-caption">هندسة التخزين المحلي أولاً — تخزين محلي آمن واستدامة السجلات</span>
          </div>
          <span
            className={`status-badge-persisted ${isPersisted ? 'active' : 'best-effort'}`}
            role="status"
          >
            {isPersisted ? (
              <>
                <ShieldCheckIcon size={14} className="badge-sync-icon" />
                تخزين دائم ومحمي
              </>
            ) : (
              <>
                <LockIcon size={14} className="badge-sync-icon" />
                تخزين افتراضي (قابل للإخلاء)
              </>
            )}
          </span>
        </div>

        {/* Durability Row */}
        <div className="storage-durability-row">
          <div className="storage-durability-info">
            <div className="storage-durability-title-wrap">
              <span className="text-body font-semibold">استدامة التخزين (Storage Durability)</span>
              <span className={`storage-pill ${isPersisted ? 'persisted' : 'best-effort'}`}>
                {isPersisted ? 'مستدام ومحمي' : 'تخزين افتراضي'}
              </span>
            </div>
            <span className="text-caption text-secondary">
              {isPersisted
                ? 'تم منح إذن التخزين الدائم (Persistent Storage). لن يقوم المتصفح بحذف بياناتك أو سجلاتك المالية تلقائياً عند انخفاض مساحة القرص.'
                : 'المتصفح في وضع التخزين الافتراضي (Best-Effort). قد يتم تفريغ البيانات تلقائياً في ظروف امتلاء القرص الشديد. اضغط لتفعيل الحماية.'}
            </span>
          </div>
          {!isPersisted ? (
            <button
              type="button"
              className="btn-secondary request-persistence-btn"
              onClick={handleRequestPersistence}
              disabled={isRequestingPersistence}
              aria-label="طلب حماية التخزين الدائم"
            >
              <ShieldCheckIcon size={16} />
              <span>{isRequestingPersistence ? 'جارٍ الطلب...' : 'طلب حماية التخزين'}</span>
            </button>
          ) : (
            <div className="persistence-active-tag text-caption" aria-label="التخزين الدائم مفعل">
              <CheckIcon size={14} />
              <span>الحماية نشطة</span>
            </div>
          )}
        </div>

        {/* Quota estimate display */}
        {storageEstimate && (
          <div className="storage-quota-box">
            <div className="storage-quota-header">
              <span className="text-caption font-semibold">المساحة التخزينية المستخدمة</span>
              <span className="text-caption text-secondary">
                {storageEstimate.formattedUsage} من أصل {storageEstimate.formattedQuota} ({storageEstimate.percentage}%)
              </span>
            </div>
            <div
              className="storage-quota-progress-track"
              role="progressbar"
              aria-valuenow={storageEstimate.percentage}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="نسبة استهلاك مساحة التخزين"
            >
              <div
                className="storage-quota-progress-bar"
                style={{ width: `${Math.max(2, storageEstimate.percentage)}%` }}
              />
            </div>
          </div>
        )}

        {/* Guest Mode Safety Disclosure (project-summary.md Section 21) */}
        <div className="guest-disclosure-box">
          <div className="guest-disclosure-header">
            <ShieldCheckIcon size={18} className="guest-disclosure-icon" />
            <strong className="text-body font-semibold">تنبيه سلامة البيانات والتخزين المحلي</strong>
          </div>
          <p className="text-caption">
            بياناتك المالية مخزنة حالياً في هذا المتصفح. لحمايتها من الحذف العرضي في حال مسح بيانات المتصفح، احرص على تنزيل نسخة احتياطية بصيغة JSON بانتظام أو فعّل المزامنة السحابية المجانية.
          </p>
        </div>

        {/* Storage Persistence Feedback Toast */}
        {persistenceToast && (
          <div className="currency-success-toast text-caption" role="status">
            ✓ {persistenceToast}
          </div>
        )}

        <div className="storage-features-grid">
          <div className="storage-feature-item">
            <strong className="text-body font-semibold">قاعدة بيانات محلية سريعة</strong>
            <p className="text-caption">
              بياناتك مخزنة مباشرة على جهازك عبر IndexedDB و Dexie.js بسرعة استجابة فائقة وبدون أي تأخير شبكي.
            </p>
          </div>
          <div className="storage-feature-item">
            <strong className="text-body font-semibold">خصوصية تامة واستخدام دون اتصال</strong>
            <p className="text-caption">
              يعمل التطبيق بكامل وظائفه الحسابية دون الحاجة إلى إنترنت، مع عزل تام للبيانات في وضع الضيف.
            </p>
          </div>
          <div className="storage-feature-item">
            <strong className="text-body font-semibold">دقة الحسابات المالية (ISO 4217)</strong>
            <p className="text-caption">
              كافة المبالغ المالية تسجل بوحدات أصغرية صحيحة (Minor Units) لمنع أخطاء التقريب الحسابية.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
