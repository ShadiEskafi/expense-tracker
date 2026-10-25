import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import { CategoriesView } from './CategoriesView.jsx';
import { CategoryCard } from './CategoryCard.jsx';
import { CategoryFormModal } from './CategoryFormModal.jsx';
import { CategoryDeleteModal } from './CategoryDeleteModal.jsx';
import { seedDefaultCategories, DEFAULT_CATEGORIES } from '../../services/category.js';

describe('Categories Management View Component Tests (F013)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`cat_view_test_${Date.now()}_${Math.random()}`);
    await testDb.open();
    await seedDefaultCategories(testDb, null);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. CategoriesView Layout & Header Shell', () => {
    it('renders the view title, subtitle, and create category action button', () => {
      const html = renderToString(
        <CategoriesView
          database={testDb}
          initialCategories={DEFAULT_CATEGORIES}
          initialUsageMap={{}}
        />
      );

      expect(html).toContain('إدارة التصنيفات');
      expect(html).toContain('تنظيم وتخصيص تصنيفات المصاريف والدخل لتلائم نمط حياتك المالي');
      expect(html).toContain('إضافة تصنيف مخصص');
    });

    it('renders the 4 metric counter cards with formatted numbers and labels', () => {
      const html = renderToString(
        <CategoriesView
          database={testDb}
          initialCategories={DEFAULT_CATEGORIES}
          initialUsageMap={{}}
        />
      );

      expect(html).toContain('إجمالي التصنيفات');
      expect(html).toContain('تصنيفات المصاريف');
      expect(html).toContain('تصنيفات الدخل');
      expect(html).toContain('تصنيفاتك المخصصة');

      // 16 total, 10 expenses, 6 incomes, 0 customs
      expect(html).toContain('16');
      expect(html).toContain('10');
      expect(html).toContain('6');
      expect(html).toContain('0');
    });

    it('renders sliding tabs for switching between Expense and Income categories', () => {
      const html = renderToString(
        <CategoriesView
          database={testDb}
          initialCategories={DEFAULT_CATEGORIES}
          initialUsageMap={{}}
        />
      );

      expect(html).toContain('تصنيفات المصاريف');
      expect(html).toContain('تصنيفات الدخل');
    });

    it('renders the search box and scope filter pills (الكل, الافتراضية, المخصصة)', () => {
      const html = renderToString(
        <CategoriesView
          database={testDb}
          initialCategories={DEFAULT_CATEGORIES}
          initialUsageMap={{}}
        />
      );

      expect(html).toContain('البحث في تصنيفات المصاريف...');
      expect(html).toContain('الكل');
      expect(html).toContain('الافتراضية');
      expect(html).toContain('المخصصة');
    });
  });

  describe('2. CategoryCard Component Rendering', () => {
    it('renders an expense default category card with name, default badge, and usage count', () => {
      const foodCat = DEFAULT_CATEGORIES.find((c) => c.slug === 'cat_food');
      const html = renderToString(
        <CategoryCard
          category={foodCat}
          transactionCount={14}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(html).toContain('طعام ومطاعم');
      expect(html).toContain('افتراضي');
      expect(html).toContain('14');
      expect(html).toContain('معاملات مسجلة');
      expect(html).toContain('تعديل');
      expect(html).toContain('حذف');
    });

    it('renders a custom category card with custom badge and singular transaction count', () => {
      const customCat = {
        id: 'cust-1',
        name: 'اشتراكات سحابية',
        type: 'expense',
        icon: 'tag',
        color: '#8B5CF6',
        is_default: false
      };

      const html = renderToString(
        <CategoryCard
          category={customCat}
          transactionCount={1}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(html).toContain('اشتراكات سحابية');
      expect(html).toContain('مخصص');
      expect(html).toContain('1');
      expect(html).toContain('معاملة مسجلة');
    });
  });

  describe('3. CategoryFormModal (Create & Edit Mode)', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToString(
        <CategoryFormModal
          isOpen={false}
          onSave={async () => {}}
          onClose={() => {}}
        />
      );

      expect(html).toBe('');
    });

    it('renders modal in Create mode with type selector, name input, icon grid, and color palette', () => {
      const html = renderToString(
        <CategoryFormModal
          isOpen={true}
          category={null}
          defaultType="expense"
          onSave={async () => {}}
          onClose={() => {}}
        />
      );

      expect(html).toContain('إضافة تصنيف جديد');
      expect(html).toContain('نوع التصنيف');
      expect(html).toContain('مصروف');
      expect(html).toContain('دخل');
      expect(html).toContain('اسم التصنيف');
      expect(html).toContain('معاينة بطاقة التصنيف');
      expect(html).toContain('اختر الأيقونة');
      expect(html).toContain('اختر اللون الدلالي');
      expect(html).toContain('إلغاء');
      expect(html).toContain('إضافة التصنيف');
    });

    it('renders modal in Edit mode with pre-filled category title and save button', () => {
      const existingCat = {
        id: 'cat-edit-1',
        name: 'تسوق إلكتروني',
        type: 'expense',
        icon: 'shopping-bag',
        color: '#EC4899',
        is_default: false
      };

      const html = renderToString(
        <CategoryFormModal
          isOpen={true}
          category={existingCat}
          defaultType="expense"
          onSave={async () => {}}
          onClose={() => {}}
        />
      );

      expect(html).toContain('تعديل التصنيف');
      expect(html).toContain('تسوق إلكتروني');
      expect(html).toContain('حفظ التعديلات');
    });
  });

  describe('4. CategoryDeleteModal (Guard & Reassignment UI)', () => {
    it('renders nothing when isOpen is false', () => {
      const html = renderToString(
        <CategoryDeleteModal
          isOpen={false}
          category={null}
          onConfirmDelete={async () => {}}
          onClose={() => {}}
        />
      );

      expect(html).toBe('');
    });

    it('renders delete modal header with category name and danger title', () => {
      const targetCat = {
        id: 'target-cat',
        name: 'فواتير الهاتف',
        type: 'expense',
        icon: 'home',
        color: '#6366F1'
      };

      const html = renderToString(
        <CategoryDeleteModal
          isOpen={true}
          category={targetCat}
          onConfirmDelete={async () => {}}
          onClose={() => {}}
        />
      );

      expect(html).toContain('حذف التصنيف');
      expect(html).toContain('فواتير الهاتف');
      expect(html).toContain('إلغاء');
    });
  });

  describe('5. Empty State Rendering', () => {
    it('renders empty state when initialCategories is empty', () => {
      const html = renderToString(
        <CategoriesView
          database={testDb}
          initialCategories={[]}
          initialUsageMap={{}}
        />
      );

      expect(html).toContain('لا توجد تصنيفات مطابقة');
      expect(html).toContain('إضافة تصنيف مخصص الآن');
    });
  });
});
