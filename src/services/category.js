import { db } from '../db/db.js';

/**
 * Custom error thrown when attempting to delete a category that has active transactions
 */
export class CategoryInUseError extends Error {
  constructor(message, transactionCount) {
    super(message);
    this.name = 'CategoryInUseError';
    this.code = 'CATEGORY_IN_USE';
    this.transactionCount = transactionCount;
  }
}

/**
 * RFC4122 v4 UUID generator with fallback
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministic default categories defined in Frozen Specification (project-summary.md v1.0)
 * and Design System (design-system/colors.md).
 *
 * Slugs remain fixed across devices and sync operations to prevent duplicate categories on first login.
 */
export const DEFAULT_CATEGORIES = Object.freeze([
  // --- 10 Expense Categories ---
  {
    slug: 'cat_food',
    name: 'طعام ومطاعم',
    type: 'expense',
    icon: 'utensils',
    color: '#F97316',
    badge_bg_light: '#FFEDD5',
    badge_bg_dark: 'rgba(249,115,22,0.18)',
    is_default: true
  },
  {
    slug: 'cat_groceries',
    name: 'بقالة وسوبرماركت',
    type: 'expense',
    icon: 'shopping-cart',
    color: '#10B981',
    badge_bg_light: '#D1FAE5',
    badge_bg_dark: 'rgba(16,185,129,0.18)',
    is_default: true
  },
  {
    slug: 'cat_transport',
    name: 'مواصلات وتنقل',
    type: 'expense',
    icon: 'car',
    color: '#0284C7',
    badge_bg_light: '#E0F2FE',
    badge_bg_dark: 'rgba(2,132,199,0.18)',
    is_default: true
  },
  {
    slug: 'cat_housing',
    name: 'سكن وفواتير',
    type: 'expense',
    icon: 'home',
    color: '#6366F1',
    badge_bg_light: '#E0E7FF',
    badge_bg_dark: 'rgba(99,102,241,0.18)',
    is_default: true
  },
  {
    slug: 'cat_health',
    name: 'صحة وعناية',
    type: 'expense',
    icon: 'heart-pulse',
    color: '#14B8A6',
    badge_bg_light: '#CCFBF1',
    badge_bg_dark: 'rgba(20,184,166,0.18)',
    is_default: true
  },
  {
    slug: 'cat_shopping',
    name: 'تسوق وملابس',
    type: 'expense',
    icon: 'shopping-bag',
    color: '#8B5CF6',
    badge_bg_light: '#EDE9FE',
    badge_bg_dark: 'rgba(139,92,246,0.18)',
    is_default: true
  },
  {
    slug: 'cat_entertainment',
    name: 'ترفيه وخروج',
    type: 'expense',
    icon: 'film',
    color: '#F59E0B',
    badge_bg_light: '#FEF3C7',
    badge_bg_dark: 'rgba(245,158,11,0.18)',
    is_default: true
  },
  {
    slug: 'cat_education',
    name: 'تعليم وتطوير',
    type: 'expense',
    icon: 'graduation-cap',
    color: '#2563EB',
    badge_bg_light: '#DBEAFE',
    badge_bg_dark: 'rgba(37,99,235,0.18)',
    is_default: true
  },
  {
    slug: 'cat_personal',
    name: 'عناية شخصية',
    type: 'expense',
    icon: 'sparkles',
    color: '#EC4899',
    badge_bg_light: '#FCE7F3',
    badge_bg_dark: 'rgba(236,72,153,0.18)',
    is_default: true
  },
  {
    slug: 'cat_misc',
    name: 'مصاريف متنوعة',
    type: 'expense',
    icon: 'more-horizontal',
    color: '#64748B',
    badge_bg_light: '#F1F5F9',
    badge_bg_dark: 'rgba(100,116,139,0.18)',
    is_default: true
  },

  // --- 6 Income Categories ---
  {
    slug: 'cat_salary',
    name: 'راتب شهري',
    type: 'income',
    icon: 'banknote',
    color: '#059669',
    badge_bg_light: '#D1FAE5',
    badge_bg_dark: 'rgba(5,150,105,0.18)',
    is_default: true
  },
  {
    slug: 'cat_freelance',
    name: 'عمل حر ومشاريع',
    type: 'income',
    icon: 'briefcase',
    color: '#0D9488',
    badge_bg_light: '#CCFBF1',
    badge_bg_dark: 'rgba(13,148,136,0.18)',
    is_default: true
  },
  {
    slug: 'cat_business',
    name: 'أرباح تجارية',
    type: 'income',
    icon: 'trending-up',
    color: '#0284C7',
    badge_bg_light: '#E0F2FE',
    badge_bg_dark: 'rgba(2,132,199,0.18)',
    is_default: true
  },
  {
    slug: 'cat_investments',
    name: 'استثمارات وعوائد',
    type: 'income',
    icon: 'line-chart',
    color: '#7C3AED',
    badge_bg_light: '#EDE9FE',
    badge_bg_dark: 'rgba(124,58,237,0.18)',
    is_default: true
  },
  {
    slug: 'cat_gifts',
    name: 'هدايا ومكافآت',
    type: 'income',
    icon: 'gift',
    color: '#D97706',
    badge_bg_light: '#FEF3C7',
    badge_bg_dark: 'rgba(217,119,6,0.18)',
    is_default: true
  },
  {
    slug: 'cat_other_income',
    name: 'دخل آخر',
    type: 'income',
    icon: 'coins',
    color: '#475569',
    badge_bg_light: '#F1F5F9',
    badge_bg_dark: 'rgba(71,85,105,0.18)',
    is_default: true
  }
]);

export const DEFAULT_EXPENSE_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense');
export const DEFAULT_INCOME_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.type === 'income');

/**
 * Seeds default categories into the IndexedDB database.
 * Idempotent: Skips categories whose slugs already exist for this user, avoiding duplicates.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<Array<object>>} List of all active default categories
 */
export async function seedDefaultCategories(database = db, userId = null) {
  return await database.transaction('rw', database.categories, async () => {
    // Retrieve all existing categories for this user/guest context
    const existingCategories = await database.categories
      .filter((cat) => (cat.user_id || null) === (userId || null))
      .toArray();

    const existingSlugs = new Set(
      existingCategories.map((c) => c.slug).filter(Boolean)
    );

    const now = new Date().toISOString();
    const toInsert = [];

    for (const def of DEFAULT_CATEGORIES) {
      if (!existingSlugs.has(def.slug)) {
        toInsert.push({
          id: generateUUID(),
          user_id: userId || null,
          slug: def.slug,
          name: def.name,
          type: def.type,
          icon: def.icon,
          color: def.color,
          badge_bg_light: def.badge_bg_light,
          badge_bg_dark: def.badge_bg_dark,
          is_default: true,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          sync_version: 1
        });
      }
    }

    if (toInsert.length > 0) {
      await database.categories.bulkAdd(toInsert);
    }

    // Return all default categories for this user
    return await database.categories
      .filter(
        (cat) =>
          (cat.user_id || null) === (userId || null) &&
          cat.is_default === true &&
          cat.deleted_at === null
      )
      .toArray();
  });
}

/**
 * Checks whether all default categories are already seeded for a given user.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<boolean>}
 */
export async function isCategoriesSeeded(database = db, userId = null) {
  const count = await database.categories
    .filter(
      (cat) =>
        (cat.user_id || null) === (userId || null) &&
        cat.is_default === true &&
        cat.deleted_at === null
    )
    .count();

  return count >= DEFAULT_CATEGORIES.length;
}

/**
 * Retrieves categories matching query criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {'expense'|'income'} [options.type]
 * @param {string|null} [options.userId=null]
 * @param {boolean} [options.includeDeleted=false]
 * @returns {Promise<Array<object>>}
 */
export async function getCategories(
  database = db,
  { type, userId = null, includeDeleted = false } = {}
) {
  const results = await database.categories
    .filter((cat) => {
      const matchesUser = (cat.user_id || null) === (userId || null);
      if (!matchesUser) return false;

      if (type && cat.type !== type) return false;
      if (!includeDeleted && cat.deleted_at !== null) return false;

      return true;
    })
    .toArray();

  return results;
}

/**
 * Retrieves a single category by primary key ID.
 *
 * @param {string} id
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object|null>}
 */
export async function getCategoryById(id, database = db) {
  if (!id) return null;
  const category = await database.categories.get(id);
  return category || null;
}

/**
 * Retrieves a single category by its system slug.
 *
 * @param {string} slug
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<object|null>}
 */
export async function getCategoryBySlug(slug, database = db, userId = null) {
  if (!slug) return null;
  const matches = await database.categories
    .where('slug')
    .equals(slug)
    .filter((cat) => (cat.user_id || null) === (userId || null))
    .toArray();

  return matches[0] || null;
}

/**
 * Creates a new custom category.
 *
 * @param {object} data
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Created category record
 */
export async function createCategory(data, database = db) {
  if (!data || typeof data !== 'object') {
    throw new Error('بيانات التصنيف غير صالحة');
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    throw new Error('اسم التصنيف مطلوب');
  }

  if (data.type !== 'expense' && data.type !== 'income') {
    throw new Error("نوع التصنيف يجب أن يكون 'expense' أو 'income'");
  }

  const now = new Date().toISOString();
  const categoryRecord = {
    id: data.id || generateUUID(),
    user_id: data.user_id || null,
    slug: data.slug || null,
    name,
    type: data.type,
    icon: data.icon || (data.type === 'expense' ? 'tag' : 'wallet'),
    color: data.color || (data.type === 'expense' ? '#64748B' : '#059669'),
    badge_bg_light: data.badge_bg_light || null,
    badge_bg_dark: data.badge_bg_dark || null,
    is_default: Boolean(data.is_default),
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    deleted_at: null,
    sync_version: typeof data.sync_version === 'number' ? data.sync_version : 1
  };

  await database.categories.add(categoryRecord);
  return categoryRecord;
}

/**
 * Updates an existing category (name, icon, color, badge backgrounds).
 *
 * @param {string} id
 * @param {object} updates
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Updated category record
 */
export async function updateCategory(id, updates, database = db) {
  if (!id) {
    throw new Error('معرف التصنيف مطلوب للتحديث');
  }

  const existing = await database.categories.get(id);
  if (!existing) {
    throw new Error(`التصنيف ذو المعرف "${id}" غير موجود`);
  }

  const updatedRecord = { ...existing };

  if (updates.name !== undefined) {
    const trimmed = typeof updates.name === 'string' ? updates.name.trim() : '';
    if (!trimmed) {
      throw new Error('اسم التصنيف لا يمكن أن يكون فارغاً');
    }
    updatedRecord.name = trimmed;
  }

  if (updates.icon !== undefined) {
    if (!updates.icon || typeof updates.icon !== 'string') {
      throw new Error('رمز الأيقونة غير صالح');
    }
    updatedRecord.icon = updates.icon;
  }

  if (updates.color !== undefined) {
    if (!updates.color || typeof updates.color !== 'string') {
      throw new Error('رمز اللون غير صالح');
    }
    updatedRecord.color = updates.color;
  }

  if (updates.badge_bg_light !== undefined) {
    updatedRecord.badge_bg_light = updates.badge_bg_light;
  }

  if (updates.badge_bg_dark !== undefined) {
    updatedRecord.badge_bg_dark = updates.badge_bg_dark;
  }

  if (updates.type !== undefined && updates.type !== existing.type) {
    if (updates.type !== 'expense' && updates.type !== 'income') {
      throw new Error("نوع التصنيف يجب أن يكون 'expense' أو 'income'");
    }
    updatedRecord.type = updates.type;
  }

  updatedRecord.updated_at = new Date().toISOString();
  updatedRecord.sync_version = (existing.sync_version || 1) + 1;

  await database.categories.put(updatedRecord);
  return updatedRecord;
}

/**
 * Soft-deletes a category. Prevents deletion if active transactions exist referencing it,
 * unless force is explicitly set to true.
 *
 * @param {string} id
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @returns {Promise<object>} Soft-deleted category record
 */
export async function deleteCategory(id, database = db, { force = false } = {}) {
  if (!id) {
    throw new Error('معرف التصنيف مطلوب للحذف');
  }

  const existing = await database.categories.get(id);
  if (!existing) {
    throw new Error(`التصنيف ذو المعرف "${id}" غير موجود`);
  }

  // Safety check: Prevent deletion if active transactions reference this category
  if (database.transactions) {
    const activeTransactions = await database.transactions
      .where('category_id')
      .equals(id)
      .filter((tx) => tx.deleted_at === null)
      .count();

    if (activeTransactions > 0 && !force) {
      throw new CategoryInUseError(
        `لا يمكن حذف التصنيف لوجود ${activeTransactions} معاملة مرتبطة به. يرجى نقل المعاملات إلى تصنيف آخر أولاً.`,
        activeTransactions
      );
    }
  }

  const now = new Date().toISOString();
  const updatedRecord = {
    ...existing,
    deleted_at: now,
    updated_at: now,
    sync_version: (existing.sync_version || 1) + 1
  };

  await database.categories.put(updatedRecord);
  return updatedRecord;
}

/**
 * Reassigns all transactions referencing fromCategoryId to toCategoryId in an atomic transaction.
 * Useful before deleting a category.
 *
 * @param {string} fromCategoryId
 * @param {string} toCategoryId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<number>} Number of transactions reassigned
 */
export async function reassignTransactionsCategory(fromCategoryId, toCategoryId, database = db) {
  if (!fromCategoryId || !toCategoryId) {
    throw new Error('معرف التصنيف المصدر والهدف مطلوبان لإعادة التعيين');
  }

  if (fromCategoryId === toCategoryId) {
    return 0;
  }

  const targetCategory = await database.categories.get(toCategoryId);
  if (!targetCategory || targetCategory.deleted_at !== null) {
    throw new Error('التصنيف الهدف غير موجود أو محذوف');
  }

  let count = 0;
  await database.transaction('rw', database.transactions, async () => {
    const transactions = await database.transactions
      .where('category_id')
      .equals(fromCategoryId)
      .toArray();

    const now = new Date().toISOString();
    for (const tx of transactions) {
      await database.transactions.update(tx.id, {
        category_id: toCategoryId,
        updated_at: now,
        sync_version: (tx.sync_version || 1) + 1
      });
      count++;
    }
  });

  return count;
}
