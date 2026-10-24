import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import { createAccount } from './account.js';
import { createCategory } from './category.js';
import {
  TRANSACTION_TYPES,
  TransactionValidationError,
  TransactionNotFoundError,
  generateUUID,
  isValidIsoDate,
  normalizeTags,
  createTransaction,
  createExpense,
  createIncome,
  getTransactionById,
  getTransactions,
  getTransactionsCount,
  getTransactionsSummary,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  permanentDeleteTransaction
} from './transaction.js';

describe('Expense & Income Transaction CRUD (F005)', () => {
  let testDb;
  let testAccount;
  let secondAccount;
  let expenseCategory;
  let incomeCategory;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`test-tx-db-${Date.now()}-${Math.random()}`);

    // Pre-create active test accounts
    testAccount = await createAccount(
      {
        name: 'حساب تجريبي رئيسي',
        type: 'bank',
        initial_balance: 50000, // 500.00 SAR
        currency: 'SAR'
      },
      testDb
    );

    secondAccount = await createAccount(
      {
        name: 'محفظة نقدية',
        type: 'cash',
        initial_balance: 10000, // 100.00 SAR
        currency: 'SAR'
      },
      testDb
    );

    // Pre-create active test categories
    expenseCategory = await createCategory(
      {
        name: 'طعام ومطاعم',
        type: 'expense',
        icon: 'utensils',
        color: '#F97316'
      },
      testDb
    );

    incomeCategory = await createCategory(
      {
        name: 'راتب شهري',
        type: 'income',
        icon: 'briefcase',
        color: '#10B981'
      },
      testDb
    );
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. Constants, Helpers & Normalizers', () => {
    it('defines the allowed transaction types (expense, income, transfer)', () => {
      expect(TRANSACTION_TYPES).toEqual(['expense', 'income', 'transfer']);
    });

    it('generates valid RFC4122 v4 UUIDs', () => {
      const u1 = generateUUID();
      const u2 = generateUUID();
      expect(u1).not.toBe(u2);
      expect(u1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('validates ISO date format YYYY-MM-DD correctly', () => {
      expect(isValidIsoDate('2026-10-24')).toBe(true);
      expect(isValidIsoDate('2026-02-28')).toBe(true);
      expect(isValidIsoDate('2026-02-31')).toBe(false); // Non-existent date
      expect(isValidIsoDate('2026-13-01')).toBe(false); // Invalid month
      expect(isValidIsoDate('2026-00-10')).toBe(false); // Invalid month
      expect(isValidIsoDate('2026/10/24')).toBe(false); // Wrong separator
      expect(isValidIsoDate('invalid-string')).toBe(false);
      expect(isValidIsoDate(null)).toBe(false);
      expect(isValidIsoDate(undefined)).toBe(false);
      expect(isValidIsoDate(12345)).toBe(false);
    });

    it('normalizes tags by trimming, dropping empty strings and deduplicating', () => {
      expect(normalizeTags(null)).toEqual([]);
      expect(normalizeTags(undefined)).toEqual([]);
      expect(normalizeTags(['  غداء  ', 'عمل', 'غداء', ''])).toEqual(['غداء', 'عمل']);
      expect(normalizeTags('قهوة, مقهى, قهوة,  سفر ')).toEqual(['قهوة', 'مقهى', 'سفر']);
    });
  });

  describe('2. Input Validation & Invariants', () => {
    it('throws TransactionValidationError if payload is null or not an object', async () => {
      await expect(createTransaction(null, testDb)).rejects.toThrow(TransactionValidationError);
      await expect(createTransaction(undefined, testDb)).rejects.toThrow(TransactionValidationError);
      await expect(createTransaction('string', testDb)).rejects.toThrow(TransactionValidationError);
    });

    it('throws TransactionValidationError if type is missing or invalid', async () => {
      await expect(
        createTransaction(
          {
            amount: 1000,
            date: '2026-10-24',
            account_id: testAccount.id,
            category_id: expenseCategory.id,
            type: 'invalid_type'
          },
          testDb
        )
      ).rejects.toThrow('نوع المعاملة غير صالح');
    });

    it('throws TransactionValidationError if amount is non-positive or not a safe integer', async () => {
      const base = {
        type: 'expense',
        date: '2026-10-24',
        account_id: testAccount.id,
        category_id: expenseCategory.id
      };

      await expect(createTransaction({ ...base, amount: 0 }, testDb)).rejects.toThrow(
        TransactionValidationError
      );
      await expect(createTransaction({ ...base, amount: -500 }, testDb)).rejects.toThrow(
        TransactionValidationError
      );
      await expect(createTransaction({ ...base, amount: 15.5 }, testDb)).rejects.toThrow(
        TransactionValidationError
      );
      await expect(createTransaction({ ...base, amount: NaN }, testDb)).rejects.toThrow(
        TransactionValidationError
      );
      await expect(createTransaction({ ...base, amount: '500' }, testDb)).rejects.toThrow(
        TransactionValidationError
      );
    });

    it('throws TransactionValidationError if date is missing or invalid', async () => {
      const base = {
        type: 'expense',
        amount: 1000,
        account_id: testAccount.id,
        category_id: expenseCategory.id
      };

      await expect(createTransaction({ ...base, date: 'invalid-date' }, testDb)).rejects.toThrow(
        'تاريخ المعاملة غير صالح'
      );
      await expect(createTransaction({ ...base, date: '' }, testDb)).rejects.toThrow(
        'تاريخ المعاملة غير صالح'
      );
      await expect(createTransaction({ ...base, date: '2026-02-31' }, testDb)).rejects.toThrow(
        'تاريخ المعاملة غير صالح'
      );
    });

    it('throws TransactionValidationError if account_id does not exist or is soft-deleted', async () => {
      const base = {
        type: 'expense',
        amount: 1000,
        date: '2026-10-24',
        category_id: expenseCategory.id
      };

      await expect(createTransaction({ ...base, account_id: 'non-existent-id' }, testDb)).rejects.toThrow(
        'الحساب المحدد غير موجود أو محذوف'
      );

      // Soft-delete the account
      await testDb.accounts.update(testAccount.id, { deleted_at: new Date().toISOString() });
      await expect(createTransaction({ ...base, account_id: testAccount.id }, testDb)).rejects.toThrow(
        'الحساب المحدد غير موجود أو محذوف'
      );
    });

    it('throws TransactionValidationError if category_id does not exist or is soft-deleted', async () => {
      const base = {
        type: 'expense',
        amount: 1000,
        date: '2026-10-24',
        account_id: testAccount.id
      };

      await expect(createTransaction({ ...base, category_id: 'non-existent-cat' }, testDb)).rejects.toThrow(
        'التصنيف المحدد غير موجود أو محذوف'
      );

      // Soft-delete category
      await testDb.categories.update(expenseCategory.id, { deleted_at: new Date().toISOString() });
      await expect(createTransaction({ ...base, category_id: expenseCategory.id }, testDb)).rejects.toThrow(
        'التصنيف المحدد غير موجود أو محذوف'
      );
    });

    it('throws TransactionValidationError if category type does not match transaction type', async () => {
      // Trying to log an expense with an income category
      await expect(
        createExpense(
          {
            amount: 2500,
            date: '2026-10-24',
            account_id: testAccount.id,
            category_id: incomeCategory.id // Income category for expense!
          },
          testDb
        )
      ).rejects.toThrow('نوع التصنيف (إيراد) لا يتطابق مع نوع المعاملة (مصروف)');

      // Trying to log income with an expense category
      await expect(
        createIncome(
          {
            amount: 5000,
            date: '2026-10-24',
            account_id: testAccount.id,
            category_id: expenseCategory.id // Expense category for income!
          },
          testDb
        )
      ).rejects.toThrow('نوع التصنيف (مصروف) لا يتطابق مع نوع المعاملة (إيراد)');
    });

    it('throws TransactionValidationError if destination_account_id is provided for expense or income', async () => {
      await expect(
        createExpense(
          {
            amount: 1500,
            date: '2026-10-24',
            account_id: testAccount.id,
            category_id: expenseCategory.id,
            destination_account_id: secondAccount.id
          },
          testDb
        )
      ).rejects.toThrow('لا يمكن تحديد حساب وجهة لمعاملات المصروفات أو الإيرادات');
    });
  });

  describe('3. Expense Recording & Atomic Account Balance Deduction', () => {
    it('creates an expense transaction and atomically reduces account current_balance', async () => {
      // Starting balance: 50000 minor units
      const initialAcc = await testDb.accounts.get(testAccount.id);
      expect(initialAcc.current_balance).toBe(50000);

      const expense = await createExpense(
        {
          amount: 7500, // 75.00 SAR
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id,
          notes: 'عشاء مع العائلة في مطعم',
          tags: ['عشاء', 'مطاعم'],
          payment_method: 'card'
        },
        testDb
      );

      expect(expense.id).toBeDefined();
      expect(expense.type).toBe('expense');
      expect(expense.amount).toBe(7500);
      expect(expense.destination_account_id).toBeNull();
      expect(expense.deleted_at).toBeNull();
      expect(expense.sync_version).toBe(1);
      expect(expense.tags).toEqual(['عشاء', 'مطاعم']);

      // Check account balance in database
      const updatedAcc = await testDb.accounts.get(testAccount.id);
      expect(updatedAcc.current_balance).toBe(50000 - 7500); // 42500

      // Check offline mutation queue
      const mutations = await testDb.offline_mutation_queue.toArray();
      const txMutation = mutations.find((m) => m.entity_type === 'transaction' && m.entity_id === expense.id);
      expect(txMutation).toBeDefined();
      expect(txMutation.action).toBe('UPSERT');

      const accMutation = mutations.find((m) => m.entity_type === 'account' && m.entity_id === testAccount.id);
      expect(accMutation).toBeDefined();
    });
  });

  describe('4. Income Recording & Atomic Account Balance Addition', () => {
    it('creates an income transaction and atomically increases account current_balance', async () => {
      const initialAcc = await testDb.accounts.get(testAccount.id);
      expect(initialAcc.current_balance).toBe(50000);

      const income = await createIncome(
        {
          amount: 250000, // 2,500.00 SAR
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: incomeCategory.id,
          notes: 'مكافأة شهرية',
          tags: ['عمل', 'مكافأة']
        },
        testDb
      );

      expect(income.id).toBeDefined();
      expect(income.type).toBe('income');
      expect(income.amount).toBe(250000);
      expect(income.destination_account_id).toBeNull();
      expect(income.deleted_at).toBeNull();

      // Account balance increased
      const updatedAcc = await testDb.accounts.get(testAccount.id);
      expect(updatedAcc.current_balance).toBe(50000 + 250000); // 300000
    });
  });

  describe('5. Updating Transactions & Atomic Balance Adjustments', () => {
    it('throws TransactionNotFoundError if transaction to update does not exist or is deleted', async () => {
      await expect(
        updateTransaction('non-existent-tx', { amount: 2000 }, testDb)
      ).rejects.toThrow(TransactionNotFoundError);
    });

    it('adjusts account balance atomically when transaction amount is increased', async () => {
      const expense = await createExpense(
        {
          amount: 5000, // 50.00 SAR
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(45000);

      // Increase expense from 5000 to 9000 (+4000 deduction)
      const updated = await updateTransaction(expense.id, { amount: 9000 }, testDb);
      expect(updated.amount).toBe(9000);
      expect(updated.sync_version).toBe(2);

      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(41000);
    });

    it('adjusts account balance atomically when transaction amount is decreased', async () => {
      const expense = await createExpense(
        {
          amount: 8000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(42000);

      // Decrease expense from 8000 to 3000 (+5000 restored)
      await updateTransaction(expense.id, { amount: 3000 }, testDb);

      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(47000);
    });

    it('reconciles BOTH accounts atomically when transaction account_id is changed', async () => {
      // testAccount starting: 50000, secondAccount starting: 10000
      const expense = await createExpense(
        {
          amount: 6000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      let acc1 = await testDb.accounts.get(testAccount.id);
      let acc2 = await testDb.accounts.get(secondAccount.id);
      expect(acc1.current_balance).toBe(44000);
      expect(acc2.current_balance).toBe(10000);

      // Move transaction from testAccount to secondAccount
      await updateTransaction(expense.id, { account_id: secondAccount.id }, testDb);

      acc1 = await testDb.accounts.get(testAccount.id);
      acc2 = await testDb.accounts.get(secondAccount.id);

      // testAccount should be restored (+6000 -> 50000)
      expect(acc1.current_balance).toBe(50000);
      // secondAccount should be deducted (-6000 -> 4000)
      expect(acc2.current_balance).toBe(4000);
    });

    it('updates notes and tags without altering account balance', async () => {
      const expense = await createExpense(
        {
          amount: 4000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id,
          notes: 'ملاحظة قديمة'
        },
        testDb
      );

      const updated = await updateTransaction(
        expense.id,
        {
          notes: 'ملاحظة محدثة جديدة',
          tags: ['جديد', 'معدل']
        },
        testDb
      );

      expect(updated.notes).toBe('ملاحظة محدثة جديدة');
      expect(updated.tags).toEqual(['جديد', 'معدل']);
      expect(updated.sync_version).toBe(2);

      const acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(46000);
    });
  });

  describe('6. Soft Deletion & Balance Restoration', () => {
    it('throws TransactionNotFoundError if attempting to delete non-existent or already deleted transaction', async () => {
      await expect(deleteTransaction('non-existent-id', testDb)).rejects.toThrow(
        TransactionNotFoundError
      );
    });

    it('soft-deletes an expense transaction and atomically restores account balance', async () => {
      const expense = await createExpense(
        {
          amount: 12000, // 120.00 SAR
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(38000);

      const deleted = await deleteTransaction(expense.id, testDb);
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.sync_version).toBe(2);

      // Account balance must be restored to 50000
      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(50000);

      // Check mutation queue
      const mutations = await testDb.offline_mutation_queue.toArray();
      const deleteMutation = mutations.find(
        (m) => m.entity_type === 'transaction' && m.entity_id === expense.id && m.action === 'DELETE'
      );
      expect(deleteMutation).toBeDefined();

      // Deleting again should fail
      await expect(deleteTransaction(expense.id, testDb)).rejects.toThrow(TransactionNotFoundError);
    });

    it('soft-deletes an income transaction and atomically reduces account balance', async () => {
      const income = await createIncome(
        {
          amount: 30000, // 300.00 SAR
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: incomeCategory.id
        },
        testDb
      );

      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(80000);

      await deleteTransaction(income.id, testDb);

      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(50000);
    });
  });

  describe('7. Restoration of Soft-Deleted Transactions', () => {
    it('restores a soft-deleted transaction and re-applies account balance deduction', async () => {
      const expense = await createExpense(
        {
          amount: 7000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      await deleteTransaction(expense.id, testDb);
      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(50000);

      const restored = await restoreTransaction(expense.id, testDb);
      expect(restored.deleted_at).toBeNull();
      expect(restored.sync_version).toBe(3);

      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(43000);
    });

    it('rejects restoration if the associated account has since been deleted', async () => {
      const expense = await createExpense(
        {
          amount: 5000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      await deleteTransaction(expense.id, testDb);

      // Now soft-delete testAccount
      await testDb.accounts.update(testAccount.id, { deleted_at: new Date().toISOString() });

      await expect(restoreTransaction(expense.id, testDb)).rejects.toThrow(
        'لا يمكن استعادة المعاملة لأن الحساب المرتبط بها محذوف'
      );
    });
  });

  describe('8. Querying, Search, Filtering & Summary Engine', () => {
    beforeEach(async () => {
      // Seed a dataset of 5 transactions
      await createExpense(
        {
          amount: 2500,
          date: '2026-10-20',
          account_id: testAccount.id,
          category_id: expenseCategory.id,
          notes: 'وجبة سريعة من شاورما',
          tags: ['طعام', 'سريع']
        },
        testDb
      );

      await createExpense(
        {
          amount: 15000,
          date: '2026-10-21',
          account_id: testAccount.id,
          category_id: expenseCategory.id,
          notes: 'عشاء فاخر في مطعم إيطالي',
          tags: ['طعام', 'فاخر']
        },
        testDb
      );

      await createIncome(
        {
          amount: 500000, // 5,000.00 SAR
          date: '2026-10-22',
          account_id: testAccount.id,
          category_id: incomeCategory.id,
          notes: 'راتب شهر أكتوبر',
          tags: ['عمل', 'راتب']
        },
        testDb
      );

      await createExpense(
        {
          amount: 3000,
          date: '2026-10-23',
          account_id: secondAccount.id,
          category_id: expenseCategory.id,
          notes: 'قهوة اسبريسو في المقهى',
          tags: ['قهوة']
        },
        testDb
      );

      const delTx = await createExpense(
        {
          amount: 9999,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id,
          notes: 'معاملة ملغاة لاحقاً'
        },
        testDb
      );
      await deleteTransaction(delTx.id, testDb);
    });

    it('retrieves transaction by ID, excluding soft-deleted by default', async () => {
      const all = await testDb.transactions.toArray();
      const activeTx = all.find((t) => t.deleted_at === null);
      const deletedTx = all.find((t) => t.deleted_at !== null);

      const fetched = await getTransactionById(activeTx.id, testDb);
      expect(fetched).not.toBeNull();
      expect(fetched.id).toBe(activeTx.id);

      const fetchedDeleted = await getTransactionById(deletedTx.id, testDb);
      expect(fetchedDeleted).toBeNull();

      const fetchedWithDeleted = await getTransactionById(deletedTx.id, testDb, { includeDeleted: true });
      expect(fetchedWithDeleted).not.toBeNull();
      expect(fetchedWithDeleted.id).toBe(deletedTx.id);
    });

    it('filters transactions by type (expense vs income)', async () => {
      const expenses = await getTransactions(testDb, { type: 'expense' });
      expect(expenses).toHaveLength(3);
      expect(expenses.every((t) => t.type === 'expense')).toBe(true);

      const incomes = await getTransactions(testDb, { type: 'income' });
      expect(incomes).toHaveLength(1);
      expect(incomes[0].type).toBe('income');
    });

    it('filters transactions by account_id', async () => {
      const account1Txs = await getTransactions(testDb, { accountId: testAccount.id });
      expect(account1Txs).toHaveLength(3);

      const account2Txs = await getTransactions(testDb, { accountId: secondAccount.id });
      expect(account2Txs).toHaveLength(1);
      expect(account2Txs[0].amount).toBe(3000);
    });

    it('filters transactions by date range', async () => {
      const midTxs = await getTransactions(testDb, {
        startDate: '2026-10-21',
        endDate: '2026-10-22'
      });
      expect(midTxs).toHaveLength(2);
      const dates = midTxs.map((t) => t.date);
      expect(dates).toContain('2026-10-21');
      expect(dates).toContain('2026-10-22');
    });

    it('filters transactions by amount range', async () => {
      const filtered = await getTransactions(testDb, {
        minAmount: 3000,
        maxAmount: 15000
      });
      expect(filtered).toHaveLength(2);
      const amounts = filtered.map((t) => t.amount);
      expect(amounts).toContain(3000);
      expect(amounts).toContain(15000);
    });

    it('filters transactions by specific tag', async () => {
      const coffeeTxs = await getTransactions(testDb, { tag: 'قهوة' });
      expect(coffeeTxs).toHaveLength(1);
      expect(coffeeTxs[0].notes).toContain('قهوة');
    });

    it('performs keyword text search across notes and tags', async () => {
      const searchResults = await getTransactions(testDb, { search: 'إيطالي' });
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].notes).toContain('إيطالي');

      const tagSearch = await getTransactions(testDb, { search: 'سريع' });
      expect(tagSearch).toHaveLength(1);
      expect(tagSearch[0].tags).toContain('سريع');
    });

    it('sorts transactions by date, amount, or created_at in asc/desc order', async () => {
      const byDateDesc = await getTransactions(testDb, { sortBy: 'date', sortOrder: 'desc' });
      expect(byDateDesc[0].date).toBe('2026-10-23');
      expect(byDateDesc[byDateDesc.length - 1].date).toBe('2026-10-20');

      const byAmountAsc = await getTransactions(testDb, { sortBy: 'amount', sortOrder: 'asc' });
      expect(byAmountAsc[0].amount).toBe(2500);
      expect(byAmountAsc[byAmountAsc.length - 1].amount).toBe(500000);
    });

    it('supports pagination via limit and offset', async () => {
      const page1 = await getTransactions(testDb, { limit: 2, offset: 0 });
      const page2 = await getTransactions(testDb, { limit: 2, offset: 2 });
      const count = await getTransactionsCount(testDb);

      expect(count).toBe(4);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('calculates financial summary (total income, total expense, cash flow, category breakdown)', async () => {
      const summary = await getTransactionsSummary(testDb);

      // Expenses: 2500 + 15000 + 3000 = 20500
      // Incomes: 500000
      // Net Cash Flow: 500000 - 20500 = 479500
      expect(summary.totalExpense).toBe(20500);
      expect(summary.totalIncome).toBe(500000);
      expect(summary.netCashFlow).toBe(479500);
      expect(summary.count).toBe(4);
      expect(summary.expenseCount).toBe(3);
      expect(summary.incomeCount).toBe(1);
      expect(summary.categoryBreakdown[expenseCategory.id]).toBe(20500);
    });
  });

  describe('9. Permanent Deletion & Cleanup', () => {
    it('permanently deletes a transaction and recalculates account balance', async () => {
      const expense = await createExpense(
        {
          amount: 5000,
          date: '2026-10-24',
          account_id: testAccount.id,
          category_id: expenseCategory.id
        },
        testDb
      );

      let acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(45000);

      const success = await permanentDeleteTransaction(expense.id, testDb);
      expect(success).toBe(true);

      const inDb = await testDb.transactions.get(expense.id);
      expect(inDb).toBeUndefined();

      acc = await testDb.accounts.get(testAccount.id);
      expect(acc.current_balance).toBe(50000);
    });
  });
});
