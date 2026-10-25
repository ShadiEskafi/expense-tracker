import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import {
  seedDefaultCategories,
  createCategory
} from './category.js';
import {
  getCategoryUsage,
  canDeleteCategory,
  getReassignmentCandidates,
  deleteCategoryWithGuard,
  CategoryInUseError
} from './categoryGuard.js';

describe('Category Deletion Guard & Reassignment Engine (F013)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`test-catguard-db-${Date.now()}-${Math.random()}`);
    await seedDefaultCategories(testDb);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. Category Usage Inspection', () => {
    it('reports inUse=false and transactionCount=0 for unreferenced categories', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      expect(foodCat).toBeDefined();

      const usage = await getCategoryUsage(foodCat.id, testDb);
      expect(usage.inUse).toBe(false);
      expect(usage.transactionCount).toBe(0);
    });

    it('reports inUse=true and correct transactionCount when active transactions exist', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      await testDb.accounts.add({
        id: 'acc-1',
        name: 'كاش',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 0,
        current_balance: 0,
        is_default: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 1
      });

      // Add two active transactions referencing foodCat
      await testDb.transactions.bulkAdd([
        {
          id: 'tx-1',
          type: 'expense',
          amount: 5000,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        },
        {
          id: 'tx-2',
          type: 'expense',
          amount: 3000,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        },
        // A soft-deleted transaction referencing foodCat
        {
          id: 'tx-3',
          type: 'expense',
          amount: 2000,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: new Date().toISOString(),
          sync_version: 2
        }
      ]);

      const usage = await getCategoryUsage(foodCat.id, testDb);
      expect(usage.inUse).toBe(true);
      expect(usage.transactionCount).toBe(2); // Only non-deleted transactions counted
    });

    it('throws when categoryId is omitted', async () => {
      await expect(getCategoryUsage('', testDb)).rejects.toThrow('معرف التصنيف مطلوب');
    });
  });

  describe('2. canDeleteCategory Checks', () => {
    it('returns canDelete: true for an unreferenced category', async () => {
      const groceriesCat = await testDb.categories.where('slug').equals('cat_groceries').first();
      const status = await canDeleteCategory(groceriesCat.id, testDb);

      expect(status.canDelete).toBe(true);
      expect(status.transactionCount).toBe(0);
    });

    it('returns canDelete: false with transaction count and reason for an in-use category', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      await testDb.transactions.add({
        id: 'tx-food',
        type: 'expense',
        amount: 4500,
        currency: 'SAR',
        account_id: 'acc-1',
        category_id: foodCat.id,
        date: '2026-10-25',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 1
      });

      const status = await canDeleteCategory(foodCat.id, testDb);
      expect(status.canDelete).toBe(false);
      expect(status.transactionCount).toBe(1);
      expect(status.reason).toContain('معاملة نشطة');
    });

    it('returns canDelete: false for non-existent category', async () => {
      const status = await canDeleteCategory('non-existent-id', testDb);
      expect(status.canDelete).toBe(false);
      expect(status.reason).toContain('غير موجود');
    });
  });

  describe('3. Reassignment Candidates Discovery', () => {
    it('retrieves candidate categories of the same type excluding the source category', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      const candidates = await getReassignmentCandidates(foodCat.id, testDb);

      // Should be 9 other default expense categories
      expect(candidates.length).toBe(9);
      expect(candidates.every((c) => c.type === 'expense')).toBe(true);
      expect(candidates.some((c) => c.id === foodCat.id)).toBe(false);
    });

    it('excludes soft-deleted categories from reassignment candidates', async () => {
      const groceriesCat = await testDb.categories.where('slug').equals('cat_groceries').first();
      await testDb.categories.update(groceriesCat.id, { deleted_at: new Date().toISOString() });

      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      const candidates = await getReassignmentCandidates(foodCat.id, testDb);

      expect(candidates.some((c) => c.id === groceriesCat.id)).toBe(false);
    });

    it('throws if source category does not exist', async () => {
      await expect(getReassignmentCandidates('unknown-id', testDb)).rejects.toThrow('غير موجود');
    });
  });

  describe('4. deleteCategoryWithGuard Operation', () => {
    it('deletes an unreferenced category cleanly without error', async () => {
      const customCat = await createCategory(
        {
          name: 'اشتراكات شهرية',
          type: 'expense',
          icon: 'tag',
          color: '#6366F1'
        },
        testDb
      );

      const result = await deleteCategoryWithGuard({ categoryId: customCat.id }, testDb);
      expect(result.success).toBe(true);
      expect(result.reassignedCount).toBe(0);
      expect(result.deletedCategory.deleted_at).toBeTruthy();

      const inDb = await testDb.categories.get(customCat.id);
      expect(inDb.deleted_at).toBeTruthy();
    });

    it('blocks deletion and throws CategoryInUseError when category has active transactions and no reassignment target', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      await testDb.transactions.add({
        id: 'tx-block',
        type: 'expense',
        amount: 2500,
        currency: 'SAR',
        account_id: 'acc-1',
        category_id: foodCat.id,
        date: '2026-10-25',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 1
      });

      await expect(
        deleteCategoryWithGuard({ categoryId: foodCat.id }, testDb)
      ).rejects.toThrow(CategoryInUseError);

      // Verify category was NOT deleted
      const inDb = await testDb.categories.get(foodCat.id);
      expect(inDb.deleted_at).toBeNull();
    });

    it('allows forced deletion when force: true is specified even if referenced', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      await testDb.transactions.add({
        id: 'tx-force',
        type: 'expense',
        amount: 2500,
        currency: 'SAR',
        account_id: 'acc-1',
        category_id: foodCat.id,
        date: '2026-10-25',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 1
      });

      const result = await deleteCategoryWithGuard(
        { categoryId: foodCat.id, force: true },
        testDb
      );
      expect(result.success).toBe(true);
      expect(result.deletedCategory.deleted_at).toBeTruthy();
    });

    it('atomically reassigns transactions to target category and soft-deletes source category', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      const groceriesCat = await testDb.categories.where('slug').equals('cat_groceries').first();

      // Add 3 transactions to foodCat
      await testDb.transactions.bulkAdd([
        {
          id: 'tx-re-1',
          type: 'expense',
          amount: 1500,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        },
        {
          id: 'tx-re-2',
          type: 'expense',
          amount: 2500,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        },
        {
          id: 'tx-re-3',
          type: 'expense',
          amount: 3500,
          currency: 'SAR',
          account_id: 'acc-1',
          category_id: foodCat.id,
          date: '2026-10-25',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sync_version: 1
        }
      ]);

      const result = await deleteCategoryWithGuard(
        {
          categoryId: foodCat.id,
          reassignToCategoryId: groceriesCat.id
        },
        testDb
      );

      expect(result.success).toBe(true);
      expect(result.reassignedCount).toBe(3);
      expect(result.deletedCategory.deleted_at).toBeTruthy();

      // Verify all transactions now point to groceriesCat
      const tx1 = await testDb.transactions.get('tx-re-1');
      const tx2 = await testDb.transactions.get('tx-re-2');
      const tx3 = await testDb.transactions.get('tx-re-3');

      expect(tx1.category_id).toBe(groceriesCat.id);
      expect(tx2.category_id).toBe(groceriesCat.id);
      expect(tx3.category_id).toBe(groceriesCat.id);

      // Verify source category has zero active transactions
      const remainingUsage = await getCategoryUsage(foodCat.id, testDb);
      expect(remainingUsage.transactionCount).toBe(0);

      // Verify target category has all 3
      const targetUsage = await getCategoryUsage(groceriesCat.id, testDb);
      expect(targetUsage.transactionCount).toBe(3);
    });

    it('rejects reassignment to the same category', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      await expect(
        deleteCategoryWithGuard(
          {
            categoryId: foodCat.id,
            reassignToCategoryId: foodCat.id
          },
          testDb
        )
      ).rejects.toThrow('لا يمكن إعادة تعيين المعاملات إلى نفس التصنيف');
    });

    it('rejects reassignment to a category with mismatched type (e.g. expense -> income)', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first(); // expense
      const salaryCat = await testDb.categories.where('slug').equals('cat_salary').first(); // income

      await expect(
        deleteCategoryWithGuard(
          {
            categoryId: foodCat.id,
            reassignToCategoryId: salaryCat.id
          },
          testDb
        )
      ).rejects.toThrow('يجب أن يطابق نوع التصنيف');
    });

    it('rejects reassignment to a soft-deleted category', async () => {
      const foodCat = await testDb.categories.where('slug').equals('cat_food').first();
      const groceriesCat = await testDb.categories.where('slug').equals('cat_groceries').first();
      await testDb.categories.update(groceriesCat.id, { deleted_at: new Date().toISOString() });

      await expect(
        deleteCategoryWithGuard(
          {
            categoryId: foodCat.id,
            reassignToCategoryId: groceriesCat.id
          },
          testDb
        )
      ).rejects.toThrow('التصنيف البديل غير موجود أو محذوف');
    });
  });
});
