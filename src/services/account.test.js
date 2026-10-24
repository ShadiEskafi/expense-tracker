import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import {
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNTS,
  AccountValidationError,
  AccountNotFoundError,
  AccountInUseError,
  CurrencyLockedError,
  generateUUID,
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  archiveAccount,
  unarchiveAccount,
  calculateAccountBalance,
  reconcileAccountBalance,
  reconcileAllAccountBalances,
  reassignAccountTransactions,
  seedDefaultAccounts,
  isAccountsSeeded,
  getFinancialPositionMetrics
} from './account.js';

describe('Account Management & Ledger-Backed Balance Service (F004)', () => {
  let testDb;

  beforeEach(() => {
    testDb = new ExpenseDatabase(`test-account-db-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. Constants & Schema Specifications', () => {
    it('defines exactly the 5 allowed account types', () => {
      expect(ACCOUNT_TYPES).toEqual(['cash', 'bank', 'credit_card', 'digital_wallet', 'custom']);
    });

    it('defines deterministic default accounts (Cash and Bank) with valid Arabic metadata', () => {
      expect(DEFAULT_ACCOUNTS).toHaveLength(2);
      const slugs = DEFAULT_ACCOUNTS.map((a) => a.slug);
      expect(slugs).toContain('acc_cash');
      expect(slugs).toContain('acc_bank');
    });

    it('generates valid RFC4122 v4 UUIDs', () => {
      const id1 = generateUUID();
      const id2 = generateUUID();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('2. Account Creation & Validation', () => {
    it('throws AccountValidationError when input data is empty or invalid', async () => {
      await expect(createAccount(null, testDb)).rejects.toThrow(AccountValidationError);
      await expect(createAccount({}, testDb)).rejects.toThrow(AccountValidationError);
      await expect(createAccount({ name: '' }, testDb)).rejects.toThrow('اسم الحساب مطلوب');
      await expect(createAccount({ name: '   ' }, testDb)).rejects.toThrow('اسم الحساب مطلوب');
    });

    it('throws AccountValidationError when account type is invalid', async () => {
      await expect(createAccount({ name: 'حساب غير معروف', type: 'bitcoin' }, testDb))
        .rejects.toThrow(AccountValidationError);
    });

    it('throws AccountValidationError when initial_balance is non-integer or float', async () => {
      await expect(createAccount({ name: 'البنك', type: 'bank', initial_balance: 10.5 }, testDb))
        .rejects.toThrow('الرصيد الافتتاحي يجب أن يكون رقماً صحيحاً');
      await expect(createAccount({ name: 'البنك', type: 'bank', initial_balance: '1000' }, testDb))
        .rejects.toThrow('الرصيد الافتتاحي يجب أن يكون رقماً صحيحاً');
    });

    it('throws AccountValidationError when currency code is not a 3-letter ISO code', async () => {
      await expect(createAccount({ name: 'البنك', type: 'bank', currency: 'SAR1' }, testDb))
        .rejects.toThrow('رمز العملة يجب أن يتكون من 3 أحرف');
      await expect(createAccount({ name: 'البنك', type: 'bank', currency: 'US' }, testDb))
        .rejects.toThrow('رمز العملة يجب أن يتكون من 3 أحرف');
    });

    it('creates a valid account with integer minor units balance and defaults', async () => {
      const created = await createAccount(
        {
          name: '  الراجحي الجاري  ',
          type: 'bank',
          initial_balance: 500000, // 5,000.00 SAR in cents
          currency: 'sar'
        },
        testDb
      );

      expect(created.id).toBeDefined();
      expect(created.name).toBe('الراجحي الجاري');
      expect(created.type).toBe('bank');
      expect(created.initial_balance).toBe(500000);
      expect(created.current_balance).toBe(500000);
      expect(created.currency).toBe('SAR');
      expect(created.is_archived).toBe(false);
      expect(created.deleted_at).toBeNull();
      expect(created.sync_version).toBe(1);

      // Verify persistence in IndexedDB
      const persisted = await testDb.accounts.get(created.id);
      expect(persisted).toBeDefined();
      expect(persisted.current_balance).toBe(500000);

      // Verify offline mutation queue entry
      const mutations = await testDb.offline_mutation_queue.toArray();
      expect(mutations.length).toBe(1);
      expect(mutations[0].entity_id).toBe(created.id);
      expect(mutations[0].entity_type).toBe('account');
      expect(mutations[0].action).toBe('UPSERT');
    });
  });

  describe('3. Default Account Seeding & Idempotency', () => {
    it('seeds Cash and Bank default accounts for guest context', async () => {
      expect(await isAccountsSeeded(testDb)).toBe(false);

      const accounts = await seedDefaultAccounts(testDb, null, 'SAR');
      expect(accounts).toHaveLength(2);
      expect(await isAccountsSeeded(testDb)).toBe(true);

      const names = accounts.map((a) => a.name);
      expect(names).toContain('محفظة نقدية');
      expect(names).toContain('حساب بنكي');
    });

    it('is completely idempotent and prevents duplicating default accounts', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      const firstRunCount = await testDb.accounts.count();
      expect(firstRunCount).toBe(2);

      // Second invocation
      const secondRun = await seedDefaultAccounts(testDb, null, 'SAR');
      const secondRunCount = await testDb.accounts.count();
      expect(secondRunCount).toBe(2);
      expect(secondRun).toHaveLength(2);
    });

    it('isolates seeded accounts by userId', async () => {
      await seedDefaultAccounts(testDb, 'user_alpha', 'SAR');
      await seedDefaultAccounts(testDb, 'user_beta', 'USD');

      const alphaAccounts = await getAccounts(testDb, { userId: 'user_alpha' });
      const betaAccounts = await getAccounts(testDb, { userId: 'user_beta' });

      expect(alphaAccounts).toHaveLength(2);
      expect(betaAccounts).toHaveLength(2);
      expect(alphaAccounts[0].currency).toBe('SAR');
      expect(betaAccounts[0].currency).toBe('USD');
    });
  });

  describe('4. Account Retrieval & Filtering', () => {
    it('retrieves accounts excluding soft-deleted records by default', async () => {
      const acc1 = await createAccount({ name: 'حساب 1', type: 'cash' }, testDb);
      const acc2 = await createAccount({ name: 'حساب 2', type: 'bank' }, testDb);

      await testDb.accounts.update(acc2.id, { deleted_at: new Date().toISOString() });

      const activeAccounts = await getAccounts(testDb);
      expect(activeAccounts).toHaveLength(1);
      expect(activeAccounts[0].id).toBe(acc1.id);

      const allAccounts = await getAccounts(testDb, { includeDeleted: true });
      expect(allAccounts).toHaveLength(2);
    });

    it('filters out archived accounts by default unless includeArchived is set', async () => {
      const acc1 = await createAccount({ name: 'نشط', type: 'cash' }, testDb);
      const acc2 = await createAccount({ name: 'مؤرشف', type: 'bank', is_archived: true }, testDb);

      const defaultList = await getAccounts(testDb);
      expect(defaultList).toHaveLength(1);
      expect(defaultList[0].id).toBe(acc1.id);

      const withArchived = await getAccounts(testDb, { includeArchived: true });
      expect(withArchived).toHaveLength(2);
      expect(withArchived.map((a) => a.id)).toContain(acc2.id);
    });

    it('filters accounts by single or multiple types', async () => {
      await createAccount({ name: 'نقد', type: 'cash' }, testDb);
      await createAccount({ name: 'بنك', type: 'bank' }, testDb);
      await createAccount({ name: 'فيزا', type: 'credit_card' }, testDb);

      const bankOnly = await getAccounts(testDb, { type: 'bank' });
      expect(bankOnly).toHaveLength(1);
      expect(bankOnly[0].type).toBe('bank');

      const cashAndCards = await getAccounts(testDb, { type: ['cash', 'credit_card'] });
      expect(cashAndCards).toHaveLength(2);
    });

    it('retrieves account by ID with deleted_at check', async () => {
      const acc = await createAccount({ name: 'محفظتي', type: 'cash' }, testDb);
      const found = await getAccountById(acc.id, testDb);
      expect(found).not.toBeNull();
      expect(found.id).toBe(acc.id);

      await testDb.accounts.update(acc.id, { deleted_at: new Date().toISOString() });
      const deletedCheck = await getAccountById(acc.id, testDb);
      expect(deletedCheck).toBeNull();

      const foundWithDeleted = await getAccountById(acc.id, testDb, { includeDeleted: true });
      expect(foundWithDeleted).not.toBeNull();
    });

    it('throws AccountNotFoundError when operating on non-existent or soft-deleted account', async () => {
      const nonExistentId = generateUUID();
      await expect(calculateAccountBalance(nonExistentId, testDb)).rejects.toThrow(AccountNotFoundError);
      await expect(updateAccount(nonExistentId, { name: 'تحديث' }, testDb)).rejects.toThrow(AccountNotFoundError);
      await expect(deleteAccount(nonExistentId, testDb)).rejects.toThrow(AccountNotFoundError);
    });
  });

  describe('5. Ledger-Backed Balance Calculation (ADR-003 Formula)', () => {
    it('calculates balance strictly from initial_balance when no transactions exist', async () => {
      const acc = await createAccount({ name: 'محفظة', type: 'cash', initial_balance: 15000 }, testDb);
      const calc = await calculateAccountBalance(acc.id, testDb);

      expect(calc.calculatedBalance).toBe(15000);
      expect(calc.inflows).toBe(0);
      expect(calc.outflows).toBe(0);
      expect(calc.transfersIn).toBe(0);
      expect(calc.transfersOut).toBe(0);
      expect(calc.isDrifted).toBe(false);
    });

    it('computes ledger formula: initial + inflows - outflows + transfersIn - transfersOut', async () => {
      const sourceAcc = await createAccount({ name: 'البنك', type: 'bank', initial_balance: 100000 }, testDb); // 1,000 SAR
      const destAcc = await createAccount({ name: 'النقد', type: 'cash', initial_balance: 20000 }, testDb);   // 200 SAR
      const otherAcc = await createAccount({ name: 'محفظة أخرى', type: 'digital_wallet', initial_balance: 0 }, testDb);

      // Inflow (Salary income to sourceAcc: +3,000 SAR = 300,000 cents)
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'income',
        amount: 300000,
        account_id: sourceAcc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      // Outflow (Grocery expense from sourceAcc: -500 SAR = 50,000 cents)
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 50000,
        account_id: sourceAcc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      // Transfer from sourceAcc to destAcc: 200 SAR = 20,000 cents
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'transfer',
        amount: 20000,
        account_id: sourceAcc.id,
        destination_account_id: destAcc.id,
        date: '2026-10-24',
        deleted_at: null
      });

      // Transfer from otherAcc to sourceAcc: 100 SAR = 10,000 cents
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'transfer',
        amount: 10000,
        account_id: otherAcc.id,
        destination_account_id: sourceAcc.id,
        date: '2026-10-24',
        deleted_at: null
      });

      // Source Account Balance check:
      // initial: 100,000
      // inflows: 300,000
      // outflows: 50,000
      // transfersIn: 10,000
      // transfersOut: 20,000
      // Expected = 100000 + 300000 - 50000 + 10000 - 20000 = 340,000 cents (3,400 SAR)
      const sourceCalc = await calculateAccountBalance(sourceAcc.id, testDb);
      expect(sourceCalc.initialBalance).toBe(100000);
      expect(sourceCalc.inflows).toBe(300000);
      expect(sourceCalc.outflows).toBe(50000);
      expect(sourceCalc.transfersIn).toBe(10000);
      expect(sourceCalc.transfersOut).toBe(20000);
      expect(sourceCalc.calculatedBalance).toBe(340000);

      // Destination Account Balance check:
      // initial: 20,000 + transferIn: 20,000 = 40,000 cents (400 SAR)
      const destCalc = await calculateAccountBalance(destAcc.id, testDb);
      expect(destCalc.transfersIn).toBe(20000);
      expect(destCalc.calculatedBalance).toBe(40000);
    });

    it('strictly excludes soft-deleted transactions (deleted_at !== null) from balance calculation', async () => {
      const acc = await createAccount({ name: 'البنك', type: 'bank', initial_balance: 50000 }, testDb);

      // Active expense: 10,000 cents
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 10000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      // Soft-deleted expense: 20,000 cents
      const deletedTxId = generateUUID();
      await testDb.transactions.add({
        id: deletedTxId,
        type: 'expense',
        amount: 20000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: new Date().toISOString()
      });

      const calc = await calculateAccountBalance(acc.id, testDb);
      expect(calc.outflows).toBe(10000);
      expect(calc.calculatedBalance).toBe(40000); // 50,000 - 10,000 (deleted 20,000 ignored)
    });

    it('demonstrates that soft-deleting an expense restores account balance immediately', async () => {
      const acc = await createAccount({ name: 'نقد', type: 'cash', initial_balance: 100000 }, testDb);
      const txId = generateUUID();

      await testDb.transactions.add({
        id: txId,
        type: 'expense',
        amount: 25000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      let calc = await calculateAccountBalance(acc.id, testDb);
      expect(calc.calculatedBalance).toBe(75000);

      // Now soft-delete the transaction
      await testDb.transactions.update(txId, { deleted_at: new Date().toISOString() });

      calc = await calculateAccountBalance(acc.id, testDb);
      expect(calc.calculatedBalance).toBe(100000); // Fully restored
    });

    it('handles Credit Card liability accounting correctly', async () => {
      // Credit card starts with 0 balance
      const card = await createAccount({ name: 'فيزا إنفينيت', type: 'credit_card', initial_balance: 0 }, testDb);
      const bank = await createAccount({ name: 'الحساب الجاري', type: 'bank', initial_balance: 200000 }, testDb);

      // 1. Spend 50,000 cents (500 SAR) on card -> Liability increases (balance = -50,000)
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 50000,
        account_id: card.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      let cardCalc = await calculateAccountBalance(card.id, testDb);
      expect(cardCalc.calculatedBalance).toBe(-50000);

      // 2. Pay credit card bill (Settlement transfer from bank to credit card)
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'transfer',
        amount: 50000,
        account_id: bank.id,
        destination_account_id: card.id,
        date: '2026-10-24',
        deleted_at: null
      });

      cardCalc = await calculateAccountBalance(card.id, testDb);
      const bankCalc = await calculateAccountBalance(bank.id, testDb);

      // Card debt is paid in full (balance = 0)
      expect(cardCalc.calculatedBalance).toBe(0);
      // Bank balance reduced by payment (200,000 - 50,000 = 150,000)
      expect(bankCalc.calculatedBalance).toBe(150000);
    });
  });

  describe('6. Performance Cache & Balance Reconciliation Engine', () => {
    it('detects balance drift between cached current_balance and transaction ledger', async () => {
      const acc = await createAccount({ name: 'البنك', type: 'bank', initial_balance: 100000 }, testDb);

      // Directly insert transaction without updating current_balance on account
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'income',
        amount: 50000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      const calc = await calculateAccountBalance(acc.id, testDb);
      expect(calc.isDrifted).toBe(true);
      expect(calc.driftAmount).toBe(50000);
      expect(calc.cachedBalance).toBe(100000);
      expect(calc.calculatedBalance).toBe(150000);
    });

    it('reconciles drifted account, updates current_balance, and increments sync_version', async () => {
      const acc = await createAccount({ name: 'البنك', type: 'bank', initial_balance: 100000 }, testDb);
      expect(acc.sync_version).toBe(1);

      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 30000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      const reconcileResult = await reconcileAccountBalance(acc.id, testDb);
      expect(reconcileResult.wasReconciled).toBe(true);
      expect(reconcileResult.driftAmount).toBe(-30000);
      expect(reconcileResult.account.current_balance).toBe(70000);
      expect(reconcileResult.account.sync_version).toBe(2);

      // Verify in DB
      const freshAcc = await testDb.accounts.get(acc.id);
      expect(freshAcc.current_balance).toBe(70000);
      expect(freshAcc.sync_version).toBe(2);

      // Second call when already synced
      const secondReconcile = await reconcileAccountBalance(acc.id, testDb);
      expect(secondReconcile.wasReconciled).toBe(false);
      expect(secondReconcile.driftAmount).toBe(0);
    });

    it('reconcileAllAccountBalances reconciles multiple accounts in batch', async () => {
      const acc1 = await createAccount({ name: 'حساب 1', type: 'cash', initial_balance: 10000 }, testDb);
      const acc2 = await createAccount({ name: 'حساب 2', type: 'bank', initial_balance: 50000 }, testDb);

      // Add expense to acc1
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 4000,
        account_id: acc1.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      const result = await reconcileAllAccountBalances(testDb);
      expect(result.totalChecked).toBe(2);
      expect(result.driftCount).toBe(1);
      expect(result.reconciledAccounts).toHaveLength(1);

      const check1 = await testDb.accounts.get(acc1.id);
      const check2 = await testDb.accounts.get(acc2.id);
      expect(check1.current_balance).toBe(6000);
      expect(check2.current_balance).toBe(50000);
    });
  });

  describe('7. Account Updates & Currency Locking Policy', () => {
    it('updates account metadata (name, type, icon, color, is_archived)', async () => {
      const acc = await createAccount({ name: 'الراجحي', type: 'bank' }, testDb);

      const updated = await updateAccount(
        acc.id,
        {
          name: 'الراجحي - راتب',
          type: 'bank',
          icon: 'landmark',
          color: '#10B981',
          is_archived: true
        },
        testDb
      );

      expect(updated.name).toBe('الراجحي - راتب');
      expect(updated.is_archived).toBe(true);
      expect(updated.color).toBe('#10B981');
      expect(updated.sync_version).toBe(2);
    });

    it('recalculates current_balance when initial_balance is updated', async () => {
      const acc = await createAccount({ name: 'نقد', type: 'cash', initial_balance: 10000 }, testDb);

      // Add an expense: 3,000
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 3000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      // Update initial_balance to 20,000
      const updated = await updateAccount(acc.id, { initial_balance: 20000 }, testDb);
      expect(updated.initial_balance).toBe(20000);
      // New current_balance = 20,000 - 3,000 = 17,000
      expect(updated.current_balance).toBe(17000);
    });

    it('enforces Currency Locking Policy (ADR-002 / Financial Rules Section 6)', async () => {
      // 1. Account with zero balance and zero transactions -> allowed to change currency
      const freshAcc = await createAccount({ name: 'حساب جديد', type: 'bank', initial_balance: 0, currency: 'SAR' }, testDb);
      const updatedAcc = await updateAccount(freshAcc.id, { currency: 'USD' }, testDb);
      expect(updatedAcc.currency).toBe('USD');

      // 2. Account with non-zero initial_balance -> locked
      const fundedAcc = await createAccount({ name: 'حساب ممول', type: 'bank', initial_balance: 50000, currency: 'SAR' }, testDb);
      await expect(updateAccount(fundedAcc.id, { currency: 'EUR' }, testDb)).rejects.toThrow(CurrencyLockedError);

      // 3. Account with transactions -> locked even if initial balance was 0
      const txAcc = await createAccount({ name: 'حساب معاملات', type: 'cash', initial_balance: 0, currency: 'SAR' }, testDb);
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'income',
        amount: 1000,
        account_id: txAcc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      await expect(updateAccount(txAcc.id, { currency: 'KWD' }, testDb)).rejects.toThrow(CurrencyLockedError);
    });
  });

  describe('8. Account Deletion, Reassignment & Protection', () => {
    it('soft-deletes an account when it has no active transactions', async () => {
      const acc = await createAccount({ name: 'حساب تجريبي', type: 'cash' }, testDb);

      const deleted = await deleteAccount(acc.id, testDb);
      expect(deleted.deleted_at).toBeDefined();
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.sync_version).toBe(2);

      const activeAccounts = await getAccounts(testDb);
      expect(activeAccounts).toHaveLength(0);
    });

    it('prevents deleting an account with active transactions and throws AccountInUseError', async () => {
      const acc = await createAccount({ name: 'حساب نشط', type: 'bank' }, testDb);

      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 5000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      await expect(deleteAccount(acc.id, testDb)).rejects.toThrow(AccountInUseError);
    });

    it('allows deleting an account with active transactions when force=true', async () => {
      const acc = await createAccount({ name: 'حساب مع معاملات', type: 'bank' }, testDb);

      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 5000,
        account_id: acc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      const deleted = await deleteAccount(acc.id, testDb, { force: true });
      expect(deleted.deleted_at).not.toBeNull();
    });

    it('reassigns all active transactions to target account upon deletion and reconciles balances', async () => {
      const fromAcc = await createAccount({ name: 'حساب قديم', type: 'cash', initial_balance: 0 }, testDb);
      const toAcc = await createAccount({ name: 'حساب رئيسي', type: 'bank', initial_balance: 100000 }, testDb);

      const txId1 = generateUUID();
      const txId2 = generateUUID();

      await testDb.transactions.add({
        id: txId1,
        type: 'income',
        amount: 30000,
        account_id: fromAcc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      await testDb.transactions.add({
        id: txId2,
        type: 'expense',
        amount: 10000,
        account_id: fromAcc.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      // Delete fromAcc and reassign to toAcc
      await deleteAccount(fromAcc.id, testDb, { reassignAccountId: toAcc.id });

      // Verify fromAcc is soft-deleted
      const deletedFrom = await testDb.accounts.get(fromAcc.id);
      expect(deletedFrom.deleted_at).not.toBeNull();

      // Verify transactions are now assigned to toAcc
      const tx1 = await testDb.transactions.get(txId1);
      const tx2 = await testDb.transactions.get(txId2);
      expect(tx1.account_id).toBe(toAcc.id);
      expect(tx2.account_id).toBe(toAcc.id);

      // Verify toAcc balance reconciled: 100,000 + 30,000 - 10,000 = 120,000
      const freshTo = await testDb.accounts.get(toAcc.id);
      expect(freshTo.current_balance).toBe(120000);
    });

    it('reassignAccountTransactions reassigns transactions directly and reconciles both accounts', async () => {
      const accA = await createAccount({ name: 'حساب أ', type: 'bank', initial_balance: 50000 }, testDb);
      const accB = await createAccount({ name: 'حساب ب', type: 'bank', initial_balance: 10000 }, testDb);

      await testDb.transactions.add({
        id: generateUUID(),
        type: 'income',
        amount: 20000,
        account_id: accA.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });

      const count = await reassignAccountTransactions(accA.id, accB.id, testDb);
      expect(count).toBe(1);

      const freshA = await testDb.accounts.get(accA.id);
      const freshB = await testDb.accounts.get(accB.id);
      expect(freshA.current_balance).toBe(50000); // 50,000 initial + 0
      expect(freshB.current_balance).toBe(30000); // 10,000 initial + 20,000 reassigned income
    });

    it('archiveAccount and unarchiveAccount toggle is_archived correctly', async () => {
      const acc = await createAccount({ name: 'محفظة', type: 'cash' }, testDb);
      expect(acc.is_archived).toBe(false);

      const archived = await archiveAccount(acc.id, testDb);
      expect(archived.is_archived).toBe(true);

      const unarchived = await unarchiveAccount(acc.id, testDb);
      expect(unarchived.is_archived).toBe(false);
    });
  });

  describe('9. Financial Position Metrics (Section 5)', () => {
    it('computes Available Funds, Total Liabilities, and Net Financial Position', async () => {
      // Cash: +50,000
      await createAccount({ name: 'نقد', type: 'cash', initial_balance: 50000 }, testDb);
      // Bank: +150,000
      await createAccount({ name: 'بنك', type: 'bank', initial_balance: 150000 }, testDb);
      // Credit card: -40,000 liability (starts at 0, with 40,000 expense)
      const card = await createAccount({ name: 'فيزا', type: 'credit_card', initial_balance: 0 }, testDb);
      await testDb.transactions.add({
        id: generateUUID(),
        type: 'expense',
        amount: 40000,
        account_id: card.id,
        destination_account_id: null,
        date: '2026-10-24',
        deleted_at: null
      });
      await reconcileAccountBalance(card.id, testDb);

      const metrics = await getFinancialPositionMetrics(testDb);

      // Available Liquid Funds: 50,000 + 150,000 = 200,000 cents (2,000 SAR)
      expect(metrics.availableFunds).toBe(200000);
      // Total Liabilities (Credit Card Debt): 40,000 cents (400 SAR)
      expect(metrics.totalLiabilities).toBe(40000);
      // Net Position: 200,000 - 40,000 = 160,000 cents (1,600 SAR)
      expect(metrics.netPosition).toBe(160000);
      expect(metrics.accountsCount).toBe(3);
      expect(metrics.breakdownByType.cash).toBe(50000);
      expect(metrics.breakdownByType.bank).toBe(150000);
      expect(metrics.breakdownByType.credit_card).toBe(-40000);
    });
  });
});
