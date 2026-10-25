import {
  AccountsIcon,
  CategoriesIcon,
} from '../common/Icons';
import { Dashboard } from '../dashboard/Dashboard.jsx';
import { TransactionLedger } from '../../features/transactions/TransactionLedger.jsx';
import { ReportsView as PeriodicReportsView } from '../../features/reports/ReportsView.jsx';

/**
 * Hub Views for AppShell
 * Authentically styled according to design-system/screens.md
 */

export function DashboardView({ onOpenQuickAdd, onSelectTab, refreshTrigger }) {
  return (
    <Dashboard
      onOpenQuickAdd={onOpenQuickAdd}
      onSelectTab={onSelectTab}
      refreshTrigger={refreshTrigger}
    />
  );
}

export function TransactionsView({ onOpenQuickAdd, refreshTrigger, onTransactionMutated }) {
  return (
    <TransactionLedger
      onOpenQuickAdd={onOpenQuickAdd}
      refreshTrigger={refreshTrigger}
      onTransactionMutated={onTransactionMutated}
    />
  );
}

export function AccountsView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">المحافظ والحسابات المالية</h3>
            <span className="text-caption">إدارة الحسابات البنكية، النقدية، وبطاقات الائتمان</span>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <AccountsIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">إدارة الحسابات نشطة</h4>
          <p className="text-caption">أرصدتك مدعومة بنظام دفتر الأستاذ (Ledger-backed) المنفذ في F004.</p>
        </div>
      </div>
    </div>
  );
}

export function ReportsView({ onOpenQuickAdd, onSelectTab, refreshTrigger, onTransactionMutated }) {
  return (
    <PeriodicReportsView
      onOpenQuickAdd={onOpenQuickAdd}
      onSelectTab={onSelectTab}
      refreshTrigger={refreshTrigger}
      onTransactionMutated={onTransactionMutated}
    />
  );
}

export function CategoriesView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">إدارة التصنيفات</h3>
            <span className="text-caption">تصنيفات المصاريف والدخل المحددة مسبقاً وتخصيصها</span>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <CategoriesIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">التصنيفات المعتمدة محملة</h4>
          <p className="text-caption">16 تصنيفاً قياسياً معرّفة بدقة في F003، مع إمكانية التخصيص في F013.</p>
        </div>
      </div>
    </div>
  );
}

export function SettingsView({ theme, onToggleTheme }) {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">الإعدادات والبيانات</h3>
            <span className="text-caption">تخصيص المظهر، قفل العملة، المزامنة، والنسخ الاحتياطي</span>
          </div>
        </div>
        <div className="settings-options-list">
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">مظهر التطبيق</span>
              <span className="text-caption">التبديل بين الوضع الفاتح والداكن</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? 'الوضع الداكن (نشط)' : 'الوضع الفاتح (نشط)'}
            </button>
          </div>

          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">العملة الأساسية المقفلة</span>
              <span className="text-caption">ريال سعودي (SAR - ر.س) • محسوبة بوحدات الماينور الصحيحة</span>
            </div>
            <span className="status-badge-locked text-caption">مقفل لحماية البيانات</span>
          </div>

          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">التخزين والمزامنة</span>
              <span className="text-caption">تخزين محلي أولاً (IndexedDB / Dexie.js) • وضع الضيف الآمن</span>
            </div>
            <span className="status-badge-active text-caption">محلي نشط</span>
          </div>
        </div>
      </div>
    </div>
  );
}
