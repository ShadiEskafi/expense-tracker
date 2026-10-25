import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import {
  getBaseCurrency,
  checkCurrencyLockStatus,
  setBaseCurrency,
  inferInitialCurrency,
  SETTING_KEY_BASE_CURRENCY,
  CurrencyValidationError,
  CurrencyLockedError
} from './currencyLock.js';
import { seedDefaultAccounts } from './account.js';
import { seedDefaultCategories } from './category.js';
import { createTransaction } from './transaction.js';

describe('Currency Configuration & Immutability Lock Service (F014)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`TestCurrencyLock_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    await testDb.open();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('1. getBaseCurrency', () => {
    it('returns default currency SAR when database settings table is empty', async () => {
      const currency = await getBaseCurrency(testDb);
      expect(currency).toBe('SAR');
    });

    it('returns the configured base currency when set in settings table', async () => {
      await testDb.settings.put({
        key: SETTING_KEY_BASE_CURRENCY,
        value: 'KWD',
        updated_at: new Date().toISOString()
      });

      const currency = await getBaseCurrency(testDb);
      expect(currency).toBe('KWD');
    });

    it('normalizes lowercase currency codes to uppercase', async () => {
      await testDb.settings.put({
        key: SETTING_KEY_BASE_CURRENCY,
        value: 'usd',
        updated_at: new Date().toISOString()
      });

      const currency = await getBaseCurrency(testDb);
      expect(currency).toBe('USD');
    });

    it('falls back to SAR if an unrecognized code was saved in settings', async () => {
      await testDb.settings.put({
        key: SETTING_KEY_BASE_CURRENCY,
        value: 'INVALID_XYZ',
        updated_at: new Date().toISOString()
      });

      const currency = await getBaseCurrency(testDb);
      expect(currency).toBe('SAR');
    });
  });

  describe('2. inferInitialCurrency', () => {
    it('returns a valid supported currency code', () => {
      const inferred = inferInitialCurrency();
      expect(['SAR', 'AED', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'USD', 'EUR', 'GBP']).toContain(inferred);
    });
  });

  describe('3. checkCurrencyLockStatus', () => {
    it('reports unlocked when database is pristine (no accounts, no transactions)', async () => {
      const status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(false);
      expect(status.currency).toBe('SAR');
      expect(status.reason).toBeNull();
      expect(status.transactionCount).toBe(0);
      expect(status.nonZeroAccountCount).toBe(0);
      expect(status.explanationAr).toContain('قابلة للتحديد بحرية');
    });

    it('reports unlocked when default accounts are seeded with 0 initial balance and no transactions', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      const status = await checkCurrencyLockStatus(testDb);

      expect(status.isLocked).toBe(false);
      expect(status.reason).toBeNull();
      expect(status.nonZeroAccountCount).toBe(0);
      expect(status.transactionCount).toBe(0);
    });

    it('locks currency when at least one account has a non-zero initial balance', async () => {
      await testDb.accounts.add({
        id: 'acc-1',
        name: 'حساب بنكي',
        type: 'bank',
        currency: 'SAR',
        initial_balance: 50000, // 500.00 SAR
        is_archived: 0,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_version: 1
      });

      const status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(true);
      expect(status.reason).toBe('NON_ZERO_BALANCE');
      expect(status.nonZeroAccountCount).toBe(1);
      expect(status.explanationAr).toContain('أرصدة مالية غير صفرية');
    });

    it('locks currency when an active transaction exists', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      await seedDefaultCategories(testDb, null);

      const accounts = await testDb.accounts.toArray();
      const categories = await testDb.categories.toArray();
      const expenseCat = categories.find((c) => c.type === 'expense');

      await createTransaction({
        account_id: accounts[0].id,
        category_id: expenseCat.id,
        type: 'expense',
        amount: 2500, // 25.00 SAR
        date: '2026-10-25'
      }, testDb);

      const status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(true);
      expect(status.reason).toBe('HAS_TRANSACTIONS');
      expect(status.transactionCount).toBe(1);
      expect(status.activeTransactionCount).toBe(1);
      expect(status.explanationAr).toContain('معاملة مسجلة');
    });

    it('locks currency even when transactions are soft-deleted (historical ledger records exist)', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      await seedDefaultCategories(testDb, null);

      const accounts = await testDb.accounts.toArray();
      const categories = await testDb.categories.toArray();
      const expenseCat = categories.find((c) => c.type === 'expense');

      const tx = await createTransaction({
        account_id: accounts[0].id,
        category_id: expenseCat.id,
        type: 'expense',
        amount: 1500,
        date: '2026-10-25'
      }, testDb);

      // Soft delete transaction
      await testDb.transactions.update(tx.id, {
        deleted_at: new Date().toISOString()
      });

      const status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(true);
      expect(status.reason).toBe('HAS_TRANSACTIONS');
      expect(status.transactionCount).toBe(1);
      expect(status.activeTransactionCount).toBe(0);
    });
  });

  describe('4. setBaseCurrency', () => {
    it('successfully sets base currency when database is unlocked', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');

      const result = await setBaseCurrency('AED', testDb);
      expect(result.success).toBe(true);
      expect(result.currency).toBe('AED');
      expect(result.metadata.symbolAr).toBe('د.إ');

      const saved = await getBaseCurrency(testDb);
      expect(saved).toBe('AED');

      // Zero-balance starter accounts should also align their currency field
      const accounts = await testDb.accounts.toArray();
      expect(accounts.every((a) => a.currency === 'AED')).toBe(true);
    });

    it('rejects invalid or empty currency codes with CurrencyValidationError', async () => {
      await expect(setBaseCurrency('', testDb)).rejects.toThrow(CurrencyValidationError);
      await expect(setBaseCurrency(null, testDb)).rejects.toThrow(CurrencyValidationError);
      await expect(setBaseCurrency('FAKE_COIN', testDb)).rejects.toThrow(CurrencyValidationError);
    });

    it('throws CurrencyLockedError when attempting to change currency with active transactions', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      await seedDefaultCategories(testDb, null);

      const accounts = await testDb.accounts.toArray();
      const categories = await testDb.categories.toArray();
      const expenseCat = categories.find((c) => c.type === 'expense');

      await createTransaction({
        account_id: accounts[0].id,
        category_id: expenseCat.id,
        type: 'expense',
        amount: 3000,
        date: '2026-10-25'
      }, testDb);

      await expect(setBaseCurrency('USD', testDb)).rejects.toThrow(CurrencyLockedError);

      try {
        await setBaseCurrency('USD', testDb);
      } catch (err) {
        expect(err.name).toBe('CurrencyLockedError');
        expect(err.code).toBe('CURRENCY_LOCKED');
        expect(err.details.currentCurrency).toBe('SAR');
        expect(err.details.requestedCurrency).toBe('USD');
        expect(err.details.reason).toBe('HAS_TRANSACTIONS');
        expect(err.details.explanationAr).toBeDefined();
      }

      // Base currency must remain intact
      const current = await getBaseCurrency(testDb);
      expect(current).toBe('SAR');
    });

    it('throws CurrencyLockedError when attempting to change currency with non-zero initial balance', async () => {
      await testDb.accounts.add({
        id: 'acc-wallet',
        name: 'كاش',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 1000,
        is_archived: 0,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_version: 1
      });

      await expect(setBaseCurrency('EUR', testDb)).rejects.toThrow(CurrencyLockedError);

      const current = await getBaseCurrency(testDb);
      expect(current).toBe('SAR');
    });

    it('allows forced currency change if options.force is set to true', async () => {
      await testDb.accounts.add({
        id: 'acc-forced',
        name: 'حساب',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 1000,
        is_archived: 0,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_version: 1
      });

      const res = await setBaseCurrency('USD', testDb, { force: true });
      expect(res.success).toBe(true);
      expect(res.currency).toBe('USD');

      const saved = await getBaseCurrency(testDb);
      expect(saved).toBe('USD');
    });
  });
});
