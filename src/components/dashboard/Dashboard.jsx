import { useState, useEffect, useCallback } from 'react';
import { db } from '../../db/db.js';
import { getDashboardData } from '../../services/dashboardAnalytics.js';
import { DashboardKpiCards } from './DashboardKpiCards.jsx';
import { AccountBalanceCards } from './AccountBalanceCards.jsx';
import { CategoryBreakdownChart } from './CategoryBreakdownChart.jsx';
import { CashFlowTrendChart } from './CashFlowTrendChart.jsx';
import { RecentTransactionsWidget } from './RecentTransactionsWidget.jsx';
import { DashboardBanner } from './DashboardBanner.jsx';
import './Dashboard.css';

/**
 * Dashboard View (F010)
 * The primary command hub of the Expense Management App.
 * Orchestrates KPI metrics, account balance cards, spending category donut chart,
 * cash flow trend chart, and recent transactions.
 *
 * References:
 * - project-summary.md § 1 & § 23
 * - design-system/screens.md § 1
 * - design-system/data-visualization.md
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function Dashboard({
  database = db,
  onOpenQuickAdd,
  onSelectTab,
  refreshTrigger = 0
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    getDashboardData(database)
      .then((result) => {
        if (!isCancelled) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load dashboard data:', err);
          setError('تعذر تحميل بيانات لوحة التحكم. يرجى المحاولة مرة أخرى.');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [database, refreshTrigger]);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setError(null);
    getDashboardData(database)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to reload dashboard data:', err);
        setError('تعذر تحميل بيانات لوحة التحكم. يرجى المحاولة مرة أخرى.');
        setLoading(false);
      });
  }, [database]);

  if (loading && !data) {
    return (
      <div className="hub-view dashboard-view dashboard-loading-skeleton" aria-label="جارٍ تحميل لوحة التحكم...">
        <div className="skeleton-kpi-grid">
          <div className="skeleton-box skeleton-card" />
          <div className="skeleton-box skeleton-card" />
          <div className="skeleton-box skeleton-card" />
        </div>
        <div className="skeleton-box skeleton-banner" />
        <div className="dashboard-grid-two-col">
          <div className="skeleton-box skeleton-chart" />
          <div className="skeleton-box skeleton-chart" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hub-view dashboard-view">
        <div className="surface-card text-center" style={{ padding: 'var(--space-8)' }}>
          <h3 className="text-h2 color-expense" style={{ marginBottom: 'var(--space-2)' }}>حدث خطأ</h3>
          <p className="text-body" style={{ marginBottom: 'var(--space-4)' }}>{error}</p>
          <button type="button" className="btn-primary" onClick={handleRetry}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const {
    metrics,
    accounts,
    categoryBreakdown,
    cashFlowTrend,
    recentTransactions,
    currency
  } = data || {};

  return (
    <div className="hub-view dashboard-view" data-testid="dashboard-view">
      {/* 1. Primary Financial Health KPI Cards */}
      <DashboardKpiCards
        metrics={metrics}
        currency={currency}
      />

      {/* 2. Account & Wallet Balances */}
      <AccountBalanceCards
        accounts={accounts}
        currency={currency}
        onNavigateAccounts={() => onSelectTab?.('accounts')}
        onOpenQuickAdd={onOpenQuickAdd}
      />

      {/* 3. Welcome FTUX & Quick Action Banner */}
      <DashboardBanner
        onOpenQuickAdd={onOpenQuickAdd}
      />

      {/* 4. Two-Column Analytics Widgets (Category Donut & Cash Flow Trend) */}
      <div className="dashboard-grid-two-col">
        <CategoryBreakdownChart
          breakdown={categoryBreakdown}
          currency={currency}
          onOpenQuickAdd={onOpenQuickAdd}
        />

        <CashFlowTrendChart
          trend={cashFlowTrend}
          currency={currency}
          onOpenQuickAdd={onOpenQuickAdd}
        />
      </div>

      {/* 5. Recent Transactions List */}
      <RecentTransactionsWidget
        transactions={recentTransactions}
        currency={currency}
        onNavigateTransactions={() => onSelectTab?.('transactions')}
        onOpenQuickAdd={onOpenQuickAdd}
      />
    </div>
  );
}

export default Dashboard;
