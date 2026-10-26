import { useState } from 'react';
import { CurrencyLockCard } from './CurrencyLockCard.jsx';
import { BackupRestoreModal } from './BackupRestoreModal.jsx';
import {
  CategoriesIcon,
  SunIcon,
  MoonIcon,
  CloudCheckIcon,
  SettingsIcon,
  DownloadIcon,
  UploadIcon
} from '../../components/common/Icons.jsx';
import { exportTransactions } from '../../utils/csvExport.js';
import { downloadBackup } from '../../services/backupRestore.js';
import { db } from '../../db/db.js';
import './SettingsView.css';

/**
 * Settings & Data Safety View (F014 + F015 + F016 + Shell Hub)
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
  const [exportToast, setExportToast] = useState(null);

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

      {/* 5. Local-First Engine & Storage Safety Card */}
      <div className="surface-card settings-storage-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">التخزين المحلي وسلامة البيانات</h3>
            <span className="text-caption">هندسة التخزين المحلي أولاً (Local-First Architecture)</span>
          </div>
          <span className="status-badge-active text-caption" role="status">
            <CloudCheckIcon size={14} className="badge-sync-icon" />
            تخزين محلي آمن
          </span>
        </div>

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
