import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../db/db';
import {
  getCategories,
  createCategory,
  updateCategory,
  seedDefaultCategories
} from '../../services/category';
import { deleteCategoryWithGuard } from '../../services/categoryGuard';
import { CategoryCard } from './CategoryCard';
import { CategoryFormModal } from './CategoryFormModal';
import { CategoryDeleteModal } from './CategoryDeleteModal';
import {
  PlusIcon,
  SearchIcon,
  CloseIcon,
  CategoriesIcon
} from '../../components/common/Icons';
import './CategoriesView.css';

/**
 * Fetches categories and transaction counts pure helper
 */
async function fetchCategoriesData(database = db) {
  // Ensure deterministic categories are seeded if empty
  await seedDefaultCategories(database);

  const categories = await getCategories(database, { includeDeleted: false });

  // Calculate transaction counts for each category
  const counts = {};
  if (database.transactions) {
    const activeTxs = await database.transactions
      .filter((tx) => tx.deleted_at === null)
      .toArray();

    for (const tx of activeTxs) {
      if (tx.category_id) {
        counts[tx.category_id] = (counts[tx.category_id] || 0) + 1;
      }
    }
  }

  return { categories, usageMap: counts };
}

/**
 * CategoriesView — Unified Categories Management View (F013)
 * Implements full CRUD with transaction reassignment guard,
 * high-craft Arabic RTL layout, sliding tabs, and tactile transitions.
 * Conforms to /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better, and /transitions-dev.
 */
export function CategoriesView({
  database = db,
  initialCategories = null,
  initialUsageMap = null,
  refreshTrigger = 0,
  onCategoryMutated
}) {
  const [categories, setCategories] = useState(initialCategories || []);
  const [usageMap, setUsageMap] = useState(initialUsageMap || {});
  const [loading, setLoading] = useState(!initialCategories);

  // Filter & Navigation State
  const [activeTab, setActiveTab] = useState('expense'); // 'expense' | 'income'
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'default' | 'custom'
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(null);

  // Toast Feedback State
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    const timer = setTimeout(() => {
      setToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  const reloadCategories = useCallback(async () => {
    try {
      const data = await fetchCategoriesData(database);
      setCategories(data.categories);
      setUsageMap(data.usageMap);
    } catch (err) {
      console.error('Failed to reload categories:', err);
      showToast('تعذر تحديث التصنيفات', 'error');
    }
  }, [database, showToast]);

  useEffect(() => {
    let isCancelled = false;

    fetchCategoriesData(database)
      .then((data) => {
        if (!isCancelled) {
          setCategories(data.categories);
          setUsageMap(data.usageMap);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load categories:', err);
          showToast('تعذر تحميل التصنيفات', 'error');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [database, refreshTrigger, showToast]);

  // Handle Create / Edit Save
  const handleSaveCategory = async (formData) => {
    try {
      if (formData.id) {
        // Edit existing
        await updateCategory(formData.id, {
          name: formData.name,
          type: formData.type,
          icon: formData.icon,
          color: formData.color
        }, database);
        showToast('تم تحديث بيانات التصنيف بنجاح');
      } else {
        // Create new
        await createCategory({
          name: formData.name,
          type: formData.type,
          icon: formData.icon,
          color: formData.color,
          is_default: false
        }, database);
        showToast('تمت إضافة التصنيف المخصص بنجاح');
      }

      await reloadCategories();
      if (typeof onCategoryMutated === 'function') {
        onCategoryMutated();
      }
    } catch (err) {
      console.error('Error saving category:', err);
      throw err;
    }
  };

  // Handle Confirmed Deletion with Reassignment Guard
  const handleConfirmDelete = async ({ categoryId, reassignToCategoryId }) => {
    try {
      const result = await deleteCategoryWithGuard(
        { categoryId, reassignToCategoryId },
        database
      );

      if (result.reassignedCount > 0) {
        showToast(
          `تم حذف التصنيف وإعادة تعيين ${result.reassignedCount} معاملة بنجاح`
        );
      } else {
        showToast('تم حذف التصنيف بنجاح');
      }

      await reloadCategories();
      if (typeof onCategoryMutated === 'function') {
        onCategoryMutated();
      }
    } catch (err) {
      console.error('Error deleting category:', err);
      throw err;
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (cat) => {
    setEditingCategory(cat);
    setIsFormModalOpen(true);
  };

  // Open Delete Modal
  const handleOpenDeleteModal = (cat) => {
    setDeletingCategory(cat);
    setIsDeleteModalOpen(true);
  };

  // Filter Categories
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      // Type match
      if (cat.type !== activeTab) return false;

      // Scope match
      if (filterMode === 'default' && !cat.is_default) return false;
      if (filterMode === 'custom' && cat.is_default) return false;

      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = (cat.name || '').toLowerCase().includes(query);
        if (!matchesName) return false;
      }

      return true;
    });
  }, [categories, activeTab, filterMode, searchQuery]);

  // Metrics counters
  const metrics = useMemo(() => {
    const total = categories.length;
    const expenses = categories.filter((c) => c.type === 'expense').length;
    const incomes = categories.filter((c) => c.type === 'income').length;
    const customs = categories.filter((c) => !c.is_default).length;
    return { total, expenses, incomes, customs };
  }, [categories]);

  return (
    <div className="categories-management-view" data-testid="categories-management-view">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`cat-toast-banner ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}
          role="status"
          aria-live="polite"
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* View Header */}
      <div className="cat-view-header">
        <div className="cat-header-titles">
          <h2 className="cat-title">إدارة التصنيفات</h2>
          <p className="cat-subtitle">
            تنظيم وتخصيص تصنيفات المصاريف والدخل لتلائم نمط حياتك المالي
          </p>
        </div>

        <button
          type="button"
          className="cat-create-trigger-btn"
          onClick={handleOpenCreateModal}
          data-testid="create-category-btn"
        >
          <PlusIcon size={18} />
          <span>إضافة تصنيف مخصص</span>
        </button>
      </div>

      {/* Metrics Summary Strip */}
      <div className="cat-metrics-strip" aria-label="إحصائيات التصنيفات">
        <div className="cat-metric-item">
          <span className="cat-metric-label">إجمالي التصنيفات</span>
          <span className="cat-metric-value tabular-num">{metrics.total}</span>
        </div>
        <div className="cat-metric-item">
          <span className="cat-metric-label">تصنيفات المصاريف</span>
          <span className="cat-metric-value text-expense tabular-num">
            {metrics.expenses}
          </span>
        </div>
        <div className="cat-metric-item">
          <span className="cat-metric-label">تصنيفات الدخل</span>
          <span className="cat-metric-value text-income tabular-num">
            {metrics.incomes}
          </span>
        </div>
        <div className="cat-metric-item">
          <span className="cat-metric-label">تصنيفاتك المخصصة</span>
          <span className="cat-metric-value text-custom tabular-num">
            {metrics.customs}
          </span>
        </div>
      </div>

      {/* Controls: Sliding Tabs + Search & Scope Filters */}
      <div className="cat-controls-bar">
        {/* Type Segmented Sliding Tabs */}
        <div
          className="cat-type-tabs"
          role="tablist"
          aria-label="تبديل نوع التصنيف"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'expense'}
            className={`cat-tab-btn ${activeTab === 'expense' ? 'active expense' : ''}`}
            onClick={() => setActiveTab('expense')}
            data-testid="tab-expense-categories"
          >
            <span>تصنيفات المصاريف</span>
            <span className="cat-tab-badge tabular-num">{metrics.expenses}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'income'}
            className={`cat-tab-btn ${activeTab === 'income' ? 'active income' : ''}`}
            onClick={() => setActiveTab('income')}
            data-testid="tab-income-categories"
          >
            <span>تصنيفات الدخل</span>
            <span className="cat-tab-badge tabular-num">{metrics.incomes}</span>
          </button>
        </div>

        {/* Search & Scope Filters */}
        <div className="cat-filters-row">
          {/* Real-time Search Box */}
          <div className="cat-search-box">
            <SearchIcon size={18} className="cat-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="cat-search-input"
              placeholder={`البحث في تصنيفات ${activeTab === 'expense' ? 'المصاريف' : 'الدخل'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="بحث في التصنيفات"
            />
            {searchQuery && (
              <button
                type="button"
                className="cat-search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label="مسح نص البحث"
              >
                <CloseIcon size={16} />
              </button>
            )}
          </div>

          {/* Scope Pills */}
          <div className="cat-scope-pills" role="radiogroup" aria-label="تصفية نطاق التصنيفات">
            <button
              type="button"
              className={`cat-scope-pill ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              الكل
            </button>
            <button
              type="button"
              className={`cat-scope-pill ${filterMode === 'default' ? 'active' : ''}`}
              onClick={() => setFilterMode('default')}
            >
              الافتراضية
            </button>
            <button
              type="button"
              className={`cat-scope-pill ${filterMode === 'custom' ? 'active' : ''}`}
              onClick={() => setFilterMode('custom')}
            >
              المخصصة
            </button>
          </div>
        </div>
      </div>

      {/* Categories Grid or Empty State */}
      {loading ? (
        <div className="cat-loading-state" data-testid="cat-loading">
          <span className="cat-spinner" aria-hidden="true" />
          <p>جاري تحميل التصنيفات...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="cat-empty-state" data-testid="cat-empty-state">
          <CategoriesIcon size={44} className="cat-empty-icon" />
          <h3 className="cat-empty-title">لا توجد تصنيفات مطابقة</h3>
          <p className="cat-empty-desc">
            {searchQuery
              ? `لم نعثر على أي نتائج مطابقة لكلمة «${searchQuery}». يمكنك تعديل البحث أو إضافة تصنيف جديد.`
              : 'لم تتم إضافة أي تصنيفات بهذا النطاق بعد.'}
          </p>
          <div className="cat-empty-actions">
            {searchQuery && (
              <button
                type="button"
                className="cat-btn cat-btn-secondary"
                onClick={() => setSearchQuery('')}
              >
                إعادة ضبط البحث
              </button>
            )}
            <button
              type="button"
              className="cat-btn cat-btn-primary"
              onClick={handleOpenCreateModal}
            >
              <PlusIcon size={16} />
              <span>إضافة تصنيف مخصص الآن</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="cat-cards-grid" data-testid="cat-cards-grid">
          {filteredCategories.map((cat, idx) => (
            <CategoryCard
              key={cat.id || cat.slug || idx}
              category={cat}
              transactionCount={usageMap[cat.id] || 0}
              onEdit={handleOpenEditModal}
              onDelete={handleOpenDeleteModal}
            />
          ))}
        </div>
      )}

      {/* Form Modal (Create / Edit) */}
      <CategoryFormModal
        isOpen={isFormModalOpen}
        category={editingCategory}
        defaultType={activeTab}
        onSave={handleSaveCategory}
        onClose={() => setIsFormModalOpen(false)}
      />

      {/* Delete Guard Modal (Transaction Reassignment Protection) */}
      <CategoryDeleteModal
        isOpen={isDeleteModalOpen}
        category={deletingCategory}
        database={database}
        onConfirmDelete={handleConfirmDelete}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
