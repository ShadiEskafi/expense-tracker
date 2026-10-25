import {
  LogoIcon,
  DashboardIcon,
  TransactionsIcon,
  AccountsIcon,
  ReportsIcon,
  CategoriesIcon,
  SettingsIcon,
  PlusIcon,
} from '../common/Icons';
import { NAV_HUBS } from './navigationConfig';

const ICONS_MAP = {
  DashboardIcon,
  TransactionsIcon,
  AccountsIcon,
  ReportsIcon,
  CategoriesIcon,
  SettingsIcon,
};

/**
 * Desktop Sidebar Navigation
 * Right-aligned (RTL-native), 260px width, sticky/fixed height.
 * Ref: design-system/navigation.md & visual-direction.md
 */
export function DesktopSidebar({
  activeTab = 'dashboard',
  onSelectTab,
  onOpenQuickAdd,
  syncStatus = 'synced',
  userModeText = 'وضع الضيف المحلي',
  lastSyncText = 'محفوظ محلياً',
}) {
  return (
    <aside className="desktop-sidebar" aria-label="شريط التنقل الجانبي">
      {/* 1. Header & Brand Branding */}
      <div className="sidebar-brand-section">
        <div className="brand-badge-container">
          <div className="brand-logo-box" aria-hidden="true">
            <LogoIcon size={24} className="brand-logo-icon" />
          </div>
          <div className="brand-text-block">
            <h1 className="brand-name">مَصاريفي</h1>
            <span className="brand-tagline">إدارة المصاريف الذكية</span>
          </div>
        </div>
      </div>

      {/* 2. Primary Action: Quick Add Button */}
      <div className="sidebar-action-section">
        <button
          type="button"
          className="sidebar-quick-add-btn"
          onClick={onOpenQuickAdd}
          aria-label="تسجيل معاملة جديدة (اضغط N)"
        >
          <PlusIcon size={18} className="quick-add-plus-icon" />
          <span className="quick-add-text">تسجيل معاملة</span>
          <kbd className="quick-add-kbd-badge" title="اختصار لوحة المفاتيح: N">
            N
          </kbd>
        </button>
      </div>

      {/* 3. Navigation Links */}
      <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
        <ul className="sidebar-nav-list">
          {NAV_HUBS.map((hub) => {
            const IconComponent = ICONS_MAP[hub.iconName] || DashboardIcon;
            const isActive = activeTab === hub.id;

            return (
              <li key={hub.id} className="sidebar-nav-item">
                <button
                  type="button"
                  className={`sidebar-nav-link ${isActive ? 'is-active' : ''}`}
                  onClick={() => onSelectTab && onSelectTab(hub.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="sidebar-nav-active-indicator" aria-hidden="true" />
                  <span className="sidebar-nav-icon-box" aria-hidden="true">
                    <IconComponent size={20} className="sidebar-nav-icon" />
                  </span>
                  <span className="sidebar-nav-label">{hub.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 4. Footer & Cloud Sync Status Card */}
      <div className="sidebar-footer-section">
        <div className="sidebar-sync-card">
          <div className="sync-card-status-row">
            <span
              className={`sync-card-indicator-dot sync-dot-${syncStatus}`}
              aria-hidden="true"
            />
            <span className="sync-card-user-mode">{userModeText}</span>
          </div>
          <span className="sync-card-timestamp text-caption">{lastSyncText}</span>
        </div>
      </div>
    </aside>
  );
}
