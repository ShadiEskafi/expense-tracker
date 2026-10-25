import { useState } from 'react';
import {
  CloudCheckIcon,
  CloudSyncIcon,
  CloudOfflineIcon,
  CloudAlertIcon,
} from '../common/Icons';

/**
 * Reusable Sync Status Pill
 * Matches design-system/states-feedback.md & design-tokens.md
 */
export function SyncStatusPill({
  status = 'synced',
  pendingCount = 0,
  lastSyncedText = 'الآن',
  onTriggerSync,
  compact = false,
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'syncing':
        return {
          label: 'جاري المزامنة...',
          colorVar: 'var(--color-sync-syncing)',
          icon: <CloudSyncIcon size={14} className="sync-icon-spinning" />,
          bgColor: 'rgba(59, 130, 246, 0.1)',
        };
      case 'pending':
        return {
          label: pendingCount > 0 ? `${pendingCount} قيد الانتظار` : 'تعديلات معلقة',
          colorVar: 'var(--color-sync-pending)',
          icon: <CloudAlertIcon size={14} />,
          bgColor: 'rgba(245, 158, 11, 0.12)',
        };
      case 'offline':
        return {
          label: 'وضع محلي',
          colorVar: 'var(--color-sync-offline)',
          icon: <CloudOfflineIcon size={14} />,
          bgColor: 'rgba(100, 116, 139, 0.1)',
        };
      case 'failed':
        return {
          label: 'تعذر الاتصال',
          colorVar: 'var(--color-sync-failed)',
          icon: <CloudAlertIcon size={14} />,
          bgColor: 'rgba(239, 68, 68, 0.12)',
        };
      case 'synced':
      default:
        return {
          label: 'متزامن',
          colorVar: 'var(--color-sync-synced)',
          icon: <CloudCheckIcon size={14} />,
          bgColor: 'rgba(16, 185, 129, 0.1)',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="sync-pill-wrapper">
      <button
        type="button"
        className={`sync-pill-btn ${compact ? 'sync-pill-compact' : ''}`}
        style={{
          borderColor: config.colorVar,
          backgroundColor: config.bgColor,
        }}
        onClick={() => setIsPopoverOpen((prev) => !prev)}
        aria-expanded={isPopoverOpen}
        aria-label={`حالة المزامنة: ${config.label}`}
        title={`حالة المزامنة: ${config.label}`}
      >
        <span
          className="sync-pill-dot"
          style={{ backgroundColor: config.colorVar }}
          aria-hidden="true"
        />
        <span className="sync-pill-icon" style={{ color: config.colorVar }}>
          {config.icon}
        </span>
        {!compact && (
          <span className="sync-pill-label" style={{ color: config.colorVar }}>
            {config.label}
          </span>
        )}
      </button>

      {isPopoverOpen && (
        <>
          <div
            className="sync-popover-backdrop"
            onClick={() => setIsPopoverOpen(false)}
          />
          <div className="sync-popover-card" role="region" aria-label="تفاصيل المزامنة">
            <div className="sync-popover-header">
              <span
                className="sync-popover-dot"
                style={{ backgroundColor: config.colorVar }}
              />
              <span className="sync-popover-title">{config.label}</span>
            </div>
            <p className="sync-popover-desc text-caption">
              {status === 'synced' && `تمت آخر مزامنة بنجاح: ${lastSyncedText}`}
              {status === 'pending' && `لديك ${pendingCount} تعديلات محفوظة محلياً بانتظار الاتصال بالسحابة.`}
              {status === 'offline' && 'أنت تعمل حالياً بدون اتصال. كافة المعاملات محفوظة محلياً في جهازك بأمان.'}
              {status === 'syncing' && 'جاري رفع التعديلات ومزامنة البيانات مع السحابة...'}
              {status === 'failed' && 'تعذر الوصول إلى الخادم السحابي. يرجى التحقق من اتصال الشبكة.'}
            </p>
            {onTriggerSync && (
              <button
                type="button"
                className="sync-popover-action"
                onClick={() => {
                  setIsPopoverOpen(false);
                  onTriggerSync();
                }}
              >
                مزامنة الآن
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
