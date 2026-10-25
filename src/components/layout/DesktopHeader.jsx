import { SearchIcon, SunIcon, MoonIcon } from '../common/Icons';
import { SyncStatusPill } from './SyncStatusPill';
import { NAV_HUBS } from './navigationConfig';

/**
 * Desktop Header Component
 * Sticky top bar on desktop views (>= 768px)
 * Ref: design-system/navigation.md
 */
export function DesktopHeader({
  activeTab = 'dashboard',
  theme = 'light',
  onToggleTheme,
  onOpenSearch,
  syncStatus = 'synced',
  pendingCount = 0,
  lastSyncedText = 'الآن',
  onTriggerSync,
}) {
  const currentHub = NAV_HUBS.find((hub) => hub.id === activeTab) || NAV_HUBS[0];

  return (
    <header className="desktop-header" role="banner">
      {/* 1. Page Title & Breadcrumb */}
      <div className="desktop-header-title-block">
        <h2 className="desktop-header-title text-h2">{currentHub.label}</h2>
        {activeTab !== 'dashboard' && (
          <nav aria-label="مسار التتبع" className="desktop-breadcrumb text-caption">
            <span>الرئيسية</span>
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
            <span className="breadcrumb-current">{currentHub.shortLabel}</span>
          </nav>
        )}
      </div>

      {/* 2. Actions & Controls (Search, Sync, Theme) */}
      <div className="desktop-header-actions-block">
        {/* Quick Search Trigger */}
        <button
          type="button"
          className="desktop-search-trigger-btn"
          onClick={onOpenSearch}
          aria-label="بحث في المعاملات والحسابات (Ctrl + K أو /)"
        >
          <SearchIcon size={16} className="search-trigger-icon" />
          <span className="search-trigger-placeholder">بحث سريع...</span>
          <kbd className="search-trigger-kbd">Ctrl K</kbd>
        </button>

        {/* Sync Status Badge */}
        <SyncStatusPill
          status={syncStatus}
          pendingCount={pendingCount}
          lastSyncedText={lastSyncedText}
          onTriggerSync={onTriggerSync}
        />

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'تبديل إلى الوضع الفاتح' : 'تبديل إلى الوضع الداكن'}
          title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
          {theme === 'dark' ? (
            <SunIcon size={20} className="theme-toggle-icon" />
          ) : (
            <MoonIcon size={20} className="theme-toggle-icon" />
          )}
        </button>
      </div>
    </header>
  );
}
