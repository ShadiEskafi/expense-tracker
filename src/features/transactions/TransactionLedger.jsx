import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../db/db.js';
import {
  SearchIcon,
  CloseIcon,
  FilterIcon,
  PlusIcon,
  RotateCcwIcon,
  TransactionsIcon,
  CategoryIcon,
  WalletIcon,
  TransferIcon,
  EditIcon,
  TrashIcon,
  DownloadIcon
} from '../../components/common/Icons.jsx';
import { formatCurrency } from '../../utils/currency.js';
import { exportTransactions } from '../../utils/csvExport.js';
import {
  DEFAULT_FILTERS,
  DATE_PRESETS,
  filterTransactions,
  groupTransactionsByDate,
  computeFilteredSummary,
  getActiveFiltersCount,
  fetchTransactionLedgerData
} from './filter.js';
import { TransactionFilterDrawer } from './TransactionFilterDrawer.jsx';
import { TransactionDetailModal } from './TransactionDetailModal.jsx';
import { TransactionEditModal } from './TransactionEditModal.jsx';
import { TransactionDeleteConfirmModal } from './TransactionDeleteConfirmModal.jsx';
import { TransactionExportModal } from './TransactionExportModal.jsx';
import { updateTransaction, deleteTransaction } from '../../services/transaction.js';
import { updateTransfer, deleteTransfer } from '../../services/transfer.js';
import './TransactionLedger.css';

/**
 * Transaction Ledger, Keyword Search & Multi-Filtering Hub (F011)
 *
 * References:
 * - project-summary.md § 23 & § 24 (View 2)
 * - design-system/screens.md § 2
 * - skills: /impeccable, /make-interfaces-feel-better, /ui-ux-pro-max, /transitions-dev
 */
export function TransactionLedger({
  database = db,
  onOpenQuickAdd,
  refreshTrigger = 0,
  onTransactionMutated,
  initialTransactions = null,
  initialCategories = null,
  initialAccounts = null
}) {
  const [rawTransactions, setRawTransactions] = useState(initialTransactions || []);
  const [categories, setCategories] = useState(initialCategories || []);
  const [accounts, setAccounts] = useState(initialAccounts || []);
  const [loading, setLoading] = useState(initialTransactions === null);

  // Filters State
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');

  // Modals & Panels State
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Export State (F015)
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Initial load and auto-refresh on external mutations
  useEffect(() => {
    let isCancelled = false;

    fetchTransactionLedgerData(database)
      .then((data) => {
        if (!isCancelled) {
          setRawTransactions(data.transactions);
          setCategories(data.categories);
          setAccounts(data.accounts);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load transaction ledger data:', err);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [database, refreshTrigger]);

  const reloadData = useCallback(async () => {
    try {
      const data = await fetchTransactionLedgerData(database);
      setRawTransactions(data.transactions);
      setCategories(data.categories);
      setAccounts(data.accounts);
    } catch (err) {
      console.error('Failed to reload transaction ledger:', err);
    }
  }, [database]);

  // Debounce search input to filter state (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Apply filtered transactions
  const filteredTransactions = useMemo(() => {
    return filterTransactions(rawTransactions, filters);
  }, [rawTransactions, filters]);

  // Financial summary for filtered dataset
  const summary = useMemo(() => {
    return computeFilteredSummary(filteredTransactions);
  }, [filteredTransactions]);

  // Chronologically grouped transactions
  const groupedTransactions = useMemo(() => {
    return groupTransactionsByDate(filteredTransactions);
  }, [filteredTransactions]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return getActiveFiltersCount(filters);
  }, [filters]);

  // Quick Type Filter change
  const handleQuickTypeChange = (type) => {
    setFilters((prev) => ({
      ...prev,
      type: prev.type === type ? 'all' : type
    }));
  };

  // Quick Date Preset change
  const handleQuickDatePreset = (presetId) => {
    setFilters((prev) => ({
      ...prev,
      datePreset: presetId,
      ...(presetId !== 'custom' ? { startDate: '', endDate: '' } : {})
    }));
  };

  // Clear search input
  const handleClearSearch = () => {
    setSearchInput('');
    setFilters((prev) => ({ ...prev, search: '' }));
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchInput('');
    setFilters(DEFAULT_FILTERS);
  };

  // Handle saving an edited transaction
  const handleSaveEdit = async (transactionId, updates, type) => {
    if (type === 'transfer') {
      await updateTransfer(transactionId, updates, database);
    } else {
      await updateTransaction(transactionId, updates, database);
    }
    await reloadData();
    if (onTransactionMutated) onTransactionMutated();
  };

  // Handle soft deleting a transaction
  const handleConfirmDelete = async () => {
    if (!deletingTx) return;
    try {
      setIsDeleting(true);
      if (deletingTx.type === 'transfer') {
        await deleteTransfer(deletingTx.id, database);
      } else {
        await deleteTransaction(deletingTx.id, database);
      }
      setDeletingTx(null);
      setSelectedTx(null);
      await reloadData();
      if (onTransactionMutated) onTransactionMutated();
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Total active transactions count in DB
  const totalDbTransactions = rawTransactions.filter((tx) => tx.deleted_at === null).length;

  // Export handlers (F015)
  const handleExportClick = () => {
    if (activeFiltersCount > 0) {
      setIsExportModalOpen(true);
    } else {
      handleExportAll();
    }
  };

  const handleExportFiltered = async () => {
    try {
      setIsExporting(true);
      const res = await exportTransactions({
        database,
        transactions: filteredTransactions
      });
      setIsExportModalOpen(false);
      triggerToast(`تم تصدير ${res.count} معاملة مفلترة كملف CSV بنجاح`);
    } catch (err) {
      console.error('Failed to export filtered transactions:', err);
      triggerToast('تعذر تصدير المعاملات المفلترة');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    try {
      setIsExporting(true);
      const res = await exportTransactions({
        database
      });
      setIsExportModalOpen(false);
      triggerToast(`تم تصدير كافة المعاملات (${res.count} معاملة) كملف CSV بنجاح`);
    } catch (err) {
      console.error('Failed to export all transactions:', err);
      triggerToast('تعذر تصدير المعاملات');
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="hub-view ledger-view" aria-label="جارٍ تحميل سجل المعاملات...">
        <div className="ledger-loading-skeleton">
          <div className="skeleton-box skeleton-header" />
          <div className="skeleton-box skeleton-summary" />
          <div className="skeleton-box skeleton-row" />
          <div className="skeleton-box skeleton-row" />
          <div className="skeleton-box skeleton-row" />
        </div>
      </div>
    );
  }

  return (
    <div className="hub-view ledger-view">
      {/* 1. Header & Primary Actions */}
      <div className="ledger-header-panel surface-card">
        <div className="ledger-title-row">
          <div>
            <h1 className="text-h2">سجل المعاملات المالي</h1>
            <p className="text-caption">
              استعراض، تصفية، وبحث كامل في السجل التاريخي لكافة العمليات المالية
            </p>
          </div>
          <div className="ledger-title-actions">
            <button
              type="button"
              className="btn-secondary ledger-export-btn"
              onClick={handleExportClick}
              disabled={isExporting || totalDbTransactions === 0}
              aria-label="تصدير كملف CSV"
            >
              <DownloadIcon size={18} />
              <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير CSV'}</span>
            </button>
            {onOpenQuickAdd && (
              <button
                type="button"
                className="btn-primary"
                onClick={onOpenQuickAdd}
                aria-label="تسجيل معاملة جديدة"
              >
                <PlusIcon size={18} />
                <span>معاملة جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Search & Controls Bar */}
        <div className="ledger-search-controls-row">
          {/* Real-time search with clear button */}
          <div className="ledger-search-box">
            <SearchIcon size={18} className="search-icon-prefix" />
            <input
              type="text"
              className="ledger-search-input"
              placeholder="ابحث بالوصف، التصنيف، الحساب، أو الوسوم..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="بحث في المعاملات"
            />
            {searchInput && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={handleClearSearch}
                aria-label="مسح البحث"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </div>

          {/* Quick Type Tabs (Segmented) */}
          <div className="ledger-type-tabs" role="tablist">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'expense', label: 'مصاريف' },
              { id: 'income', label: 'دخل' },
              { id: 'transfer', label: 'تحويلات' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filters.type === tab.id}
                className={`type-tab-btn ${filters.type === tab.id ? 'active' : ''}`}
                onClick={() => handleQuickTypeChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Advanced Filter Button with Active Count Badge */}
          <button
            type="button"
            className={`ledger-filter-btn ${activeFiltersCount > 0 ? 'has-active-filters' : ''}`}
            onClick={() => setIsFilterDrawerOpen(true)}
            aria-label="فتح التصفية المتقدمة"
          >
            <FilterIcon size={18} />
            <span>تصفية</span>
            {activeFiltersCount > 0 && (
              <span className="filter-count-badge tnum" data-testid="active-filter-badge">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* 3. Quick Date Presets Row */}
        <div className="ledger-date-presets-row" role="region" aria-label="محددات التاريخ السريعة">
          {DATE_PRESETS.map((dp) => (
            <button
              key={dp.id}
              type="button"
              className={`date-preset-pill ${filters.datePreset === dp.id ? 'active' : ''}`}
              onClick={() => handleQuickDatePreset(dp.id)}
            >
              {dp.label}
            </button>
          ))}
        </div>

        {/* 4. Active Filters Bar (when any non-default filter is applied) */}
        {activeFiltersCount > 0 && (
          <div className="active-filters-chips-bar" aria-label="الفلاتر النشطة">
            <span className="active-filters-label text-caption-bold">الفلاتر المطبقة:</span>

            {/* Search tag */}
            {filters.search && (
              <span className="filter-chip-removable">
                <span>بحث: &quot;{filters.search}&quot;</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="إزالة فلتر البحث"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}

            {/* Type tag */}
            {filters.type && filters.type !== 'all' && (
              <span className="filter-chip-removable">
                <span>النوع: {filters.type === 'expense' ? 'مصاريف' : filters.type === 'income' ? 'دخل' : 'تحويلات'}</span>
                <button
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, type: 'all' }))}
                  aria-label="إزالة فلتر النوع"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}

            {/* Date Preset tag */}
            {filters.datePreset && filters.datePreset !== 'all' && (
              <span className="filter-chip-removable">
                <span>
                  الفترة: {DATE_PRESETS.find((p) => p.id === filters.datePreset)?.label || filters.datePreset}
                </span>
                <button
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, datePreset: 'all', startDate: '', endDate: '' }))}
                  aria-label="إزالة فلتر الفترة"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}

            {/* Category tag */}
            {filters.categoryIds?.length > 0 && (
              <span className="filter-chip-removable">
                <span>التصنيفات ({filters.categoryIds.length})</span>
                <button
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, categoryIds: [] }))}
                  aria-label="إزالة فلتر التصنيفات"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}

            {/* Account tag */}
            {filters.accountIds?.length > 0 && (
              <span className="filter-chip-removable">
                <span>الحسابات ({filters.accountIds.length})</span>
                <button
                  type="button"
                  onClick={() => setFilters((p) => ({ ...p, accountIds: [] }))}
                  aria-label="إزالة فلتر الحسابات"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}

            {/* Clear All Button */}
            <button
              type="button"
              className="clear-all-filters-btn text-caption"
              onClick={handleResetFilters}
            >
              <RotateCcwIcon size={12} />
              <span>إعادة ضبط الكل</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. Filtered Financial Summary Strip */}
      <div className="ledger-summary-strip" aria-label="ملخص المعاملات المفلترة">
        <div className="summary-metric-card surface-card">
          <span className="metric-label text-caption">المصاريف المفلترة</span>
          <div className="metric-value tnum color-expense">
            - {formatCurrency(summary.totalExpense, 'SAR')}
          </div>
          <span className="metric-count text-caption-muted">{summary.expenseCount} معاملة</span>
        </div>

        <div className="summary-metric-card surface-card">
          <span className="metric-label text-caption">الدخل المفلتر</span>
          <div className="metric-value tnum color-income">
            + {formatCurrency(summary.totalIncome, 'SAR')}
          </div>
          <span className="metric-count text-caption-muted">{summary.incomeCount} معاملة</span>
        </div>

        <div className="summary-metric-card surface-card">
          <span className="metric-label text-caption">صافي العمليات</span>
          <div
            className={`metric-value tnum ${
              summary.netCashFlow > 0 ? 'color-income' : summary.netCashFlow < 0 ? 'color-expense' : 'color-secondary'
            }`}
          >
            {summary.netCashFlow >= 0 ? '+ ' : ''}
            {formatCurrency(summary.netCashFlow, 'SAR')}
          </div>
          <span className="metric-count text-caption-muted">
            إجمالي {summary.totalCount} عملية
          </span>
        </div>
      </div>

      {/* 6. Chronologically Grouped Transactions List or Empty State */}
      <div className="ledger-list-container">
        {totalDbTransactions === 0 ? (
          // Initial empty state when zero transactions exist in database
          <div className="surface-card ledger-empty-card" data-testid="ledger-initial-empty">
            <div className="empty-icon-wrap">
              <TransactionsIcon size={44} className="placeholder-icon" />
            </div>
            <h2 className="text-h3">لا توجد معاملات مسجلة بعد</h2>
            <p className="text-body color-secondary">
              سجلك المالي فارغ تماماً. ابدأ بإضافة أول مصروف أو دخل لبناء تقاريرك المالية الآمنة.
            </p>
            {onOpenQuickAdd && (
              <button
                type="button"
                className="btn-primary mt-4"
                onClick={onOpenQuickAdd}
              >
                <PlusIcon size={18} />
                <span>تسجيل أول معاملة</span>
              </button>
            )}
          </div>
        ) : filteredTransactions.length === 0 ? (
          // Filtered empty state when search/filter produces 0 results
          <div className="surface-card ledger-empty-card" data-testid="ledger-filter-empty">
            <div className="empty-icon-wrap">
              <SearchIcon size={44} className="placeholder-icon" />
            </div>
            <h2 className="text-h3">لم يتم العثور على أي نتائج</h2>
            <p className="text-body color-secondary">
              لا توجد أي معاملات تطابق معايير البحث أو التصفية الحالية.
            </p>
            <button
              type="button"
              className="btn-secondary mt-4"
              onClick={handleResetFilters}
            >
              <RotateCcwIcon size={16} />
              <span>إعادة تعيين كافة الفلاتر</span>
            </button>
          </div>
        ) : (
          // Grouped List
          groupedTransactions.map((group) => (
            <div key={group.date} className="ledger-date-group">
              {/* Group Header */}
              <div className="date-group-header">
                <div className="header-date-title">
                  <span className="group-title-text text-body-bold">{group.title}</span>
                  {!group.isToday && !group.isYesterday && group.dayName && (
                    <span className="group-day-badge text-caption">{group.dayName}</span>
                  )}
                  <span className="group-count-pill text-caption-muted">({group.count})</span>
                </div>
                <div className="header-group-subtotal text-caption tnum">
                  {group.totalExpense > 0 && (
                    <span className="subtotal-expense color-expense">
                      مصاريف: -{formatCurrency(group.totalExpense, 'SAR')}
                    </span>
                  )}
                  {group.totalIncome > 0 && (
                    <span className="subtotal-income color-income">
                      دخل: +{formatCurrency(group.totalIncome, 'SAR')}
                    </span>
                  )}
                </div>
              </div>

              {/* Transactions in group */}
              <div className="date-group-items surface-card" role="list">
                {group.transactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const isExpense = tx.type === 'expense';
                  const isTransfer = tx.type === 'transfer';

                  const sign = isIncome ? '+' : isExpense ? '-' : '↔';
                  const colorClass = isIncome ? 'color-income' : isExpense ? 'color-expense' : 'color-transfer';
                  const displayTitle = isTransfer
                    ? 'تحويل بين الحسابات'
                    : tx.notes && tx.notes.trim()
                    ? tx.notes
                    : tx.category?.name || 'بدون تصنيف';

                  return (
                    <div
                      key={tx.id}
                      className="tx-ledger-row"
                      role="listitem"
                      tabIndex={0}
                      onClick={() => setSelectedTx(tx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTx(tx);
                        }
                      }}
                      aria-label={`${displayTitle}، ${sign} ${formatCurrency(tx.amount, 'SAR')}`}
                    >
                      {/* Category Icon Badge */}
                      <div
                        className="tx-cat-icon-badge"
                        style={{
                          backgroundColor: isTransfer
                            ? 'var(--color-transfer-subtle)'
                            : tx.category?.color
                            ? `${tx.category.color}15`
                            : 'var(--color-bg-surface-subtle)',
                          color: isTransfer
                            ? 'var(--color-transfer)'
                            : tx.category?.color || 'var(--color-text-primary)'
                        }}
                      >
                        {isTransfer ? (
                          <TransferIcon size={20} />
                        ) : (
                          <CategoryIcon name={tx.category?.icon || 'more-horizontal'} size={20} />
                        )}
                      </div>

                      {/* Main Transaction Info */}
                      <div className="tx-main-col">
                        <div className="tx-title-row">
                          <span className="tx-title-text text-body-bold">{displayTitle}</span>
                        </div>

                        {/* Metadata row: Accounts, Category name if title was notes, and tags */}
                        <div className="tx-meta-row">
                          {isTransfer ? (
                            <span className="meta-account-pill">
                              <WalletIcon size={12} />
                              <span>{tx.account?.name || 'المصدر'}</span>
                              <span className="transfer-arrow-icon">←</span>
                              <span>{tx.destinationAccount?.name || 'الوجهة'}</span>
                            </span>
                          ) : (
                            <>
                              {tx.category?.name && tx.notes && tx.notes.trim() && (
                                <span className="meta-category-pill text-caption">
                                  {tx.category.name}
                                </span>
                              )}
                              <span className="meta-account-pill text-caption">
                                <WalletIcon size={12} />
                                <span>{tx.account?.name || 'الحساب'}</span>
                              </span>
                            </>
                          )}

                          {Array.isArray(tx.tags) && tx.tags.map((tag, idx) => (
                            <span key={idx} className="meta-tag-pill text-caption">
                              {`#${tag}`}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Amount & Actions Column */}
                      <div className="tx-amount-col">
                        <div className={`tx-amount-value tnum ${colorClass}`}>
                          <span>{sign} </span>
                          <span>{formatCurrency(tx.amount, 'SAR')}</span>
                        </div>

                        {/* Quick action buttons */}
                        <div className="tx-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="tx-action-btn edit-btn"
                            title="تعديل المعاملة"
                            onClick={() => setEditingTx(tx)}
                            aria-label={`تعديل معاملة ${displayTitle}`}
                          >
                            <EditIcon size={14} />
                          </button>
                          <button
                            type="button"
                            className="tx-action-btn delete-btn"
                            title="حذف المعاملة"
                            onClick={() => setDeletingTx(tx)}
                            aria-label={`حذف معاملة ${displayTitle}`}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 7. Advanced Filter Drawer */}
      <TransactionFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filters}
        onApplyFilters={setFilters}
        onResetFilters={handleResetFilters}
        categories={categories}
        accounts={accounts}
      />

      {/* 8. Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onEdit={(tx) => {
          setSelectedTx(null);
          setEditingTx(tx);
        }}
        onDelete={(tx) => {
          setSelectedTx(null);
          setDeletingTx(tx);
        }}
      />

      {/* 9. Transaction Edit Modal */}
      <TransactionEditModal
        transaction={editingTx}
        isOpen={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        onSave={handleSaveEdit}
        categories={categories}
        accounts={accounts}
      />

      {/* 10. Delete Confirmation Modal */}
      <TransactionDeleteConfirmModal
        transaction={deletingTx}
        isOpen={Boolean(deletingTx)}
        onClose={() => setDeletingTx(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* 11. Export Options Modal (F015) */}
      <TransactionExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filteredCount={filteredTransactions.length}
        totalCount={totalDbTransactions}
        onExportFiltered={handleExportFiltered}
        onExportAll={handleExportAll}
        isExporting={isExporting}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="ledger-toast-banner text-caption" role="status">
          <span>✓ {toastMessage}</span>
        </div>
      )}
    </div>
  );
}
