import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  seedDefaultCategories,
  isCategoriesSeeded,
  getCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  reassignTransactionsCategory,
  generateUUID,
  CategoryInUseError
} from './category.js';

describe('Deterministic Category Pre-seeding & Service (F003)', () => {
  let testDb;

  beforeEach(() => {
    testDb = new ExpenseDatabase(`test-cat-db-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. Default Category Specification Constants', () => {
    it('defines exactly 16 deterministic default categories (10 expense, 6 income)', () => {
      expect(DEFAULT_CATEGORIES).toHaveLength(16);
      expect(DEFAULT_EXPENSE_CATEGORIES).toHaveLength(10);
      expect(DEFAULT_INCOME_CATEGORIES).toHaveLength(6);
    });

    it('ensures all 16 slugs are unique and follow cat_* naming convention', () => {
      const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(16);

      for (const slug of slugs) {
        expect(slug).toMatch(/^cat_[a-z_]+$/);
      }
    });

    it('contains all 10 standard expense categories with Arabic names and color tokens', () => {
      const expenseSlugs = DEFAULT_EXPENSE_CATEGORIES.map((c) => c.slug);
      expect(expenseSlugs).toEqual([
        'cat_food',
        'cat_groceries',
        'cat_transport',
        'cat_housing',
        'cat_health',
        'cat_shopping',
        'cat_entertainment',
        'cat_education',
        'cat_personal',
        'cat_misc'
      ]);

      const food = DEFAULT_CATEGORIES.find((c) => c.slug === 'cat_food');
      expect(food).toMatchObject({
        name: 'طعام ومطاعم',
        type: 'expense',
        icon: 'utensils',
        color: '#F97316',
        badge_bg_light: '#FFEDD5',
        is_default: true
      });
    });

    it('contains all 6 standard income categories with Arabic names and color tokens', () => {
      const incomeSlugs = DEFAULT_INCOME_CATEGORIES.map((c) => c.slug);
      expect(incomeSlugs).toEqual([
        'cat_salary',
        'cat_freelance',
        'cat_business',
        'cat_investments',
        'cat_gifts',
        'cat_other_income'
      ]);

      const salary = DEFAULT_CATEGORIES.find((c) => c.slug === 'cat_salary');
      expect(salary).toMatchObject({
        name: 'راتب شهري',
        type: 'income',
        icon: 'banknote',
        color: '#059669',
        badge_bg_light: '#D1FAE5',
        is_default: true
      });
    });
  });

  describe('2. Idempotent Deterministic Pre-seeding', () => {
    it('seeds all 16 categories into an empty database in guest mode', async () => {
      expect(await isCategoriesSeeded(testDb)).toBe(false);

      const seeded = await seedDefaultCategories(testDb);
      expect(seeded).toHaveLength(16);

      const count = await testDb.categories.count();
      expect(count).toBe(16);

      expect(await isCategoriesSeeded(testDb)).toBe(true);

      // Verify records in IndexedDB
      const food = await testDb.categories.where('slug').equals('cat_food').first();
      expect(food).toBeDefined();
      expect(food.name).toBe('طعام ومطاعم');
      expect(food.user_id).toBeNull();
      expect(food.is_default).toBe(true);
      expect(food.deleted_at).toBeNull();
      expect(food.sync_version).toBe(1);
      expect(food.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('is strictly idempotent: repeated calls do not duplicate records', async () => {
      await seedDefaultCategories(testDb);
      expect(await testDb.categories.count()).toBe(16);

      // Second call
      const secondRun = await seedDefaultCategories(testDb);
      expect(secondRun).toHaveLength(16);
      expect(await testDb.categories.count()).toBe(16);

      // Third call
      await seedDefaultCategories(testDb);
      expect(await testDb.categories.count()).toBe(16);
    });

    it('seeds only missing categories if partial set already exists', async () => {
      // Manually pre-seed 2 categories
      await testDb.categories.bulkAdd([
        {
          id: 'manual-1',
          user_id: null,
          slug: 'cat_food',
          name: 'طعام ومطاعم معدل',
          type: 'expense',
          icon: 'utensils',
          color: '#F97316',
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        },
        {
          id: 'manual-2',
          user_id: null,
          slug: 'cat_salary',
          name: 'راتبي',
          type: 'income',
          icon: 'banknote',
          color: '#059669',
          is_default: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        }
      ]);

      expect(await testDb.categories.count()).toBe(2);

      // Now run seeder
      const result = await seedDefaultCategories(testDb);
      expect(result).toHaveLength(16);
      expect(await testDb.categories.count()).toBe(16);

      // Verify the original manually inserted ones were preserved
      const existingFood = await testDb.categories.get('manual-1');
      expect(existingFood.name).toBe('طعام ومطاعم معدل');
    });

    it('isolates seeded categories by userId for multi-user / cloud contexts', async () => {
      const guestCategories = await seedDefaultCategories(testDb, null);
      const userCategories = await seedDefaultCategories(testDb, 'usr-uuid-123');

      expect(guestCategories).toHaveLength(16);
      expect(userCategories).toHaveLength(16);
      expect(await testDb.categories.count()).toBe(32);

      const guestFood = await getCategoryBySlug('cat_food', testDb, null);
      const userFood = await getCategoryBySlug('cat_food', testDb, 'usr-uuid-123');

      expect(guestFood.user_id).toBeNull();
      expect(userFood.user_id).toBe('usr-uuid-123');
      expect(guestFood.id).not.toBe(userFood.id);
    });
  });

  describe('3. Querying & Filtering Categories', () => {
    beforeEach(async () => {
      await seedDefaultCategories(testDb);
    });

    it('filters categories by type (expense vs income)', async () => {
      const expenses = await getCategories(testDb, { type: 'expense' });
      const incomes = await getCategories(testDb, { type: 'income' });

      expect(expenses).toHaveLength(10);
      expect(incomes).toHaveLength(6);

      expect(expenses.every((c) => c.type === 'expense')).toBe(true);
      expect(incomes.every((c) => c.type === 'income')).toBe(true);
    });

    it('excludes soft-deleted categories by default, includes when includeDeleted=true', async () => {
      const groceries = await getCategoryBySlug('cat_groceries', testDb);
      await deleteCategory(groceries.id, testDb);

      const activeExpenses = await getCategories(testDb, { type: 'expense' });
      expect(activeExpenses).toHaveLength(9);

      const allExpenses = await getCategories(testDb, { type: 'expense', includeDeleted: true });
      expect(allExpenses).toHaveLength(10);
    });

    it('retrieves category by ID or returns null if not found', async () => {
      const food = await getCategoryBySlug('cat_food', testDb);
      const found = await getCategoryById(food.id, testDb);
      expect(found).toBeDefined();
      expect(found.slug).toBe('cat_food');

      const nonExistent = await getCategoryById('non-existent-id', testDb);
      expect(nonExistent).toBeNull();
    });
  });

  describe('4. Custom Category CRUD & Invariants', () => {
    it('creates custom category with is_default=false, null slug, and valid UUID', async () => {
      const custom = await createCategory(
        {
          name: 'اشتراكات وخدمات رقمية',
          type: 'expense',
          icon: 'tv',
          color: '#8B5CF6'
        },
        testDb
      );

      expect(custom.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(custom.slug).toBeNull();
      expect(custom.is_default).toBe(false);
      expect(custom.name).toBe('اشتراكات وخدمات رقمية');
      expect(custom.deleted_at).toBeNull();
      expect(custom.sync_version).toBe(1);

      const retrieved = await getCategoryById(custom.id, testDb);
      expect(retrieved.name).toBe('اشتراكات وخدمات رقمية');
    });

    it('validates name and type when creating custom categories', async () => {
      await expect(
        createCategory({ name: '', type: 'expense' }, testDb)
      ).rejects.toThrow('اسم التصنيف مطلوب');

      await expect(
        createCategory({ name: 'تجربة', type: 'transfer' }, testDb)
      ).rejects.toThrow("نوع التصنيف يجب أن يكون 'expense' أو 'income'");
    });

    it('updates category properties, bumps sync_version, and updates timestamp', async () => {
      const custom = await createCategory(
        {
          name: 'صيانة السيارة',
          type: 'expense',
          icon: 'wrench',
          color: '#EF4444'
        },
        testDb
      );

      const updated = await updateCategory(
        custom.id,
        {
          name: 'صيانة دورية للمركبة',
          color: '#DC2626'
        },
        testDb
      );

      expect(updated.name).toBe('صيانة دورية للمركبة');
      expect(updated.color).toBe('#DC2626');
      expect(updated.icon).toBe('wrench'); // Preserved
      expect(updated.sync_version).toBe(2);
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(custom.created_at).getTime()
      );
    });

    it('fails when updating non-existent category or providing empty name', async () => {
      await expect(
        updateCategory('unknown-id', { name: 'فحص' }, testDb)
      ).rejects.toThrow('غير موجود');

      const custom = await createCategory({ name: 'تجربة', type: 'expense' }, testDb);
      await expect(
        updateCategory(custom.id, { name: '   ' }, testDb)
      ).rejects.toThrow('لا يمكن أن يكون فارغاً');
    });
  });

  describe('5. Soft Deletion Safety & Transaction Reassignment', () => {
    it('soft-deletes category without active transactions', async () => {
      const custom = await createCategory({ name: 'مؤقت', type: 'expense' }, testDb);
      const deleted = await deleteCategory(custom.id, testDb);

      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.sync_version).toBe(2);

      // Still in DB table (not hard deleted)
      const raw = await testDb.categories.get(custom.id);
      expect(raw).toBeDefined();
      expect(raw.deleted_at).toBe(deleted.deleted_at);

      // Filtered out of standard queries
      const active = await getCategories(testDb);
      expect(active.find((c) => c.id === custom.id)).toBeUndefined();
    });

    it('prevents deletion if active transactions reference the category (CategoryInUseError)', async () => {
      const custom = await createCategory({ name: 'فواتير الاتصالات', type: 'expense' }, testDb);

      // Add a non-deleted transaction referencing this category
      await testDb.transactions.add({
        id: 'tx-test-1',
        category_id: custom.id,
        account_id: 'acc-1',
        amount: 15000,
        type: 'expense',
        date: '2026-10-24',
        deleted_at: null,
        sync_version: 1
      });

      // Attempting standard deletion should throw CategoryInUseError
      await expect(deleteCategory(custom.id, testDb)).rejects.toThrowError(CategoryInUseError);

      try {
        await deleteCategory(custom.id, testDb);
      } catch (err) {
        expect(err).toBeInstanceOf(CategoryInUseError);
        expect(err.code).toBe('CATEGORY_IN_USE');
        expect(err.transactionCount).toBe(1);
      }

      // Allows force deletion if explicitly specified
      const forceDeleted = await deleteCategory(custom.id, testDb, { force: true });
      expect(forceDeleted.deleted_at).not.toBeNull();
    });

    it('reassigns transactions from one category to another before deletion', async () => {
      const sourceCategory = await createCategory({ name: 'مصروف قديم', type: 'expense' }, testDb);
      const targetCategory = await createCategory({ name: 'مصروف جديد', type: 'expense' }, testDb);

      await testDb.transactions.bulkAdd([
        {
          id: 'tx-1',
          category_id: sourceCategory.id,
          amount: 5000,
          type: 'expense',
          date: '2026-10-24',
          deleted_at: null,
          sync_version: 1
        },
        {
          id: 'tx-2',
          category_id: sourceCategory.id,
          amount: 7500,
          type: 'expense',
          date: '2026-10-24',
          deleted_at: null,
          sync_version: 1
        }
      ]);

      const reassignedCount = await reassignTransactionsCategory(
        sourceCategory.id,
        targetCategory.id,
        testDb
      );
      expect(reassignedCount).toBe(2);

      // Now source category has 0 transactions and can be safely deleted
      const deletedSource = await deleteCategory(sourceCategory.id, testDb);
      expect(deletedSource.deleted_at).not.toBeNull();

      // Transactions now point to targetCategory
      const tx1 = await testDb.transactions.get('tx-1');
      const tx2 = await testDb.transactions.get('tx-2');
      expect(tx1.category_id).toBe(targetCategory.id);
      expect(tx2.category_id).toBe(targetCategory.id);
      expect(tx1.sync_version).toBe(2);
    });
  });

  describe('6. Utility Functions', () => {
    it('generates valid RFC4122 v4 UUID format', () => {
      const id = generateUUID();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});
