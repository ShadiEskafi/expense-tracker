import { db } from '../db/db.js';
import {
  CategoryInUseError,
  deleteCategory,
  reassignTransactionsCategory,
  getCategoryById
} from './category.js';

export { CategoryInUseError };

/**
 * Checks if a category is currently in use by any non-deleted transactions.
 *
 * @param {string} categoryId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{ inUse: boolean, transactionCount: number }>}
 */
export async function getCategoryUsage(categoryId, database = db) {
  if (!categoryId) {
    throw new Error('معرف التصنيف مطلوب لفحص الاستخدام');
  }

  if (!database.transactions) {
    return { inUse: false, transactionCount: 0 };
  }

  const transactionCount = await database.transactions
    .where('category_id')
    .equals(categoryId)
    .filter((tx) => tx.deleted_at === null)
    .count();

  return {
    inUse: transactionCount > 0,
    transactionCount
  };
}

/**
 * Determines whether a category can be safely deleted without data loss.
 *
 * @param {string} categoryId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{ canDelete: boolean, transactionCount: number, reason?: string }>}
 */
export async function canDeleteCategory(categoryId, database = db) {
  const category = await getCategoryById(categoryId, database);
  if (!category || category.deleted_at !== null) {
    return {
      canDelete: false,
      transactionCount: 0,
      reason: 'التصنيف غير موجود أو محذوف مسبقاً'
    };
  }

  const { inUse, transactionCount } = await getCategoryUsage(categoryId, database);

  if (inUse) {
    return {
      canDelete: false,
      transactionCount,
      reason: `التصنيف مرتبط بـ ${transactionCount} معاملة نشطة ويحتاج لإعادة تعيين المعاملات قبل الحذف`
    };
  }

  return {
    canDelete: true,
    transactionCount: 0
  };
}

/**
 * Returns available active categories of the same type suitable for transaction reassignment,
 * excluding the category being deleted.
 *
 * @param {string} categoryId - The category to exclude
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<Array<object>>}
 */
export async function getReassignmentCandidates(categoryId, database = db, userId = null) {
  if (!categoryId) {
    throw new Error('معرف التصنيف مطلوب لاسترجاع بدائل إعادة التعيين');
  }

  const sourceCategory = await getCategoryById(categoryId, database);
  if (!sourceCategory) {
    throw new Error(`التصنيف ذو المعرف "${categoryId}" غير موجود`);
  }

  const candidates = await database.categories
    .filter(
      (cat) =>
        cat.id !== categoryId &&
        cat.type === sourceCategory.type &&
        (cat.user_id || null) === (userId || null) &&
        cat.deleted_at === null
    )
    .toArray();

  return candidates;
}

/**
 * Safely deletes a category. If the category has active transactions and a replacement
 * target category is provided, all transactions are atomically reassigned before deletion.
 * If active transactions exist and no replacement is provided without force=true,
 * throws CategoryInUseError.
 *
 * @param {object} params
 * @param {string} params.categoryId
 * @param {string|null} [params.reassignToCategoryId=null]
 * @param {boolean} [params.force=false]
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{ success: boolean, deletedCategory: object, reassignedCount: number }>}
 */
export async function deleteCategoryWithGuard(
  { categoryId, reassignToCategoryId = null, force = false },
  database = db
) {
  if (!categoryId) {
    throw new Error('معرف التصنيف مطلوب للحذف الآمن');
  }

  const sourceCategory = await getCategoryById(categoryId, database);
  if (!sourceCategory || sourceCategory.deleted_at !== null) {
    throw new Error(`التصنيف ذو المعرف "${categoryId}" غير موجود أو محذوف مسبقاً`);
  }

  let reassignedCount = 0;

  // Case 1: Reassignment target provided
  if (reassignToCategoryId) {
    if (reassignToCategoryId === categoryId) {
      throw new Error('لا يمكن إعادة تعيين المعاملات إلى نفس التصنيف المراد حذفه');
    }

    const targetCategory = await getCategoryById(reassignToCategoryId, database);
    if (!targetCategory || targetCategory.deleted_at !== null) {
      throw new Error('التصنيف البديل غير موجود أو محذوف مسبقاً');
    }

    if (targetCategory.type !== sourceCategory.type) {
      throw new Error('نوع التصنيف البديل يجب أن يطابق نوع التصنيف المراد حذفه (مصروف أو دخل)');
    }

    // Execute atomic reassignment within a database transaction
    await database.transaction('rw', [database.transactions, database.categories], async () => {
      reassignedCount = await reassignTransactionsCategory(
        categoryId,
        reassignToCategoryId,
        database
      );

      // Now delete the source category safely
      await deleteCategory(categoryId, database, { force: true });
    });

    const deletedRecord = await getCategoryById(categoryId, database);
    return {
      success: true,
      deletedCategory: deletedRecord,
      reassignedCount
    };
  }

  // Case 2: No reassignment target provided
  const { inUse, transactionCount } = await getCategoryUsage(categoryId, database);

  if (inUse && !force) {
    throw new CategoryInUseError(
      `لا يمكن حذف التصنيف لوجود ${transactionCount} معاملة مرتبطة به. يرجى نقل المعاملات إلى تصنيف آخر أولاً.`,
      transactionCount
    );
  }

  const deletedRecord = await deleteCategory(categoryId, database, { force: true });

  return {
    success: true,
    deletedCategory: deletedRecord,
    reassignedCount: 0
  };
}
