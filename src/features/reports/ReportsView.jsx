import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../db/db.js';
import {
  SparklesIcon,
  ReportsIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';
import {
  toIsoDate,
  getPeriodDateRange,
  shiftPeriodReferenceDate,
  calculatePeriodicMetrics
} from './reportsAnalytics.js';
import { ReportsPeriodControls } from './ReportsPeriodControls.jsx';
import { ReportsKpiCards } from './ReportsKpiCards.jsx';
import { ReportsCategoryBreakdown } from './ReportsCategoryBreakdown.jsx';
import { ReportsSpendingCadence } from './ReportsSpendingCadence.jsx';
import { ReportsTopExpenses } from './ReportsTopExpenses.jsx';
import { TransactionDetailModal } from '../transactions/TransactionDetailModal.jsx';
import { TransactionEditModal } from '../transactions/TransactionEditModal.jsx';
import { TransactionDeleteConfirmModal } from '../transactions/TransactionDeleteConfirmModal.jsx';
import { updateTransaction, deleteTransaction } from '../../services/transaction.js';
import './ReportsView.css';

/**
 * Periodic Reports & Analytics Hub (F012)
 *
 * Implements interval filtering (Week, Month, Year, Custom), period navigation,
 * KPI metric summaries, category spending breakdown with Recharts Donut,
 * chronological cash flow / spending cadence trend, top individual expenses ranking,
 * category drilldown inspection, and full transaction detail interaction.
 *
 * References:
 * - project-summary.md § 14 (Reports and Analytics)
 * - design-system/screens.md § 8 (Reports & Analytics View)
 * - design-system/data-visualization.md
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function ReportsView({
  database = db,
  onOpenQuickAdd,
  onSelectTab,
  refreshTrigger = 0,
  onTransactionMutated,
  initialLoading = false
}) {
  // Preset & Time Horizon State
  const [preset, setPreset] = useState('this_month');
  const [referenceDate, setReferenceDate] = useState(() => new Date());

  // Custom Date Range State
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const d = new Date();
    return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  });

  // Drilldown Filter State
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  // Modals State
  const [detailTransaction, setDetailTransaction] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deletingTransaction, setDeletingTransaction] = useState(null);

  // Raw Database Cache State
  const [rawTransactions, setRawTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [currency, setCurrency] = useState('SAR');
  const [loading, setLoading] = useState(initialLoading);

  // 1. Fetch raw collections from IndexedDB with cancellation guard
  const fetchDbData = useCallback(async () => {
    const [txList, catList, accList, settings] = await Promise.all([
      database.transactions.toArray(),
      database.categories.toArray(),
      database.accounts.toArray(),
      database.settings.get('base_currency')
    ]);
    return {
      transactions: txList || [],
      categories: (catList || []).filter((c) => c.deleted_at === null),
      accounts: (accList || []).filter((a) => a.deleted_at === null),
      currency: settings?.value || 'SAR'
    };
  }, [database]);

  useEffect(() => {
    let isCancelled = false;

    fetchDbData()
      .then((data) => {
        if (!isCancelled) {
          setRawTransactions(data.transactions);
          setCategories(data.categories);
          setAccounts(data.accounts);
          setCurrency(data.currency);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [fetchDbData, refreshTrigger]);

  const reloadData = useCallback(async () => {
    try {
      const data = await fetchDbData();
      setRawTransactions(data.transactions);
      setCategories(data.categories);
      setAccounts(data.accounts);
      setCurrency(data.currency);
    } catch {
      // Ignore reload error
    }
  }, [fetchDbData]);

  // 2. Compute Active Date Range
  const activeRange = useMemo(() => {
    return getPeriodDateRange(preset, {
      referenceDate,
      customStartDate,
      customEndDate
    });
  }, [preset, referenceDate, customStartDate, customEndDate]);

  // 3. Compute Metrics & Breakdown
  const report = useMemo(() => {
    return calculatePeriodicMetrics(rawTransactions, categories, accounts, {
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
      currency,
      selectedCategoryId
    });
  }, [rawTransactions, categories, accounts, activeRange, currency, selectedCategoryId]);

  // Check if reference date has stepped away from current time
  const isNavigatedAway = useMemo(() => {
    if (preset === 'custom') return false;
    const currentRange = getPeriodDateRange(preset, { referenceDate: new Date() });
    return (
      currentRange.startDate !== activeRange.startDate ||
      currentRange.endDate !== activeRange.endDate
    );
  }, [preset, activeRange]);

  // Handlers
  const handleSelectPreset = (newPreset) => {
    setPreset(newPreset);
    setSelectedCategoryId(null);
    if (newPreset !== 'custom') {
      setReferenceDate(new Date());
    }
  };

  const handleNavigatePeriod = (direction) => {
    setReferenceDate((prev) => shiftPeriodReferenceDate(preset, prev, direction));
    setSelectedCategoryId(null);
  };

  const handleResetToCurrent = () => {
    setReferenceDate(new Date());
    setSelectedCategoryId(null);
  };

  const handleApplyCustomDates = (start, end) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setSelectedCategoryId(null);
  };

  // Transaction mutation handlers inside modals
  const handleSaveEdit = async (updatedFields) => {
    if (!editingTransaction) return;
    try {
      await updateTransaction(
        editingTransaction.id,
        {
          amount: updatedFields.amount,
          category_id: updatedFields.category_id,
          account_id: updatedFields.account_id,
          date: updatedFields.date,
          notes: updatedFields.notes,
          tags: updatedFields.tags
        },
        database
      );
      setEditingTransaction(null);
      setDetailTransaction(null);
      await reloadData();
      if (onTransactionMutated) onTransactionMutated();
    } catch {
      // Handled in modal
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTransaction) return;
    try {
      await deleteTransaction(deletingTransaction.id, database);
      setDeletingTransaction(null);
      setDetailTransaction(null);
      await reloadData();
      if (onTransactionMutated) onTransactionMutated();
    } catch {
      // Handled in modal
    }
  };

  const selectedCategoryObj = useMemo(() => {
    if (!selectedCategoryId) return null;
    return categories.find((c) => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  const hasAnyData =
    report.metrics.totalExpense > 0 ||
    report.metrics.totalIncome > 0 ||
    report.metrics.totalCount > 0;

  return (
    <div className="reports-view-root" data-testid="reports-view">
      {/* 1. Header & Period Controls */}
      <div className="reports-title-row">
        <div>
          <h2 className="reports-title text-h2">التقارير والتحليلات المالية</h2>
          <p className="reports-subtitle">
            تحليل معمق لعادات الإنفاق، توزيع النفقات حسب التصنيف، وأعلى المصاريف الفردية
          </p>
        </div>
      </div>

      <ReportsPeriodControls
        preset={preset}
        onSelectPreset={handleSelectPreset}
        startDate={activeRange.startDate}
        endDate={activeRange.endDate}
        onNavigatePeriod={handleNavigatePeriod}
        onResetToCurrent={handleResetToCurrent}
        isNavigatedAway={isNavigatedAway}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onApplyCustomDates={handleApplyCustomDates}
      />

      {/* 2. Empty State (When period has no transactions) */}
      {!loading && !hasAnyData ? (
        <div className="reports-empty-state" data-testid="reports-empty-state">
          <div className="empty-state-icon-wrap" aria-hidden="true">
            <ReportsIcon size={36} />
          </div>
          <h3 className="empty-state-title">لا توجد معاملات مسجلة في هذه الفترة</h3>
          <p className="empty-state-text">
            لم تسجل أي مصاريف أو إيرادات في النطاق الزمني المحدد. يمكنك تسجيل معاملة جديدة أو استعراض فترة زمنية أخرى.
          </p>
          <div className="empty-state-actions">
            {onOpenQuickAdd && (
              <button
                type="button"
                className="btn-primary"
                onClick={onOpenQuickAdd}
              >
                <PlusIcon size={16} />
                تسجيل أول مصروف
              </button>
            )}
            {onSelectTab && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onSelectTab('transactions')}
              >
                استعراض المعاملات
              </button>
            )}
            {isNavigatedAway && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetToCurrent}
              >
                الرجوع للفترة الحالية
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 3. KPI Metric Cards */}
          <ReportsKpiCards
            metrics={report.metrics}
            currency={currency}
            daysInPeriod={report.daysInPeriod}
          />

          {/* 4. Smart Financial Insight Banner */}
          {report.insightText && (
            <div className="reports-insight-banner" role="status" aria-live="polite">
              <div className="insight-icon-wrap" aria-hidden="true">
                <SparklesIcon size={20} />
              </div>
              <div>{report.insightText}</div>
            </div>
          )}

          {/* 5. Main Analytics Grid: Category Breakdown + Spending Cadence */}
          <div className="reports-charts-grid">
            <ReportsCategoryBreakdown
              categoryBreakdown={report.categoryBreakdown}
              totalExpense={report.metrics.totalExpense}
              currency={currency}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />

            <ReportsSpendingCadence
              timelineData={report.timelineData}
              currency={currency}
              daysInPeriod={report.daysInPeriod}
            />
          </div>

          {/* 6. Top Individual Expenses Ranking */}
          <ReportsTopExpenses
            topExpenses={report.topExpenses}
            currency={currency}
            selectedCategoryId={selectedCategoryId}
            selectedCategoryName={selectedCategoryObj?.name || ''}
            onClearCategoryFilter={() => setSelectedCategoryId(null)}
            onSelectTransaction={(tx) => {
              // Find matching full transaction object for modal
              const fullTx = rawTransactions.find((t) => t.id === tx.id);
              if (fullTx) {
                const cat = categories.find((c) => c.id === fullTx.category_id);
                const acc = accounts.find((a) => a.id === fullTx.account_id);
                setDetailTransaction({
                  ...fullTx,
                  category: cat,
                  account: acc
                });
              }
            }}
          />
        </>
      )}

      {/* 7. Transaction Detail Modal */}
      {detailTransaction && (
        <TransactionDetailModal
          transaction={detailTransaction}
          onClose={() => setDetailTransaction(null)}
          onEdit={(tx) => {
            setDetailTransaction(null);
            setEditingTransaction(tx);
          }}
          onDelete={(tx) => {
            setDetailTransaction(null);
            setDeletingTransaction(tx);
          }}
        />
      )}

      {/* 8. Transaction Edit Modal */}
      {editingTransaction && (
        <TransactionEditModal
          transaction={editingTransaction}
          categories={categories}
          accounts={accounts}
          isOpen={true}
          onClose={() => setEditingTransaction(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* 9. Transaction Delete Confirmation Modal */}
      {deletingTransaction && (
        <TransactionDeleteConfirmModal
          transaction={deletingTransaction}
          isOpen={true}
          onClose={() => setDeletingTransaction(null)}
          onConfirmDelete={handleConfirmDelete}
        />
      )}
    </div>
  );
}
