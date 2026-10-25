import { db } from '../db/db.js';
import {
  syncAccountBalances,
  generateUUID,
  isValidIsoDate,
  normalizeTags
} from './transaction.js';

/**
 * Custom error thrown when transfer validation fails
 */
export class TransferValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'TransferValidationError';
    this.code = 'TRANSFER_VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Custom error thrown when a transfer transaction cannot be found
 */
export class TransferNotFoundError extends Error {
  constructor(message, transferId = null) {
    super(message);
    this.name = 'TransferNotFoundError';
    this.code = 'TRANSFER_NOT_FOUND';
    this.transferId = transferId;
  }
}

/**
 * Validates internal account transfer input parameters.
 *
 * @param {object} data
 * @param {boolean} [isUpdate=false]
 * @param {import('../db/db.js').ExpenseDatabase} database
 */
export async function validateTransferData(data, isUpdate = false, database = db) {
  if (!data || typeof data !== 'object') {
    throw new TransferValidationError('بيانات التحويل غير صالحة');
  }

  // 1. Amount validation: strictly positive integer in minor units
  if (!isUpdate || data.amount !== undefined) {
    if (typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount) || data.amount <= 0) {
      throw new TransferValidationError(
        'المبلغ يجب أن يكون رقماً صحيحاً موجباً بوحدات العملة الصغرى (Integer Minor Units > 0)',
        'amount'
      );
    }
  }

  // 2. Date validation: YYYY-MM-DD (optional on create, defaults to today)
  const dateToValidate = data.date !== undefined ? data.date : (!isUpdate ? new Date().toISOString().slice(0, 10) : undefined);
  if (dateToValidate !== undefined) {
    if (!isValidIsoDate(dateToValidate)) {
      throw new TransferValidationError(
        'تاريخ التحويل غير صالح ويجب أن يكون بصيغة YYYY-MM-DD',
        'date'
      );
    }
  }

  // 3. Category validation: transfers must NEVER have categories
  if (data.category_id !== undefined && data.category_id !== null) {
    throw new TransferValidationError(
      'معاملات التحويل الداخلي لا تحتوي على تصنيف',
      'category_id'
    );
  }

  // 4. Source Account validation
  if (!isUpdate || data.account_id !== undefined) {
    if (typeof data.account_id !== 'string' || !data.account_id.trim()) {
      throw new TransferValidationError('معرف حساب المصدر مطلوب', 'account_id');
    }

    const sourceAccount = await database.accounts.get(data.account_id);
    if (!sourceAccount || sourceAccount.deleted_at !== null) {
      throw new TransferValidationError('حساب المصدر المحدد غير موجود أو محذوف', 'account_id');
    }
  }

  // 5. Destination Account validation
  if (!isUpdate || data.destination_account_id !== undefined) {
    if (typeof data.destination_account_id !== 'string' || !data.destination_account_id.trim()) {
      throw new TransferValidationError('معرف حساب الوجهة مطلوب', 'destination_account_id');
    }

    // Must not transfer to the same account
    if (data.account_id && data.destination_account_id === data.account_id) {
      throw new TransferValidationError('لا يمكن التحويل إلى نفس الحساب', 'destination_account_id');
    }

    const destAccount = await database.accounts.get(data.destination_account_id);
    if (!destAccount || destAccount.deleted_at !== null) {
      throw new TransferValidationError('حساب الوجهة المحدد غير موجود أو محذوف', 'destination_account_id');
    }

    // Currency consistency check (MVP rule: single base currency or matching account currencies)
    if (data.account_id) {
      const sourceAccount = await database.accounts.get(data.account_id);
      if (
        sourceAccount &&
        sourceAccount.currency &&
        destAccount.currency &&
        sourceAccount.currency !== destAccount.currency
      ) {
        throw new TransferValidationError(
          `لا يمكن التحويل بين حسابات بعملات مختلفة (${sourceAccount.currency} إلى ${destAccount.currency})`,
          'destination_account_id'
        );
      }
    }
  }
}

/**
 * Creates and executes an internal account transfer using the Single-Record Model.
 * Atomically deducts `amount` from the source account and credits `amount` to the destination account.
 *
 * @param {object} data Transfer payload
 * @param {number} data.amount Positive integer in minor units
 * @param {string} data.account_id Source account UUID
 * @param {string} data.destination_account_id Destination account UUID
 * @param {string} [data.date] ISO date string (YYYY-MM-DD), defaults to today
 * @param {string} [data.notes] Optional description/notes
 * @param {Array<string>|string} [data.tags] Optional tags
 * @param {string} [data.payment_method] Optional payment instrument
 * @param {string} [data.user_id] Optional remote user UUID
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Created transfer transaction record
 */
export async function createTransfer(data, database = db) {
  await validateTransferData(data, false, database);

  const now = new Date().toISOString();
  const txId = data?.id || generateUUID();

  const record = {
    id: txId,
    user_id: data?.user_id || null,
    type: 'transfer',
    amount: data.amount,
    date: data?.date || now.slice(0, 10),
    category_id: null,
    account_id: data.account_id,
    destination_account_id: data.destination_account_id,
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

      // Atomically update and balance-reconcile both source and destination accounts
      await syncAccountBalances([record.account_id, record.destination_account_id], database, now);
    }
  );

  return record;
}

/**
 * Functional alias for `createTransfer` per specification.
 */
export const executeTransfer = createTransfer;

/**
 * Retrieves a single transfer transaction by ID.
 *
 * @param {string} transferId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted=false]
 * @returns {Promise<object|null>}
 */
export async function getTransferById(transferId, database = db, { includeDeleted = false } = {}) {
  if (!transferId) {
    return null;
  }

  const tx = await database.transactions.get(transferId);
  if (!tx || tx.type !== 'transfer') {
    return null;
  }

  if (!includeDeleted && tx.deleted_at !== null) {
    return null;
  }

  return tx;
}

/**
 * Retrieves transfer transactions based on filter, search, and pagination criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {string|null} [options.userId] Filter by user ID
 * @param {string} [options.accountId] Filter if account is either source or destination
 * @param {string} [options.sourceAccountId] Filter specifically by source account ID
 * @param {string} [options.destinationAccountId] Filter specifically by destination account ID
 * @param {string} [options.startDate] Filter >= startDate (YYYY-MM-DD)
 * @param {string} [options.endDate] Filter <= endDate (YYYY-MM-DD)
 * @param {number} [options.minAmount] Minimum amount in minor units
 * @param {number} [options.maxAmount] Maximum amount in minor units
 * @param {string} [options.search] Text search across notes and tags
 * @param {string} [options.tag] Filter by tag inclusion
 * @param {boolean} [options.includeDeleted=false] Include soft-deleted transfers
 * @param {string} [options.sortBy='date'] Sort field: 'date', 'amount', 'created_at'
 * @param {string} [options.sortOrder='desc'] Sort order: 'asc' or 'desc'
 * @param {number} [options.limit] Maximum records to return
 * @param {number} [options.offset=0] Records offset for pagination
 * @returns {Promise<Array<object>>}
 */
export async function getTransfers(database = db, options = {}) {
  const {
    userId = undefined,
    accountId = null,
    sourceAccountId = null,
    destinationAccountId = null,
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

  const searchLower = typeof search === 'string' && search.trim() ? search.trim().toLowerCase() : null;
  const tagTarget = typeof tag === 'string' && tag.trim() ? tag.trim().toLowerCase() : null;

  const filtered = await database.transactions
    .filter((tx) => {
      // Must be a transfer
      if (tx.type !== 'transfer') {
        return false;
      }

      // Soft delete filter
      if (!includeDeleted && tx.deleted_at !== null) {
        return false;
      }

      // User ID filter
      if (userId !== undefined) {
        const txUserId = tx.user_id || null;
        const targetUserId = userId || null;
        if (txUserId !== targetUserId) {
          return false;
        }
      }

      // General Account ID filter (source or destination)
      if (accountId) {
        if (tx.account_id !== accountId && tx.destination_account_id !== accountId) {
          return false;
        }
      }

      // Explicit source account filter
      if (sourceAccountId && tx.account_id !== sourceAccountId) {
        return false;
      }

      // Explicit destination account filter
      if (destinationAccountId && tx.destination_account_id !== destinationAccountId) {
        return false;
      }

      // Date Range filter
      if (startDate && tx.date < startDate) {
        return false;
      }
      if (endDate && tx.date > endDate) {
        return false;
      }

      // Amount Range
      if (minAmount !== null && tx.amount < minAmount) {
        return false;
      }
      if (maxAmount !== null && tx.amount > maxAmount) {
        return false;
      }

      // Tag filter
      if (tagTarget) {
        if (!Array.isArray(tx.tags) || !tx.tags.some((t) => t.toLowerCase() === tagTarget)) {
          return false;
        }
      }

      // Text search
      if (searchLower) {
        const inNotes = typeof tx.notes === 'string' && tx.notes.toLowerCase().includes(searchLower);
        const inTags = Array.isArray(tx.tags) && tx.tags.some((t) => t.toLowerCase().includes(searchLower));
        if (!inNotes && !inTags) {
          return false;
        }
      }

      return true;
    })
    .toArray();

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
 * Returns total count of transfers matching criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @returns {Promise<number>}
 */
export async function getTransfersCount(database = db, options = {}) {
  const transfers = await getTransfers(database, {
    ...options,
    limit: undefined,
    offset: 0
  });
  return transfers.length;
}

/**
 * Aggregates summary analytics for transfers matching filter options.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @returns {Promise<{
 *   totalTransferred: number,
 *   count: number,
 *   averageAmount: number
 * }>}
 */
export async function getTransfersSummary(database = db, options = {}) {
  const transfers = await getTransfers(database, {
    ...options,
    includeDeleted: false,
    limit: undefined,
    offset: 0
  });

  let totalTransferred = 0;
  for (const t of transfers) {
    totalTransferred += t.amount;
  }

  const count = transfers.length;
  const averageAmount = count > 0 ? Math.round(totalTransferred / count) : 0;

  return {
    totalTransferred,
    count,
    averageAmount
  };
}

/**
 * Updates an existing transfer, atomically adjusting both old and new accounts' balances.
 *
 * @param {string} transferId
 * @param {object} updates
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Updated transfer record
 */
export async function updateTransfer(transferId, updates, database = db) {
  if (!transferId) {
    throw new TransferValidationError('معرف التحويل مطلوب للتحديث', 'id');
  }

  if (!updates || typeof updates !== 'object') {
    throw new TransferValidationError('بيانات التحديث غير صالحة');
  }

  const existing = await database.transactions.get(transferId);
  if (!existing || existing.deleted_at !== null || existing.type !== 'transfer') {
    throw new TransferNotFoundError(
      `معاملة التحويل ذات المعرف "${transferId}" غير موجودة أو محذوفة`,
      transferId
    );
  }

  const merged = {
    ...existing,
    ...updates,
    type: 'transfer',
    category_id: null
  };

  await validateTransferData(merged, true, database);

  const now = new Date().toISOString();
  let updatedRecord;

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      const fresh = await database.transactions.get(transferId);
      if (!fresh || fresh.deleted_at !== null || fresh.type !== 'transfer') {
        throw new TransferNotFoundError(
          `معاملة التحويل ذات المعرف "${transferId}" غير موجودة أو محذوفة`,
          transferId
        );
      }

      const nextSyncVersion = (fresh.sync_version || 1) + 1;
      updatedRecord = {
        ...fresh,
        ...updates,
        type: 'transfer',
        category_id: null,
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
          entity_id: transferId,
          action: 'UPSERT',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(updatedRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile all affected accounts (old source, old dest, new source, new dest)
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
 * Soft-deletes a transfer (`deleted_at = now`), atomically restoring both account balances.
 *
 * @param {string} transferId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Soft-deleted transfer record
 */
export async function deleteTransfer(transferId, database = db) {
  if (!transferId) {
    throw new TransferValidationError('معرف التحويل مطلوب للحذف', 'id');
  }

  const existing = await database.transactions.get(transferId);
  if (!existing || existing.deleted_at !== null || existing.type !== 'transfer') {
    throw new TransferNotFoundError(
      `معاملة التحويل ذات المعرف "${transferId}" غير موجودة أو محذوفة مسبقاً`,
      transferId
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
      const fresh = await database.transactions.get(transferId);
      if (!fresh || fresh.deleted_at !== null || fresh.type !== 'transfer') {
        throw new TransferNotFoundError(
          `معاملة التحويل ذات المعرف "${transferId}" غير موجودة أو محذوفة مسبقاً`,
          transferId
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
          entity_id: transferId,
          action: 'DELETE',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(deletedRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile affected accounts; since deleted_at IS NOT NULL,
      // the ledger formula automatically ignores this transfer and restores both balances!
      await syncAccountBalances([fresh.account_id, fresh.destination_account_id], database, now);
    }
  );

  return deletedRecord;
}

/**
 * Restores a soft-deleted transfer (`deleted_at = null`),
 * atomically re-applying it to both accounts' balances.
 *
 * @param {string} transferId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Restored transfer record
 */
export async function restoreTransfer(transferId, database = db) {
  if (!transferId) {
    throw new TransferValidationError('معرف التحويل مطلوب للاستعادة', 'id');
  }

  const existing = await database.transactions.get(transferId);
  if (!existing || existing.type !== 'transfer') {
    throw new TransferNotFoundError(
      `معاملة التحويل ذات المعرف "${transferId}" غير موجودة`,
      transferId
    );
  }

  if (existing.deleted_at === null) {
    return existing;
  }

  // Verify source account is active
  const sourceAccount = await database.accounts.get(existing.account_id);
  if (!sourceAccount || sourceAccount.deleted_at !== null) {
    throw new TransferValidationError(
      'لا يمكن استعادة التحويل لأن حساب المصدر محذوف',
      'account_id'
    );
  }

  // Verify destination account is active
  const destAccount = await database.accounts.get(existing.destination_account_id);
  if (!destAccount || destAccount.deleted_at !== null) {
    throw new TransferValidationError(
      'لا يمكن استعادة التحويل لأن حساب الوجهة محذوف',
      'destination_account_id'
    );
  }

  const now = new Date().toISOString();
  let restoredRecord;

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      const fresh = await database.transactions.get(transferId);
      if (!fresh || fresh.type !== 'transfer') {
        throw new TransferNotFoundError(`معاملة التحويل "${transferId}" غير موجودة`, transferId);
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
          entity_id: transferId,
          action: 'UPSERT',
          client_base_version: fresh.sync_version || 1,
          payload: JSON.stringify(restoredRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // Reconcile accounts with restored transfer
      await syncAccountBalances([fresh.account_id, fresh.destination_account_id], database, now);
    }
  );

  return restoredRecord;
}

/**
 * Permanently hard-deletes a transfer from the database.
 *
 * @param {string} transferId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<boolean>}
 */
export async function permanentDeleteTransfer(transferId, database = db) {
  if (!transferId) return false;

  const existing = await database.transactions.get(transferId);
  if (!existing || existing.type !== 'transfer') return false;

  const now = new Date().toISOString();

  await database.transaction(
    'rw',
    database.transactions,
    database.accounts,
    database.offline_mutation_queue,
    async () => {
      await database.transactions.delete(transferId);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'transaction',
          entity_id: transferId,
          action: 'DELETE',
          client_base_version: existing.sync_version || 1,
          payload: JSON.stringify({ id: transferId, permanently_deleted: true }),
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
