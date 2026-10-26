import {
  AccountsIcon,
} from '../common/Icons';
import { Dashboard } from '../dashboard/Dashboard.jsx';
import { TransactionLedger } from '../../features/transactions/TransactionLedger.jsx';
import { ReportsView as PeriodicReportsView } from '../../features/reports/ReportsView.jsx';
import { CategoriesView as CategoriesManagementView } from '../../features/categories/CategoriesView.jsx';
import { SettingsView as BaseSettingsView } from '../../features/settings/SettingsView.jsx';
import { db } from '../../db/db.js';

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

export function CategoriesView({ refreshTrigger, onCategoryMutated }) {
  return (
    <CategoriesManagementView
      refreshTrigger={refreshTrigger}
      onCategoryMutated={onCategoryMutated}
    />
  );
}

export function SettingsView({
  theme,
  onToggleTheme,
  onSelectTab,
  database = db,
  refreshTrigger = 0,
  onCurrencyChanged,
  onDataRestored
}) {
  return (
    <BaseSettingsView
      theme={theme}
      onToggleTheme={onToggleTheme}
      onSelectTab={onSelectTab}
      database={database}
      refreshTrigger={refreshTrigger}
      onCurrencyChanged={onCurrencyChanged}
      onDataRestored={onDataRestored}
    />
  );
}

