import { db } from '../db/db.js';

/**
 * Valid account types per project-summary.md & docs/data-model.md
 */
export const ACCOUNT_TYPES = Object.freeze([
  'cash',
  'bank',
  'credit_card',
  'digital_wallet',
  'custom'
]);

/**
 * Custom error thrown when account validation fails
 */
export class AccountValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'AccountValidationError';
    this.code = 'ACCOUNT_VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Custom error thrown when an account cannot be found
 */
export class AccountNotFoundError extends Error {
  constructor(message, accountId = null) {
    super(message);
    this.name = 'AccountNotFoundError';
    this.code = 'ACCOUNT_NOT_FOUND';
    this.accountId = accountId;
  }
}

/**
 * Custom error thrown when attempting to delete an account with active transactions
 */
export class AccountInUseError extends Error {
  constructor(message, transactionCount = 0) {
    super(message);
    this.name = 'AccountInUseError';
    this.code = 'ACCOUNT_IN_USE';
    this.transactionCount = transactionCount;
  }
}

/**
 * Custom error thrown when attempting to modify currency after transactions or balances exist
 */
export class CurrencyLockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CurrencyLockedError';
    this.code = 'CURRENCY_LOCKED';
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
 * Deterministic default starter accounts for new users / guest mode
 */
export const DEFAULT_ACCOUNTS = Object.freeze([
  {
    slug: 'acc_cash',
    name: 'محفظة نقدية',
    type: 'cash',
    initial_balance: 0,
    icon: 'wallet',
    color: '#10B981',
    description: 'السيولة النقدية والمصروفات اليومية'
  },
  {
    slug: 'acc_bank',
    name: 'حساب بنكي',
    type: 'bank',
    initial_balance: 0,
    icon: 'landmark',
    color: '#0284C7',
    description: 'الحساب الجاري الرئيسي'
  }
]);

/**
 * Validates account input parameters.
 * Throws AccountValidationError on invalid input.
 */
function validateAccountInput(data, isUpdate = false) {
  if (!data || typeof data !== 'object') {
    throw new AccountValidationError('بيانات الحساب غير صالحة');
  }

  if (!isUpdate || data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      throw new AccountValidationError('اسم الحساب مطلوب ولا يمكن أن يكون فارغاً', 'name');
    }
  }

  if (!isUpdate || data.type !== undefined) {
    if (!ACCOUNT_TYPES.includes(data.type)) {
      throw new AccountValidationError(
        `نوع الحساب غير صالح. الأنواع المتاحة: ${ACCOUNT_TYPES.join(', ')}`,
        'type'
      );
    }
  }

  if (data.initial_balance !== undefined) {
    if (typeof data.initial_balance !== 'number' || !Number.isSafeInteger(data.initial_balance)) {
      throw new AccountValidationError(
        'الرصيد الافتتاحي يجب أن يكون رقماً صحيحاً بوحدات العملة الصغرى (Integer Minor Units)',
        'initial_balance'
      );
    }
  }

  if (!isUpdate || data.currency !== undefined) {
    const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : 'SAR';
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new AccountValidationError('رمز العملة يجب أن يتكون من 3 أحرف طبقاً لمعيار ISO 4217', 'currency');
    }
  }
}

/**
 * Creates a new account.
 *
 * @param {object} data Account configuration
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Created account record
 */
export async function createAccount(data, database = db) {
  validateAccountInput(data, false);

  const now = new Date().toISOString();
  const initialBalance = typeof data.initial_balance === 'number' ? data.initial_balance : 0;
  const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : 'SAR';

  const accountRecord = {
    id: data.id || generateUUID(),
    user_id: data.user_id || null,
    slug: data.slug || null,
    name: data.name.trim(),
    type: data.type,
    initial_balance: initialBalance,
    current_balance: initialBalance,
    currency,
    icon: data.icon || (data.type === 'cash' ? 'wallet' : data.type === 'credit_card' ? 'credit-card' : 'landmark'),
    color: data.color || '#0284C7',
    is_archived: Boolean(data.is_archived),
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    deleted_at: null,
    sync_version: typeof data.sync_version === 'number' ? data.sync_version : 1
  };

  await database.transaction('rw', database.accounts, database.offline_mutation_queue, async () => {
    await database.accounts.add(accountRecord);

    // Queue mutation for offline/sync engine
    if (database.offline_mutation_queue) {
      await database.offline_mutation_queue.add({
        id: generateUUID(),
        entity_type: 'account',
        entity_id: accountRecord.id,
        action: 'UPSERT',
        client_base_version: 0,
        payload: JSON.stringify(accountRecord),
        client_timestamp: now,
        retry_count: 0,
        status: 'pending'
      });
    }
  });

  return accountRecord;
}

/**
 * Retrieves accounts based on filter criteria.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {string|null} [options.userId] Filter by user ID
 * @param {boolean} [options.includeArchived=false] Include archived accounts
 * @param {boolean} [options.includeDeleted=false] Include soft-deleted accounts
 * @param {string|string[]} [options.type] Filter by account type
 * @returns {Promise<Array<object>>}
 */
export async function getAccounts(database = db, options = {}) {
  const {
    userId = undefined,
    includeArchived = false,
    includeDeleted = false,
    type = null
  } = options;

  let query = database.accounts.toCollection();

  const results = await query.filter((account) => {
    // Soft delete filter
    if (!includeDeleted && account.deleted_at !== null) {
      return false;
    }

    // User isolation filter
    if (userId !== undefined) {
      const accUserId = account.user_id || null;
      const targetUserId = userId || null;
      if (accUserId !== targetUserId) {
        return false;
      }
    }

    // Archive filter
    if (!includeArchived && account.is_archived) {
      return false;
    }

    // Type filter
    if (type) {
      if (Array.isArray(type)) {
        if (!type.includes(account.type)) return false;
      } else if (account.type !== type) {
        return false;
      }
    }

    return true;
  }).toArray();

  return results;
}

/**
 * Retrieves a single account by ID.
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {boolean} [options.includeDeleted=false]
 * @returns {Promise<object|null>}
 */
export async function getAccountById(accountId, database = db, { includeDeleted = false } = {}) {
  if (!accountId) {
    return null;
  }

  const account = await database.accounts.get(accountId);
  if (!account) {
    return null;
  }

  if (!includeDeleted && account.deleted_at !== null) {
    return null;
  }

  return account;
}

/**
 * Calculates the exact ledger-derived balance for an account.
 * Formula: initial_balance + Inflows - Outflows + TransfersIn - TransfersOut
 * Soft-deleted transactions (deleted_at !== null) are completely excluded.
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{
 *   accountId: string,
 *   initialBalance: number,
 *   inflows: number,
 *   outflows: number,
 *   transfersIn: number,
 *   transfersOut: number,
 *   calculatedBalance: number,
 *   cachedBalance: number,
 *   isDrifted: boolean,
 *   driftAmount: number
 * }>}
 */
export async function calculateAccountBalance(accountId, database = db) {
  if (!accountId) {
    throw new AccountValidationError('معرف الحساب مطلوب لحساب الرصيد', 'accountId');
  }

  const account = await database.accounts.get(accountId);
  if (!account) {
    throw new AccountNotFoundError(`الحساب ذو المعرف "${accountId}" غير موجود`, accountId);
  }

  const initialBalance = account.initial_balance || 0;
  let inflows = 0;
  let outflows = 0;
  let transfersIn = 0;
  let transfersOut = 0;

  if (database.transactions) {
    // Find all active transactions involving this account
    const transactions = await database.transactions
      .filter((tx) => {
        if (tx.deleted_at !== null) {
          return false;
        }
        return tx.account_id === accountId || tx.destination_account_id === accountId;
      })
      .toArray();

    for (const tx of transactions) {
      const amount = typeof tx.amount === 'number' && Number.isSafeInteger(tx.amount) ? tx.amount : 0;
      if (amount <= 0) continue;

      if (tx.type === 'income' && tx.account_id === accountId) {
        inflows += amount;
      } else if (tx.type === 'expense' && tx.account_id === accountId) {
        outflows += amount;
      } else if (tx.type === 'transfer') {
        if (tx.destination_account_id === accountId) {
          transfersIn += amount;
        }
        if (tx.account_id === accountId) {
          transfersOut += amount;
        }
      }
    }
  }

  const calculatedBalance = initialBalance + inflows - outflows + transfersIn - transfersOut;
  const cachedBalance = typeof account.current_balance === 'number' ? account.current_balance : initialBalance;
  const isDrifted = calculatedBalance !== cachedBalance;
  const driftAmount = calculatedBalance - cachedBalance;

  return {
    accountId,
    initialBalance,
    inflows,
    outflows,
    transfersIn,
    transfersOut,
    calculatedBalance,
    cachedBalance,
    isDrifted,
    driftAmount
  };
}

/**
 * Reconciles an account's cached `current_balance` against its transaction ledger.
 * Updates current_balance and increments sync_version if drift is detected.
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{ account: object, wasReconciled: boolean, driftAmount: number }>}
 */
export async function reconcileAccountBalance(accountId, database = db) {
  const calculation = await calculateAccountBalance(accountId, database);

  if (!calculation.isDrifted) {
    const current = await database.accounts.get(accountId);
    return {
      account: current,
      wasReconciled: false,
      driftAmount: 0
    };
  }

  const now = new Date().toISOString();
  let updatedAccount;

  await database.transaction('rw', database.accounts, database.offline_mutation_queue, async () => {
    const existing = await database.accounts.get(accountId);
    if (!existing) {
      throw new AccountNotFoundError(`الحساب ذو المعرف "${accountId}" غير موجود`, accountId);
    }

    const nextSyncVersion = (existing.sync_version || 1) + 1;
    updatedAccount = {
      ...existing,
      current_balance: calculation.calculatedBalance,
      updated_at: now,
      sync_version: nextSyncVersion
    };

    await database.accounts.put(updatedAccount);

    if (database.offline_mutation_queue) {
      await database.offline_mutation_queue.add({
        id: generateUUID(),
        entity_type: 'account',
        entity_id: accountId,
        action: 'UPSERT',
        client_base_version: existing.sync_version || 1,
        payload: JSON.stringify(updatedAccount),
        client_timestamp: now,
        retry_count: 0,
        status: 'pending'
      });
    }
  });

  return {
    account: updatedAccount,
    wasReconciled: true,
    driftAmount: calculation.driftAmount
  };
}

/**
 * Reconciles all non-deleted accounts for a user/guest context.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} [userId=null]
 * @returns {Promise<{ totalChecked: number, driftCount: number, reconciledAccounts: Array<object> }>}
 */
export async function reconcileAllAccountBalances(database = db, userId = undefined) {
  const accounts = await getAccounts(database, {
    userId,
    includeArchived: true,
    includeDeleted: false
  });

  const reconciledAccounts = [];
  let driftCount = 0;

  for (const account of accounts) {
    const result = await reconcileAccountBalance(account.id, database);
    if (result.wasReconciled) {
      driftCount++;
      reconciledAccounts.push(result);
    }
  }

  return {
    totalChecked: accounts.length,
    driftCount,
    reconciledAccounts
  };
}

/**
 * Updates an existing account.
 * If initial_balance is updated, recomputes current_balance accordingly.
 * Enforces currency immutability if transactions exist or initial balance is non-zero.
 *
 * @param {string} accountId
 * @param {object} updates
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>} Updated account record
 */
export async function updateAccount(accountId, updates, database = db) {
  if (!accountId) {
    throw new AccountValidationError('معرف الحساب مطلوب للتحديث', 'accountId');
  }

  validateAccountInput(updates, true);

  const existing = await database.accounts.get(accountId);
  if (!existing || existing.deleted_at !== null) {
    throw new AccountNotFoundError(`الحساب ذو المعرف "${accountId}" غير موجود`, accountId);
  }

  // Check Currency Locking Policy
  if (updates.currency !== undefined) {
    const newCurrency = updates.currency.trim().toUpperCase();
    if (newCurrency !== existing.currency) {
      // Check if transactions exist
      let hasTransactions = false;
      if (database.transactions) {
        const txCount = await database.transactions
          .filter((tx) => tx.deleted_at === null && (tx.account_id === accountId || tx.destination_account_id === accountId))
          .count();
        hasTransactions = txCount > 0;
      }

      if (hasTransactions || existing.initial_balance !== 0) {
        throw new CurrencyLockedError(
          'لا يمكن تغيير عملة الحساب بعد تسجيل معاملات أو عند وجود رصيد افتتاحي غير صفري (سياسة ثبات العملة)'
        );
      }
    }
  }

  const now = new Date().toISOString();
  let updatedRecord;

  await database.transaction('rw', database.accounts, database.transactions, database.offline_mutation_queue, async () => {
    const fresh = await database.accounts.get(accountId);
    if (!fresh || fresh.deleted_at !== null) {
      throw new AccountNotFoundError(`الحساب ذو المعرف "${accountId}" غير موجود`, accountId);
    }

    const nextSyncVersion = (fresh.sync_version || 1) + 1;
    updatedRecord = { ...fresh };

    if (updates.name !== undefined) {
      updatedRecord.name = updates.name.trim();
    }
    if (updates.type !== undefined) {
      updatedRecord.type = updates.type;
    }
    if (updates.icon !== undefined) {
      updatedRecord.icon = updates.icon;
    }
    if (updates.color !== undefined) {
      updatedRecord.color = updates.color;
    }
    if (updates.is_archived !== undefined) {
      updatedRecord.is_archived = Boolean(updates.is_archived);
    }
    if (updates.currency !== undefined) {
      updatedRecord.currency = updates.currency.trim().toUpperCase();
    }

    if (updates.initial_balance !== undefined && updates.initial_balance !== fresh.initial_balance) {
      updatedRecord.initial_balance = updates.initial_balance;
    }

    updatedRecord.updated_at = now;
    updatedRecord.sync_version = nextSyncVersion;

    // Save temporary state so calculateAccountBalance uses updated initial_balance
    await database.accounts.put(updatedRecord);

    // Recalculate true current_balance
    const calc = await calculateAccountBalance(accountId, database);
    updatedRecord.current_balance = calc.calculatedBalance;
    await database.accounts.put(updatedRecord);

    if (database.offline_mutation_queue) {
      await database.offline_mutation_queue.add({
        id: generateUUID(),
        entity_type: 'account',
        entity_id: accountId,
        action: 'UPSERT',
        client_base_version: fresh.sync_version || 1,
        payload: JSON.stringify(updatedRecord),
        client_timestamp: now,
        retry_count: 0,
        status: 'pending'
      });
    }
  });

  return updatedRecord;
}

/**
 * Soft-deletes an account.
 * Prevents deletion if active transactions exist, unless force=true or reassignAccountId is provided.
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options]
 * @param {boolean} [options.force=false]
 * @param {string|null} [options.reassignAccountId=null]
 * @returns {Promise<object>} Soft-deleted account record
 */
export async function deleteAccount(accountId, database = db, { force = false, reassignAccountId = null } = {}) {
  if (!accountId) {
    throw new AccountValidationError('معرف الحساب مطلوب للحذف', 'accountId');
  }

  const existing = await database.accounts.get(accountId);
  if (!existing || existing.deleted_at !== null) {
    throw new AccountNotFoundError(`الحساب ذو المعرف "${accountId}" غير موجود أو محذوف مسبقاً`, accountId);
  }

  const now = new Date().toISOString();
  let deletedRecord;

  await database.transaction(
    'rw',
    database.accounts,
    database.transactions,
    database.offline_mutation_queue,
    async () => {
      // Check active transactions
      let target = null;
      const activeTransactions = await database.transactions
        .filter((tx) => tx.deleted_at === null && (tx.account_id === accountId || tx.destination_account_id === accountId))
        .toArray();

      if (activeTransactions.length > 0) {
        if (reassignAccountId) {
          if (reassignAccountId === accountId) {
            throw new AccountValidationError('لا يمكن إعادة تعيين المعاملات لنفس الحساب المحذوف', 'reassignAccountId');
          }

          target = await database.accounts.get(reassignAccountId);
          if (!target || target.deleted_at !== null) {
            throw new AccountNotFoundError(`الحساب الهدف "${reassignAccountId}" لإعادة التعيين غير موجود`, reassignAccountId);
          }

          // Reassign all active transactions to target
          for (const tx of activeTransactions) {
            const txUpdates = {
              updated_at: now,
              sync_version: (tx.sync_version || 1) + 1
            };
            if (tx.account_id === accountId) {
              txUpdates.account_id = reassignAccountId;
            }
            if (tx.destination_account_id === accountId) {
              txUpdates.destination_account_id = reassignAccountId;
            }
            await database.transactions.update(tx.id, txUpdates);
          }
        } else if (!force) {
          throw new AccountInUseError(
            `لا يمكن حذف الحساب لوجود ${activeTransactions.length} معاملة نشطة مرتبطة به. يرجى نقل المعاملات إلى حساب آخر أولاً أو تفعيل خيار الحذف الإجباري.`,
            activeTransactions.length
          );
        }
      }

      const nextSyncVersion = (existing.sync_version || 1) + 1;
      deletedRecord = {
        ...existing,
        deleted_at: now,
        updated_at: now,
        sync_version: nextSyncVersion
      };

      await database.accounts.put(deletedRecord);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'account',
          entity_id: accountId,
          action: 'DELETE',
          client_base_version: existing.sync_version || 1,
          payload: JSON.stringify(deletedRecord),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      // If transactions were reassigned, reconcile target account balance
      if (reassignAccountId) {
        const targetCalc = await calculateAccountBalance(reassignAccountId, database);
        await database.accounts.update(reassignAccountId, {
          current_balance: targetCalc.calculatedBalance,
          updated_at: now,
          sync_version: (target.sync_version || 1) + 1
        });
      }
    }
  );

  return deletedRecord;
}

/**
 * Reassigns all transactions referencing fromAccountId to toAccountId in an atomic transaction.
 *
 * @param {string} fromAccountId
 * @param {string} toAccountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<number>} Number of transactions reassigned
 */
export async function reassignAccountTransactions(fromAccountId, toAccountId, database = db) {
  if (!fromAccountId || !toAccountId) {
    throw new AccountValidationError('معرف الحساب المصدر والهدف مطلوبان لإعادة التعيين');
  }

  if (fromAccountId === toAccountId) {
    return 0;
  }

  const targetAccount = await database.accounts.get(toAccountId);
  if (!targetAccount || targetAccount.deleted_at !== null) {
    throw new AccountNotFoundError(`الحساب الهدف "${toAccountId}" غير موجود أو محذوف`, toAccountId);
  }

  let count = 0;
  const now = new Date().toISOString();

  await database.transaction('rw', database.accounts, database.transactions, async () => {
    const transactions = await database.transactions
      .filter((tx) => tx.deleted_at === null && (tx.account_id === fromAccountId || tx.destination_account_id === fromAccountId))
      .toArray();

    count = transactions.length;

    for (const tx of transactions) {
      const updates = {
        updated_at: now,
        sync_version: (tx.sync_version || 1) + 1
      };
      if (tx.account_id === fromAccountId) {
        updates.account_id = toAccountId;
      }
      if (tx.destination_account_id === fromAccountId) {
        updates.destination_account_id = toAccountId;
      }
      await database.transactions.update(tx.id, updates);
    }

    // Reconcile both accounts
    const fromCalc = await calculateAccountBalance(fromAccountId, database);
    await database.accounts.update(fromAccountId, {
      current_balance: fromCalc.calculatedBalance,
      updated_at: now
    });

    const toCalc = await calculateAccountBalance(toAccountId, database);
    await database.accounts.update(toAccountId, {
      current_balance: toCalc.calculatedBalance,
      updated_at: now
    });
  });

  return count;
}

/**
 * Archives an account (hides it from default pickers without deleting).
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>}
 */
export async function archiveAccount(accountId, database = db) {
  return await updateAccount(accountId, { is_archived: true }, database);
}

/**
 * Unarchives an account.
 *
 * @param {string} accountId
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<object>}
 */
export async function unarchiveAccount(accountId, database = db) {
  return await updateAccount(accountId, { is_archived: false }, database);
}

/**
 * Checks if default accounts have been seeded for a user/guest context.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<boolean>}
 */
export async function isAccountsSeeded(database = db, userId = null) {
  const count = await database.accounts
    .filter((acc) => (acc.user_id || null) === (userId || null) && acc.deleted_at === null)
    .count();
  return count > 0;
}

/**
 * Seeds default accounts (Cash, Bank) for new user or guest session.
 * Idempotent: Does not insert duplicates if accounts already exist.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @param {string} currency ISO 4217 currency code
 * @returns {Promise<Array<object>>} Seeded or existing accounts
 */
export async function seedDefaultAccounts(database = db, userId = null, currency = 'SAR') {
  return await database.transaction('rw', database.accounts, database.offline_mutation_queue, async () => {
    const existing = await database.accounts
      .filter((acc) => (acc.user_id || null) === (userId || null) && acc.deleted_at === null)
      .toArray();

    if (existing.length > 0) {
      return existing;
    }

    const now = new Date().toISOString();
    const seeded = [];

    for (const def of DEFAULT_ACCOUNTS) {
      const record = {
        id: generateUUID(),
        user_id: userId || null,
        slug: def.slug,
        name: def.name,
        type: def.type,
        initial_balance: def.initial_balance || 0,
        current_balance: def.initial_balance || 0,
        currency,
        icon: def.icon,
        color: def.color,
        is_archived: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      };

      await database.accounts.add(record);

      if (database.offline_mutation_queue) {
        await database.offline_mutation_queue.add({
          id: generateUUID(),
          entity_type: 'account',
          entity_id: record.id,
          action: 'UPSERT',
          client_base_version: 0,
          payload: JSON.stringify(record),
          client_timestamp: now,
          retry_count: 0,
          status: 'pending'
        });
      }

      seeded.push(record);
    }

    return seeded;
  });
}

/**
 * Computes top-level financial metrics according to Section 5 of docs/financial-rules.md:
 * - Available Funds (Liquid Assets): Positive balances in Cash, Bank, Digital Wallets, Custom
 * - Total Liabilities (Debt): Outstanding credit card liabilities + negative balances
 * - Net Financial Position: Available Funds - Total Liabilities
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {string|null} userId
 * @returns {Promise<{
 *   availableFunds: number,
 *   totalLiabilities: number,
 *   netPosition: number,
 *   accountsCount: number,
 *   breakdownByType: Record<string, number>
 * }>}
 */
export async function getFinancialPositionMetrics(database = db, userId = undefined) {
  const accounts = await getAccounts(database, {
    userId,
    includeArchived: false,
    includeDeleted: false
  });

  let availableFunds = 0;
  let totalLiabilities = 0;
  const breakdownByType = {
    cash: 0,
    bank: 0,
    credit_card: 0,
    digital_wallet: 0,
    custom: 0
  };

  for (const account of accounts) {
    const balance = typeof account.current_balance === 'number' ? account.current_balance : 0;
    breakdownByType[account.type] = (breakdownByType[account.type] || 0) + balance;

    if (account.type === 'credit_card') {
      // For credit cards, negative balance represents debt owed
      if (balance < 0) {
        totalLiabilities += Math.abs(balance);
      }
    } else {
      // Asset accounts
      if (balance > 0) {
        availableFunds += balance;
      } else if (balance < 0) {
        // Overdraft liability
        totalLiabilities += Math.abs(balance);
      }
    }
  }

  const netPosition = availableFunds - totalLiabilities;

  return {
    availableFunds,
    totalLiabilities,
    netPosition,
    accountsCount: accounts.length,
    breakdownByType
  };
}
