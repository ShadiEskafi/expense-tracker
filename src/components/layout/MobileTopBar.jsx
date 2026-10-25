import { LogoIcon, SettingsIcon, SunIcon, MoonIcon } from '../common/Icons';
import { SyncStatusPill } from './SyncStatusPill';

/**
 * Mobile Top Bar Component (< 768px)
 * Ref: design-system/navigation.md
 */
export function MobileTopBar({
  title = 'مَصاريفي',
  theme = 'light',
  onToggleTheme,
  onOpenSettings,
  syncStatus = 'synced',
  pendingCount = 0,
  lastSyncedText = 'الآن',
  onTriggerSync,
}) {
  return (
    <header className="mobile-top-bar" role="banner">
      {/* Right side: Brand & Title */}
      <div className="mobile-brand-box">
        <div className="mobile-brand-logo" aria-hidden="true">
          <LogoIcon size={20} />
        </div>
        <h1 className="mobile-bar-title text-h3">{title}</h1>
      </div>

      {/* Center: Sync Status Pill */}
      <div className="mobile-sync-wrapper">
        <SyncStatusPill
          status={syncStatus}
          pendingCount={pendingCount}
          lastSyncedText={lastSyncedText}
          onTriggerSync={onTriggerSync}
          compact
        />
      </div>

      {/* Left side: Theme Toggle & Settings Shortcut */}
      <div className="mobile-actions-box">
        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'تبديل إلى الوضع الفاتح' : 'تبديل إلى الوضع الداكن'}
        >
          {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>

        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onOpenSettings}
          aria-label="فتح الإعدادات"
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}
