import { useState, useRef, useEffect } from 'react';
import {
  CloseIcon,
  UploadIcon,
  FileJsonIcon,
  CheckIcon,
  CloudAlertIcon,
  RotateCcwIcon
} from '../../components/common/Icons.jsx';
import {
  parseBackupFile,
  restoreFromBackup
} from '../../services/backupRestore.js';
import { db } from '../../db/db.js';

/**
 * BackupRestoreModal (F016)
 *
 * Implements the 6-step atomic restore workflow conforming to:
 * - ADR-008: Atomic JSON Backup & Restore Pipeline
 * - design-system/states-feedback.md (Section 2-B: Atomic Restore Flow)
 * - design-system/user-flows.md (Section 12: Atomic Restore Flow)
 */
export function BackupRestoreModal({
  isOpen,
  onClose,
  database = db,
  onRestoreSuccess
}) {
  if (!isOpen) return null;

  return (
    <BackupRestoreModalDialog
      onClose={onClose}
      database={database}
      onRestoreSuccess={onRestoreSuccess}
    />
  );
}

function BackupRestoreModalDialog({
  onClose,
  database = db,
  onRestoreSuccess
}) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [previewMetadata, setPreviewMetadata] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef(null);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isRestoring) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRestoring, onClose]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const { metadata, data } = await parseBackupFile(selectedFile);
      setParsedData(data);
      setPreviewMetadata(metadata);
    } catch (err) {
      console.error('Backup validation failed:', err);
      setErrorMessage(err.message || 'ملف النسخة الاحتياطية غير صالح.');
      setParsedData(null);
      setPreviewMetadata(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTriggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleConfirmRestore = async () => {
    if (!parsedData) return;

    setIsRestoring(true);
    setErrorMessage(null);

    try {
      // Re-package with schema_version for restoreFromBackup
      const backupPayload = {
        schema_version: 1,
        metadata: previewMetadata,
        data: parsedData
      };

      const result = await restoreFromBackup(backupPayload, database);
      setIsSuccess(true);

      setTimeout(() => {
        if (onRestoreSuccess) {
          onRestoreSuccess(result);
        }
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Restore operation failed:', err);
      setErrorMessage(err.message || 'فشلت عملية الاستعادة.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formatArabicDate = (isoString) => {
    if (!isoString) return 'غير محدد';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('ar-SA', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="backup-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRestoring) {
          onClose();
        }
      }}
    >
      <div
        className="backup-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-restore-modal-title"
      >
        {/* Header */}
        <div className="backup-modal-header">
          <div className="backup-modal-title-group">
            <div className="backup-modal-icon-badge" aria-hidden="true">
              <RotateCcwIcon size={20} />
            </div>
            <div>
              <h2 id="backup-restore-modal-title" className="text-h2">
                استعادة نسخة احتياطية
              </h2>
              <span className="text-caption">
                استبدال البيانات الحالية بسجلات نسخة احتياطية سابقة (JSON)
              </span>
            </div>
          </div>

          <button
            type="button"
            className="backup-modal-close-btn"
            onClick={onClose}
            disabled={isRestoring}
            aria-label="إغلاق النافذة"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          data-testid="backup-file-input"
        />

        {/* Content Body */}
        <div className="backup-modal-body">
          {/* Success State */}
          {isSuccess && (
            <div className="backup-success-banner" role="status">
              <CheckIcon size={24} className="backup-success-icon" />
              <div className="backup-success-text">
                <strong className="text-body font-semibold">
                  تمت استعادة البيانات بنجاح!
                </strong>
                <span className="text-caption">
                  تم تحديث كافة الحسابات والتصنيفات والمعاملات بنجاح.
                </span>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="backup-error-banner" role="alert">
              <CloudAlertIcon size={20} className="backup-error-icon" />
              <div className="backup-error-text">
                <strong className="text-body font-semibold">خطأ في الاستعادة</strong>
                <span className="text-caption">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Step 1: File Selection Area */}
          {!parsedData && !isSuccess && (
            <div
              className={`backup-dropzone ${isProcessing ? 'processing' : ''}`}
              onClick={handleTriggerFileInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTriggerFileInput();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="اختيار ملف النسخة الاحتياطية بصيغة JSON"
            >
              <div className="backup-dropzone-icon-wrap" aria-hidden="true">
                <UploadIcon size={28} />
              </div>
              <div className="backup-dropzone-text">
                <span className="text-body font-semibold">
                  {isProcessing
                    ? 'جارٍ فحص وتحليل الملف...'
                    : 'انقر لاختيار ملف النسخة الاحتياطية (.json)'}
                </span>
                <span className="text-caption text-secondary">
                  يدعم ملفات النسخ الاحتياطي الرسمية المُصدَّرة من التطبيق
                </span>
              </div>
            </div>
          )}

          {/* Step 2: Metadata Preview & Safety Warning */}
          {parsedData && previewMetadata && !isSuccess && (
            <div className="backup-preview-container">
              {/* File Info Pill */}
              <div className="backup-file-pill">
                <FileJsonIcon size={18} className="backup-file-icon" />
                <span className="text-caption font-semibold" dir="ltr">
                  {file?.name}
                </span>
                <button
                  type="button"
                  className="btn-text-secondary change-file-btn"
                  onClick={handleTriggerFileInput}
                  disabled={isRestoring}
                >
                  تغيير الملف
                </button>
              </div>

              {/* Metadata Preview Cards Grid */}
              <div className="backup-metadata-grid">
                <div className="backup-metadata-card">
                  <span className="text-caption text-secondary">العملة الأساسية</span>
                  <strong className="text-body font-bold">
                    {previewMetadata.base_currency || 'غير محددة'}
                  </strong>
                </div>

                <div className="backup-metadata-card">
                  <span className="text-caption text-secondary">الحسابات</span>
                  <strong className="text-body font-bold tnum">
                    {previewMetadata.account_count}
                  </strong>
                </div>

                <div className="backup-metadata-card">
                  <span className="text-caption text-secondary">التصنيفات</span>
                  <strong className="text-body font-bold tnum">
                    {previewMetadata.category_count}
                  </strong>
                </div>

                <div className="backup-metadata-card">
                  <span className="text-caption text-secondary">المعاملات</span>
                  <strong className="text-body font-bold tnum">
                    {previewMetadata.transaction_count}
                  </strong>
                </div>
              </div>

              {/* Date Info */}
              <div className="backup-date-row text-caption">
                <span>تاريخ إنشاء النسخة:</span>
                <strong className="tnum">
                  {formatArabicDate(previewMetadata.created_at)}
                </strong>
              </div>

              {/* Inviolable Safety Warning Callout (design-system/states-feedback.md) */}
              <div className="backup-safety-warning">
                <div className="backup-safety-icon-wrap" aria-hidden="true">
                  <CloudAlertIcon size={18} />
                </div>
                <div className="backup-safety-text">
                  <strong className="text-caption font-semibold">
                    استبدال ذري وآمن للبيانات
                  </strong>
                  <p className="text-caption">
                    استعادة النسخة ستستبدل البيانات الحالية على هذا الجهاز. سيتم إنشاء
                    نقطة تراجع تلقائياً في الذاكرة قبل الاستبدال للرجوع إليها في حال حدوث أي خطأ.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="backup-modal-footer">
          <button
            type="button"
            className="btn-secondary backup-cancel-btn"
            onClick={onClose}
            disabled={isRestoring}
          >
            إلغاء
          </button>

          {parsedData && !isSuccess && (
            <button
              type="button"
              className="btn-primary backup-confirm-btn"
              onClick={handleConfirmRestore}
              disabled={isRestoring}
            >
              <RotateCcwIcon size={16} />
              <span>{isRestoring ? 'جارٍ الاستعادة...' : 'تأكيد الاستبدال والاستعادة'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
