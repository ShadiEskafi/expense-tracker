import {
  DashboardIcon,
  TransactionsIcon,
  AccountsIcon,
  ReportsIcon,
  PlusIcon,
} from '../common/Icons';

/**
 * Mobile Bottom Navigation Bar (< 768px)
 * 4 primary destinations + elevated center Quick Add FAB.
 * Ref: design-system/navigation.md & visual-direction.md
 */
export function MobileBottomNav({
  activeTab = 'dashboard',
  onSelectTab,
  onOpenQuickAdd,
}) {
  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="شريط التنقل السفلي">
      {/* Tab 1: الرئيسية */}
      <button
        type="button"
        className={`mobile-nav-tab ${activeTab === 'dashboard' ? 'is-active' : ''}`}
        onClick={() => onSelectTab && onSelectTab('dashboard')}
        aria-current={activeTab === 'dashboard' ? 'page' : undefined}
        aria-label="الرئيسية"
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          <DashboardIcon size={22} />
        </span>
        <span className="mobile-tab-label">الرئيسية</span>
      </button>

      {/* Tab 2: المعاملات */}
      <button
        type="button"
        className={`mobile-nav-tab ${activeTab === 'transactions' ? 'is-active' : ''}`}
        onClick={() => onSelectTab && onSelectTab('transactions')}
        aria-current={activeTab === 'transactions' ? 'page' : undefined}
        aria-label="المعاملات"
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          <TransactionsIcon size={22} />
        </span>
        <span className="mobile-tab-label">المعاملات</span>
      </button>

      {/* Center FAB: Quick Add (+) */}
      <div className="mobile-fab-container">
        <button
          type="button"
          className="mobile-center-fab"
          onClick={onOpenQuickAdd}
          aria-label="تسجيل معاملة سريعة"
        >
          <PlusIcon size={24} className="mobile-fab-icon" />
        </button>
      </div>

      {/* Tab 3: المحافظ */}
      <button
        type="button"
        className={`mobile-nav-tab ${activeTab === 'accounts' ? 'is-active' : ''}`}
        onClick={() => onSelectTab && onSelectTab('accounts')}
        aria-current={activeTab === 'accounts' ? 'page' : undefined}
        aria-label="المحافظ والحسابات"
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          <AccountsIcon size={22} />
        </span>
        <span className="mobile-tab-label">المحافظ</span>
      </button>

      {/* Tab 4: التقارير */}
      <button
        type="button"
        className={`mobile-nav-tab ${activeTab === 'reports' ? 'is-active' : ''}`}
        onClick={() => onSelectTab && onSelectTab('reports')}
        aria-current={activeTab === 'reports' ? 'page' : undefined}
        aria-label="التقارير والتحليلات"
      >
        <span className="mobile-tab-icon" aria-hidden="true">
          <ReportsIcon size={22} />
        </span>
        <span className="mobile-tab-label">التقارير</span>
      </button>
    </nav>
  );
}
