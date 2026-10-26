/**
 * @file currencyLock.js
 * @description Currency Configuration & Immutability Lock Engine (F014).
 *
 * Implements the Single Base Currency Principle and Currency Immutability Policy:
 * - Base currency is configurable during initial onboarding or in Settings before financial records exist.
 * - Once any transactions or non-zero account balances exist, the currency is permanently locked
 *   against direct modification to prevent arithmetic and accounting distortion across ledgers.
 *
 * @see docs/financial-rules.md (Section 6: Currency Modification Policy)
 * @see project-summary.md (FR-17 & Base Currency Invariants)
 * @see DECISIONS.md (ADR-002: Monetary Precision)
 */

import { db } from '../db/db.js';
import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  getCurrency,
} from '../utils/currency.js';
import { calculateAccountBalance } from './account.js';

/**
 * Setting key used in IndexedDB settings table
 */
export const SETTING_KEY_BASE_CURRENCY = 'base_currency';

/**
 * Custom error thrown when an invalid currency code is provided
 */
export class CurrencyValidationError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'CurrencyValidationError';
    this.code = 'CURRENCY_VALIDATION_ERROR';
    this.currencyCode = code;
  }
}

/**
 * Custom error thrown when attempting to modify currency while locked
 */
export class CurrencyLockedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CurrencyLockedError';
    this.code = 'CURRENCY_LOCKED';
    this.details = details;
  }
}

/**
 * Infers an initial default currency based on the environment / locale.
 * Falls back safely to DEFAULT_CURRENCY_CODE ('SAR').
 *
 * @returns {string} ISO 4217 Currency Code
 */
export function inferInitialCurrency() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function') {
      const resolvedOptions = new Intl.NumberFormat().resolvedOptions();
      const locale = (resolvedOptions.locale || '').toLowerCase();

      // Country / locale mappings for Middle East / North Africa / Common Regions
      if (locale.includes('-sa') || locale.startsWith('ar-sa')) return 'SAR';
      if (locale.includes('-ae') || locale.startsWith('ar-ae')) return 'AED';
      if (locale.includes('-eg') || locale.startsWith('ar-eg')) return 'EGP';
      if (locale.includes('-kw') || locale.startsWith('ar-kw')) return 'KWD';
      if (locale.includes('-qa') || locale.startsWith('ar-qa')) return 'QAR';
      if (locale.includes('-bh') || locale.startsWith('ar-bh')) return 'BHD';
      if (locale.includes('-om') || locale.startsWith('ar-om')) return 'OMR';
      if (locale.includes('-jo') || locale.startsWith('ar-jo')) return 'JOD';
      if (locale.includes('-il') || locale.includes('-ps') || locale.startsWith('he')) return 'ILS';
      if (locale.includes('-us') || locale.startsWith('en-us')) return 'USD';
      if (locale.includes('-gb') || locale.startsWith('en-gb')) return 'GBP';
      if (locale.startsWith('de') || locale.startsWith('fr') || locale.startsWith('es') || locale.startsWith('it')) return 'EUR';
    }
  } catch {
    // Ignore error in non-browser environments and use default
  }

  return DEFAULT_CURRENCY_CODE;
}

/**
 * Retrieves the currently configured base currency from the settings table.
 * If not yet explicitly set, falls back to DEFAULT_CURRENCY_CODE ('SAR').
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<string>} ISO 4217 Currency Code (e.g., 'SAR', 'USD')
 */
export async function getBaseCurrency(database = db) {
  if (!database || !database.settings) {
    return DEFAULT_CURRENCY_CODE;
  }

  const record = await database.settings.get(SETTING_KEY_BASE_CURRENCY);
  if (record && record.value && typeof record.value === 'string') {
    const code = record.value.trim().toUpperCase();
    if (CURRENCIES[code]) {
      return code;
    }
  }

  return DEFAULT_CURRENCY_CODE;
}

/**
 * Inspects database records to determine if the base currency is locked.
 *
 * Immutability Invariant:
 * Locked if:
 * 1. Any transactions exist in the database (active or soft-deleted historical records).
 * 2. Any active account has a non-zero initial balance (initial_balance !== 0).
 * 3. Any active account has a non-zero calculated ledger balance.
 *
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @returns {Promise<{
 *   isLocked: boolean,
 *   currency: string,
 *   reason: 'HAS_TRANSACTIONS' | 'NON_ZERO_BALANCE' | null,
 *   transactionCount: number,
 *   activeTransactionCount: number,
 *   nonZeroAccountCount: number,
 *   explanationAr: string
 * }>}
 */
export async function checkCurrencyLockStatus(database = db) {
  const currentCurrency = await getBaseCurrency(database);

  if (!database) {
    return {
      isLocked: false,
      currency: currentCurrency,
      reason: null,
      transactionCount: 0,
      activeTransactionCount: 0,
      nonZeroAccountCount: 0,
      explanationAr: 'العملة الأساسية قابلة للتعديل بحرية لعدم وجود بيانات مالية بعد.'
    };
  }

  // 1. Check transactions count
  let totalTransactionCount = 0;
  let activeTransactionCount = 0;

  if (database.transactions) {
    totalTransactionCount = await database.transactions.count();
    activeTransactionCount = await database.transactions
      .filter((tx) => tx.deleted_at === null)
      .count();
  }

  if (totalTransactionCount > 0) {
    return {
      isLocked: true,
      currency: currentCurrency,
      reason: 'HAS_TRANSACTIONS',
      transactionCount: totalTransactionCount,
      activeTransactionCount,
      nonZeroAccountCount: 0,
      explanationAr: `العملة الأساسية مقفلة لوجود ${totalTransactionCount} معاملة مسجلة في السجل المالي. تغيير العملة دون تحويل أسعار الصرف يؤدي لتشويه السجلات المحاسبية.`
    };
  }

  // 2. Check accounts initial balances and calculated balances
  let nonZeroAccountCount = 0;

  if (database.accounts) {
    const activeAccounts = await database.accounts
      .filter((acc) => acc.deleted_at === null)
      .toArray();

    for (const acc of activeAccounts) {
      if (acc.initial_balance !== 0) {
        nonZeroAccountCount += 1;
        continue;
      }

      // Check ledger balance as well
      const balanceResult = await calculateAccountBalance(acc.id, database);
      if (balanceResult && balanceResult.calculatedBalance !== 0) {
        nonZeroAccountCount += 1;
      }
    }
  }

  if (nonZeroAccountCount > 0) {
    return {
      isLocked: true,
      currency: currentCurrency,
      reason: 'NON_ZERO_BALANCE',
      transactionCount: 0,
      activeTransactionCount: 0,
      nonZeroAccountCount,
      explanationAr: `العملة الأساسية مقفلة لوجود أرصدة مالية غير صفرية في ${nonZeroAccountCount} حساب. يجب تصفير الأرصدة قبل تغيير العملة الأساسية.`
    };
  }

  // Currency is completely unlocked
  return {
    isLocked: false,
    currency: currentCurrency,
    reason: null,
    transactionCount: 0,
    activeTransactionCount: 0,
    nonZeroAccountCount: 0,
    explanationAr: 'العملة الأساسية قابلة للتحديد بحرية لعدم وجود معاملات أو أرصدة افتتاحية.'
  };
}

/**
 * Sets or updates the base currency for the application.
 *
 * Rules:
 * - Must be a valid supported ISO 4217 currency.
 * - If currency is locked, throws CurrencyLockedError.
 * - Updates IndexedDB settings table atomically.
 * - Synchronizes any zero-balance starter accounts to the new currency.
 *
 * @param {string} currencyCode ISO 4217 Currency Code (e.g. 'SAR', 'USD', 'EUR')
 * @param {import('../db/db.js').ExpenseDatabase} database
 * @param {object} [options={}]
 * @param {boolean} [options.force=false] Force override (internal admin/migration only)
 * @returns {Promise<{
 *   success: boolean,
 *   currency: string,
 *   metadata: object
 * }>}
 */
export async function setBaseCurrency(currencyCode, database = db, options = {}) {
  if (!currencyCode || typeof currencyCode !== 'string') {
    throw new CurrencyValidationError('رمز العملة مطلوب ولا يمكن أن يكون فارغاً', currencyCode);
  }

  const normalizedCode = currencyCode.trim().toUpperCase();
  if (!CURRENCIES[normalizedCode]) {
    throw new CurrencyValidationError(
      `رمز العملة "${currencyCode}" غير مدعوم في النظام. يرجى اختيار عملة مدعومة.`,
      currencyCode
    );
  }
  const currencyMeta = getCurrency(normalizedCode);

  // Check Lock Status unless explicitly forced
  if (!options.force) {
    const lockStatus = await checkCurrencyLockStatus(database);
    if (lockStatus.isLocked) {
      throw new CurrencyLockedError(
        'لا يمكن تعديل العملة الأساسية بعد تسجيل معاملات أو عند وجود أرصدة مالية غير صفرية لحماية دقة الحسابات ومنع تضارب الأرقام.',
        {
          currentCurrency: lockStatus.currency,
          requestedCurrency: normalizedCode,
          reason: lockStatus.reason,
          explanationAr: lockStatus.explanationAr
        }
      );
    }
  }

  const now = new Date().toISOString();

  // Atomically persist settings and update any existing empty starter accounts
  await database.transaction('rw', database.settings, database.accounts, async () => {
    // 1. Save to settings
    await database.settings.put({
      key: SETTING_KEY_BASE_CURRENCY,
      value: normalizedCode,
      updated_at: now
    });

    // 2. Align empty starter accounts that have 0 balance
    if (database.accounts) {
      const accounts = await database.accounts.toArray();
      for (const acc of accounts) {
        if (acc.initial_balance === 0 && acc.currency !== normalizedCode) {
          await database.accounts.update(acc.id, {
            currency: normalizedCode,
            updated_at: now
          });
        }
      }
    }
  });

  return {
    success: true,
    currency: normalizedCode,
    metadata: currencyMeta
  };
}
