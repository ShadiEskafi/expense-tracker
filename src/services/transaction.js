import { db } from '../db/db.js';
import { calculateAccountBalance } from './account.js';

/**
 * Valid transaction types per project-summary.md & docs/data-model.md
 */
export const TRANSACTION_TYPES = Object.freeze([
  'expense',
  'income',
  'transfer'
]);

/**
 * Custom error thrown when transaction validation fails
 */
export class TransactionValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'TransactionValidationError';
    this.code = 'TRANSACTION_VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Custom error thrown when a transaction cannot be found
 */
export class TransactionNotFoundError extends Error {
  constructor(message, transactionId = null) {
    super(message);
    this.name = 'TransactionNotFoundError';
    this.code = 'TRANSACTION_NOT_FOUND';
    this.transactionId = transactionId;
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
 * Validates whether a string is a valid ISO date formatted as YYYY-MM-DD.
 * Rejects nonexistent calendar dates like 2026-02-31.
 *
 * @param {string} str
 * @returns {boolean}
 */
export function isValidIsoDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = str.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Normalizes input tags to an array of trimmed, non-empty, unique strings.
 *
 * @param {Array<string>|string|null|undefined} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  if (!tags) return [];
  let rawList;
  if (Array.isArray(tags)) {
    rawList = tags;
  } else if (typeof tags === 'string') {
    rawList = tags.split(',');
  } else {
    return [];
  }

  const cleaned = rawList
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => t.length > 0);

  return Array.from(new Set(cleaned));
}

/**
 * Internal helper to atomically recalculate and update accounts involved in a transaction.
 *
 * @param {string[]} accountIds List of unique account IDs to reconcile
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string} timestamp ISO timestamp
 */
export async function syncAccountBalances(accountIds, database, timestamp) {
  const uniqueIds = Array.from(new Set(accountIds.filter(Boolean)));

  for (const accId of uniqueIds) {
    const account = await database.accounts.get(accId);
    if (!account) continue;

    const calc = await calculateAccountBalance(accId, database);
    const updatedAccount = {
      ...account,
      current_balance: calc.calculatedBalance,
      updated_at: timestamp,
      sync_version: (account.sync_version || 1) + 1
    };

    await database.accounts.put(updatedAccount);

    if (database.offline_mutation_queue) {
      await database.offline_mutation_queue.add({
        id: generateUUID(),
        entity_type: 'account',
        entity_id: accId,
        action: 'UPSERT',
        client_base_version: account.sync_version || 1,
        payload: JSON.stringify(updatedAccount),
        client_timestamp: timestamp,
        retry_count: 0,
        status: 'pending'
      });
    }
  }
}

/**
 * Validates transaction input parameters.
 *
 * @param {object} data
 * @param {boolean} [isUpdate=false]
 * @param {import('../db/db.js').ExpenseDatabase} database
 */
async function validateTransactionData(data, isUpdate = false, database = db) {
  if (!data || typeof data !== 'object') {
    throw new TransactionValidationError('بيانات المعاملة غير صالحة');
  }

  // 1. Type validation
  if (!isUpdate || data.type !== undefined) {
    if (!TRANSACTION_TYPES.includes(data.type)) {
      throw new TransactionValidationError(
        `نوع المعاملة غير صالح. الأنواع المتاحة: ${TRANSACTION_TYPES.join(', ')}`,
        'type'
      );
    }
  }

  // 2. Amount validation: strictly positive integer in minor units
  if (!isUpdate || data.amount !== undefined) {
    if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0) {
      throw new TransactionValidationError(
        'المبلغ يجب أن يكون رقماً صحيحاً موجباً بوحدات العملة الصغرى (Integer Minor Units > 0)',
        'amount'
      );
    }
  }

  // 3. Date validation: YYYY-MM-DD
  if (!isUpdate || data.date !== undefined) {
    if (!isValidIsoDate(data.date)) {
      throw new TransactionValidationError(
        'تاريخ المعاملة غير صالح ويجب أن يكون بصيغة YYYY-MM-DD',
        'date'
      );
    }
  }

  // 4. Source Account validation
  if (!isUpdate || data.account_id !== undefined) {
    if (typeof data.account_id !== 'string' || !data.account_id.trim()) {
      throw new TransactionValidationError('معرف الحساب مطلوب', 'account_id');
    }

    const account = await database.accounts.get(data.account_id);
    if (!account || account.deleted_at !== null) {
      throw new TransactionValidationError('الحساب المحدد غير موجود أو محذوف', 'account_id');
    }
  }

  // 5. Category & Destination Account validations depending on type
  const effectiveType = data.type;

  if (effectiveType === 'expense' || effectiveType === 'income') {
    // Destination account must be null for expense and income
    if (data.destination_account_id !== undefined && data.destination_account_id !== null) {
      throw new TransactionValidationError(
        'لا يمكن تحديد حساب وجهة لمعاملات المصروفات أو الإيرادات',
        'destination_account_id'
      );
    }

    // Category is mandatory for expense and income
    if (!isUpdate || data.category_id !== undefined) {
      if (typeof data.category_id !== 'string' || !data.category_id.trim()) {
        throw new TransactionValidationError('تصنيف المعاملة مطلوب', 'category_id');
      }

      const category = await database.categories.get(data.category_id);
      if (!category || category.deleted_at !== null) {
        throw new TransactionValidationError('التصنيف المحدد غير موجود أو محذوف', 'category_id');
      }

      // Check category type compatibility
      if (effectiveType && category.type !== effectiveType) {
        throw new TransactionValidationError(
          `نوع التصنيف (${category.type === 'expense' ? 'مصروف' : 'إيراد'}) لا يتطابق مع نوع المعاملة (${effectiveType === 'expense' ? 'مصروف' : 'إيراد'})`,
          'category_id'
        );
      }
    }
  } else if (effectiveType === 'transfer') {
    // Category must be null for transfer
    if (data.category_id !== undefined && data.category_id !== null) {
      throw new TransactionValidationError(
        'معاملات التحويل الداخلي لا تحتوي على تصنيف',
        'category_id'
      );
    }

    // Destination account is mandatory for transfer
    if (!isUpdate || data.destination_account_id !== undefined) {
      if (typeof data.destination_account_id !== 'string' || !data.destination_account_id.trim()) {
        throw new TransactionValidationError('معرف حساب الوجهة مطلوب لمعاملات التحويل', 'destination_account_id');
      }

      if (data.account_id && data.destination_account_id === data.account_id) {
        throw new TransactionValidationError('لا يمكن التحويل إلى نفس الحساب', 'destination_account_id');
      }

      const destAccount = await database.accounts.get(data.destination_account_id);
      if (!destAccount || destAccount.deleted_at !== null) {
        throw new TransactionValidationError('حساب الوجهة المحدد غير موجود أو محذوف', 'destination_account_id');
      }

      if (data.account_id) {
        const srcAccount = await database.accounts.get(data.account_id);
        if (srcAccount && srcAccount.currency && destAccount.currency && srcAccount.currency !== destAccount.currency) {
          throw new TransactionValidationError(
            `لا يمكن التحويل بين حسابات بعملات مختلفة (${srcAccount.currency} إلى ${destAccount.currency})`,
            'destination_account_id'
          );
        }
      }
    }
  }
}

/**
 * Creates a new transaction (expense or income), updating the account balance atomically.
 *
 * @param {object} data
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Created transaction record
 */
export async function createTransaction(data, database = db) {
  await validateTransactionData(data, false, database);

  const now = new Date().toISOString();
  const txId = data.id || generateUUID();

  const record = {
    id: txId,
    user_id: data.user_id || null,
    type: data.type,
    amount: data.amount,
    date: data.date,
    category_id: data.type === 'transfer' ? null : (data.category_id || null),
    account_id: data.account_id,
    destination_account_id: data.type === 'transfer' ? (data.destination_account_id || null) : null,
    payment_method: data.payment_method || null,
    notes: typeof data.notes === 'string' ? data.notes.trim() : null,
    tags: normalizeTags(data.tags),
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    deleted_at: null,
    sync_version: typeof data.sync_version === 'number' ? data.sync_version : 1
  };

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      await database.transactions.add(record);

      // Queue mutation for sync
      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: record.id,
          action: 'UPSERT',
          client_base_version: 0,
          payload: JSON.stringify(record),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Atomically sync affected account balance(s)
      await syncAccountBalances([record.account_id, record.destination_account_id], database, now);
    }
  );

  return record;
}

/**
 * Convenience helper to create an expense transaction.
 *
 * @param {object} data
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>}
 */
export async function createExpense(data, database = db) {
  return await createTransaction({ ...data, type: 'expense' }, database);
}

/**
 * Convenience helper to create an income transaction.
 *
 * @param {object} data
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>}
 */
export async function createIncome(data, database = db) {
  return await createTransaction({ ...data, type: 'income' }, database);
}

/**
 * Convenience helper to create an internal transfer transaction.
 *
 * @param {object} data
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>}
 */
export async function createTransfer(data, database = db) {
  return await createTransaction({ ...data, type: 'transfer' }, database);
}

/**
 * Retrieves a single transaction by ID.
 *
 * @param {string} transactionId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted=false]
 * @returns {Promise<object|null>}
 */
export async function getTransactionById(transactionId, database = db, { includeDeleted = false } = {}) {
  if (!transactionId) {
    return null;
  }

  const tx = await database.transactions.get(transactionId);
  if (!tx) {
    return null;
  }

  if (!includeDeleted && tx.deleted_at !== null) {
    return null;
  }

  return tx;
}

/**
 * Retrieves transactions based on comprehensive filter, search, and pagination criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {string|null} [options.userId] Filter by user ID
 * @param {string} [options.accountId] Filter by source or destination account ID
 * @param {string} [options.categoryId] Filter by category ID
 * @param {string|string[]} [options.type] Filter by type ('expense', 'income', 'transfer')
 * @param {string} [options.startDate] Filter >= startDate (YYYY-MM-DD)
 * @param {string} [options.endDate] Filter <= endDate (YYYY-MM-DD)
 * @param {number} [options.minAmount] Minimum amount in minor units
 * @param {number} [options.maxAmount] Maximum amount in minor units
 * @param {string} [options.search] Text search across notes and tags
 * @param {string} [options.tag] Filter by tag inclusion
 * @param {boolean} [options.includeDeleted=false] Include soft-deleted records
 * @param {string} [options.sortBy='date'] Sort field: 'date', 'amount', 'created_at'
 * @param {string} [options.sortOrder='desc'] Sort order: 'asc' or 'desc'
 * @param {number} [options.limit] Maximum records to return
 * @param {number} [options.offset=0] Records offset for pagination
 * @returns {Promise<Array<object>>}
 */
export async function getTransactions(database = db, options = {}) {
  const {
    userId = undefined,
    accountId = null,
    categoryId = null,
    type = null,
    startDate = null,
    endDate = null,
    minAmount = null,
    maxAmount = null,
    search = null,
    tag = null,
    includeDeleted = false,
    sortBy = 'date',
    sortOrder = 'desc',
    limit = undefined,
    offset = 0
  } = options;

  let query = database.transactions.toCollection();

  const searchLower = typeof search === 'string' && search.trim() ? search.trim().toLowerCase() : null;
  const tagTarget = typeof tag === 'string' && tag.trim() ? tag.trim().toLowerCase() : null;

  const filtered = await query.filter((tx) => {
    // 1. Soft delete filter
    if (!includeDeleted && tx.deleted_at !== null) {
      return false;
    }

    // 2. User ID filter
    if (userId !== undefined) {
      const txUserId = tx.user_id || null;
      const targetUserId = userId || null;
      if (txUserId !== targetUserId) {
        return false;
      }
    }

    // 3. Account ID filter (matches source or destination)
    if (accountId) {
      if (tx.account_id !== accountId && tx.destination_account_id !== accountId) {
        return false;
      }
    }

    // 4. Category ID filter
    if (categoryId) {
      if (tx.category_id !== categoryId) {
        return false;
      }
    }

    // 5. Type filter
    if (type) {
      if (Array.isArray(type)) {
        if (!type.includes(tx.type)) return false;
      } else if (tx.type !== type) {
        return false;
      }
    }

    // 6. Date Range filter (YYYY-MM-DD string comparisons are chronologically valid)
    if (startDate && tx.date < startDate) {
      return false;
    }
    if (endDate && tx.date > endDate) {
      return false;
    }

    // 7. Amount range
    if (minAmount !== null && tx.amount < minAmount) {
      return false;
    }
    if (maxAmount !== null && tx.amount > maxAmount) {
      return false;
    }

    // 8. Tag filter
    if (tagTarget) {
      if (!Array.isArray(tx.tags) || !tx.tags.some((t) => t.toLowerCase() === tagTarget)) {
        return false;
      }
    }

    // 9. Text Search (notes and tags)
    if (searchLower) {
      const inNotes = typeof tx.notes === 'string' && tx.notes.toLowerCase().includes(searchLower);
      const inTags = Array.isArray(tx.tags) && tx.tags.some((t) => t.toLowerCase().includes(searchLower));
      if (!inNotes && !inTags) {
        return false;
      }
    }

    return true;
  }).toArray();

  // Sorting
  filtered.sort((a, b) => {
    let comp;
    if (sortBy === 'amount') {
      comp = a.amount - b.amount;
    } else if (sortBy === 'created_at') {
      comp = (a.created_at || '').localeCompare(b.created_at || '');
    } else {
      // Default: date, tie-broken by created_at
      comp = (a.date || '').localeCompare(b.date || '');
      if (comp === 0) {
        comp = (a.created_at || '').localeCompare(b.created_at || '');
      }
    }

    return sortOrder === 'asc' ? comp : -comp;
  });

  // Pagination
  const start = typeof offset === 'number' && offset > 0 ? offset : 0;
  if (typeof limit === 'number' && limit > 0) {
    return filtered.slice(start, start + limit);
  }

  return start > 0 ? filtered.slice(start) : filtered;
}

/**
 * Returns total count of transactions matching filter criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @returns {Promise<number>}
 */
export async function getTransactionsCount(database = db, options = {}) {
  const transactions = await getTransactions(database, {
    ...options,
    limit: undefined,
    offset: 0
  });
  return transactions.length;
}

/**
 * Computes financial summary totals for transactions matching filter options.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @returns {Promise<{
 *   totalIncome: number,
 *   totalExpense: number,
 *   netCashFlow: number,
 *   count: number,
 *   incomeCount: number,
 *   expenseCount: number,
 *   categoryBreakdown: Record<string, number>
 * }>}
 */
export async function getTransactionsSummary(database = db, options = {}) {
  const transactions = await getTransactions(database, {
    ...options,
    includeDeleted: false,
    limit: undefined,
    offset: 0
  });

  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  const categoryBreakdown = {};

  for (const tx of transactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeCount++;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      expenseCount++;
      if (tx.category_id) {
        categoryBreakdown[tx.category_id] = (categoryBreakdown[tx.category_id] || 0) + tx.amount;
      }
    }
  }

  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    count: transactions.length,
    incomeCount,
    expenseCount,
    categoryBreakdown
  };
}

/**
 * Updates an existing transaction, adjusting account balance(s) atomically.
 *
 * @param {string} transactionId
 * @param {object} updates
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Updated transaction record
 */
export async function updateTransaction(transactionId, updates, database = db) {
  if (!transactionId) {
    throw new TransactionValidationError('معرف المعاملة مطلوب للتحديث', 'id');
  }

  if (!updates || typeof updates !== 'object') {
    throw new TransactionValidationError('بيانات التحديث غير صالحة');
  }

  const existing = await database.transactions.get(transactionId);
  if (!existing || existing.deleted_at !== null) {
    throw new TransactionNotFoundError(
      `المعاملة ذات المعرف "${transactionId}" غير موجودة أو محذوفة`,
      transactionId
    );
  }

  const merged = { ...existing, ...updates };
  await validateTransactionData(merged, true, database);

  const now = new Date().toISOString();
  let updatedRecord;

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      const fresh = await database.transactions.get(transactionId);
      if (!fresh || fresh.deleted_at !== null) {
        throw new TransactionNotFoundError(
          `المعاملة ذات المعرف "${transactionId}" غير موجودة أو محذوفة`,
          transactionId
        );
      }

      const nextSyncVersion = (fresh.sync_version || 1) + 1;
      updatedRecord = {
        ...fresh,
        ...updates,
        tags: updates.tags !== undefined ? normalizeTags(updates.tags) : fresh.tags,
        notes: updates.notes !== undefined ? (typeof updates.notes === 'string' ? updates.notes.trim() : null) : fresh.notes,
        updated_at: now,
        sync_version: nextSyncVersion
      };

      await database.transactions.put(updatedRecord);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: transactionId,
          action: 'UPSERT',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(updatedRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile all affected accounts (both prior and new accounts)
      const affectedAccounts = [
        fresh.account_id,
        fresh.destination_account_id,
        updatedRecord.account_id,
        updatedRecord.destination_account_id
      ];
      await syncAccountBalances(affectedAccounts, database, now);
    }
  );

  return updatedRecord;
}

/**
 * Soft-deletes a transaction, setting `deleted_at`.
 * Atomically restores the affected account balance(s).
 *
 * @param {string} transactionId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Soft-deleted transaction record
 */
export async function deleteTransaction(transactionId, database = db) {
  if (!transactionId) {
    throw new TransactionValidationError('معرف المعاملة مطلوب للحذف', 'id');
  }

  const existing = await database.transactions.get(transactionId);
  if (!existing || existing.deleted_at !== null) {
    throw new TransactionNotFoundError(
      `المعاملة ذات المعرف "${transactionId}" غير موجودة أو محذوفة مسبقاً`,
      transactionId
    );
  }

  const now = new Date().toISOString();
  let deletedRecord;

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      const fresh = await database.transactions.get(transactionId);
      if (!fresh || fresh.deleted_at !== null) {
        throw new TransactionNotFoundError(
          `المعاملة ذات المعرف "${transactionId}" غير موجودة أو محذوفة مسبقاً`,
          transactionId
        );
      }

      const nextSyncVersion = (fresh.sync_version || 1) + 1;
      deletedRecord = {
        ...fresh,
        deleted_at: now,
        updated_at: now,
        sync_version: nextSyncVersion
      };

      await database.transactions.put(deletedRecord);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: transactionId,
          action: 'DELETE',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(deletedRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile affected accounts; since deleted_at IS NOT NULL,
      // the ledger formula automatically ignores this transaction!
      await syncAccountBalances([fresh.account_id, fresh.destination_account_id], database, now);
    }
  );

  return deletedRecord;
}

/**
 * Restores a soft-deleted transaction (`deleted_at = null`),
 * atomically re-applying it to the account balance.
 *
 * @param {string} transactionId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Restored transaction record
 */
export async function restoreTransaction(transactionId, database = db) {
  if (!transactionId) {
    throw new TransactionValidationError('معرف المعاملة مطلوب للاستعادة', 'id');
  }

  const existing = await database.transactions.get(transactionId);
  if (!existing) {
    throw new TransactionNotFoundError(
      `المعاملة ذات المعرف "${transactionId}" غير موجودة`,
      transactionId
    );
  }

  if (existing.deleted_at === null) {
    return existing;
  }

  // Verify associated account is not soft-deleted
  const account = await database.accounts.get(existing.account_id);
  if (!account || account.deleted_at !== null) {
    throw new TransactionValidationError(
      'لا يمكن استعادة المعاملة لأن الحساب المرتبط بها محذوف',
      'account_id'
    );
  }

  if (existing.destination_account_id) {
    const dest = await database.accounts.get(existing.destination_account_id);
    if (!dest || dest.deleted_at !== null) {
      throw new TransactionValidationError(
        'لا يمكن استعادة المعاملة لأن حساب الوجهة محذوف',
        'destination_account_id'
      );
    }
  }

  const now = new Date().toISOString();
  let restoredRecord;

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      const fresh = await database.transactions.get(transactionId);
      if (!fresh) {
        throw new TransactionNotFoundError(`المعاملة "${transactionId}" غير موجودة`, transactionId);
      }

      const nextSyncVersion = (fresh.sync_version || 1) + 1;
      restoredRecord = {
        ...fresh,
        deleted_at: null,
        updated_at: now,
        sync_version: nextSyncVersion
      };

      await database.transactions.put(restoredRecord);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: transactionId,
          action: 'UPSERT',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(restoredRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile affected accounts with restored transaction re-included in ledger
      await syncAccountBalances([fresh.account_id, fresh.destination_account_id], database, now);
    }
  );

  return restoredRecord;
}

/**
 * Permanently hard-deletes a transaction from the database.
 * Used for testing or administrative purging.
 *
 * @param {string} transactionId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<boolean>}
 */
export async function permanentDeleteTransaction(transactionId, database = db) {
  if (!transactionId) return false;

  const existing = await database.transactions.get(transactionId);
  if (!existing) return false;

  const now = new Date().toISOString();

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      await database.transactions.delete(transactionId);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: transactionId,
          action: 'DELETE',
          client_base_version: existing.sync_version || 1,
          payload: JSON.stringify({ id: transactionId, permanently_deleted: true }),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      await syncAccountBalances([existing.account_id, existing.destination_account_id], database, now);
    }
  );

  return true;
}
