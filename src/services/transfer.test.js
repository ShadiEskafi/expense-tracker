import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import { createAccount, calculateAccountBalance } from './account.js';
import {
  TransferValidationError,
  TransferNotFoundError,
  validateTransferData,
  createTransfer,
  executeTransfer,
  getTransferById,
  getTransfers,
  getTransfersCount,
  getTransfersSummary,
  updateTransfer,
  deleteTransfer,
  restoreTransfer,
  permanentDeleteTransfer
} from './transfer.js';
import { getTransactionsSummary } from './transaction.js';

describe('Internal Account Transfer (Single-Record Model) (F006)', () => {
  let testDb;
  let bankAccount;
  let cashAccount;
  let walletAccount;
  let creditCardAccount;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`test-transfer-db-${Date.now()}-${Math.random()}`);

    // Pre-create standard accounts
    // Bank: 1,000.00 SAR (100,000 cents)
    bankAccount = await createAccount(
      {
        name: 'الحساب الجاري',
        type: 'bank',
        initial_balance: 100000,
        currency: 'SAR'
      },
      testDb
    );

    // Cash: 200.00 SAR (20,000 cents)
    cashAccount = await createAccount(
      {
        name: 'محفظة نقدية',
        type: 'cash',
        initial_balance: 20000,
        currency: 'SAR'
      },
      testDb
    );

    // Digital Wallet: 50.00 SAR (5,000 cents)
    walletAccount = await createAccount(
      {
        name: 'محفظة إلكترونية',
        type: 'digital_wallet',
        initial_balance: 5000,
        currency: 'SAR'
      },
      testDb
    );

    // Credit Card: -500.00 SAR (-50,000 cents outstanding debt liability)
    creditCardAccount = await createAccount(
      {
        name: 'بطاقة ائتمانية',
        type: 'credit_card',
        initial_balance: -50000,
        currency: 'SAR'
      },
      testDb
    );
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('1. Single-Record Model & Parameter Validation', () => {
    it('executes a transfer creating exactly one transaction record of type "transfer"', async () => {
      const transfer = await createTransfer(
        {
          amount: 15000, // 150.00 SAR
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          date: '2026-10-25',
          notes: 'سحب نقدي من الصراف الآلي',
          tags: ['atm', 'سحب']
        },
        testDb
      );

      expect(transfer.id).toBeDefined();
      expect(transfer.type).toBe('transfer');
      expect(transfer.amount).toBe(15000);
      expect(transfer.date).toBe('2026-10-25');
      expect(transfer.category_id).toBeNull();
      expect(transfer.account_id).toBe(bankAccount.id);
      expect(transfer.destination_account_id).toBe(cashAccount.id);
      expect(transfer.notes).toBe('سحب نقدي من الصراف الآلي');
      expect(transfer.tags).toEqual(['atm', 'سحب']);
      expect(transfer.deleted_at).toBeNull();
      expect(transfer.sync_version).toBe(1);

      // Verify exactly ONE transaction row exists in database
      const count = await testDb.transactions.count();
      expect(count).toBe(1);

      const dbRecord = await testDb.transactions.get(transfer.id);
      expect(dbRecord).toBeDefined();
      expect(dbRecord.type).toBe('transfer');
      expect(dbRecord.category_id).toBeNull();

      // Verify executeTransfer is an alias for createTransfer
      expect(executeTransfer).toBe(createTransfer);
    });

    it('queues mutations for the transfer transaction and both affected accounts in offline queue', async () => {
      await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          date: '2026-10-25'
        },
        testDb
      );

      const mutations = await testDb.offline_mutation_queue.toArray();
      // 1 initial bank account + 1 initial cash account + 1 initial wallet + 1 initial card
      // + 1 transfer tx + 1 updated bank + 1 updated cash = 7 mutations
      const txMutations = mutations.filter((m) => m.entity_type === 'transaction');
      expect(txMutations).toHaveLength(1);
      expect(txMutations[0].action).toBe('UPSERT');

      const accountMutations = mutations.filter((m) => m.entity_type === 'account');
      const mutatedAccountIds = accountMutations.map((m) => m.entity_id);
      expect(mutatedAccountIds).toContain(bankAccount.id);
      expect(mutatedAccountIds).toContain(cashAccount.id);
    });

    it('rejects transfer with invalid or non-integer amounts', async () => {
      const invalidAmounts = [0, -100, 10.5, '1000', null, undefined, NaN, Infinity];

      for (const amount of invalidAmounts) {
        await expect(
          createTransfer(
            {
              amount,
              account_id: bankAccount.id,
              destination_account_id: cashAccount.id,
              date: '2026-10-25'
            },
            testDb
          )
        ).rejects.toThrow(TransferValidationError);
      }
    });

    it('rejects transfer with invalid date formats or nonexistent calendar dates', async () => {
      const invalidDates = ['invalid', '2026-13-01', '2026-02-31', '25-10-2026', '2026/10/25'];

      for (const date of invalidDates) {
        await expect(
          createTransfer(
            {
              amount: 5000,
              account_id: bankAccount.id,
              destination_account_id: cashAccount.id,
              date
            },
            testDb
          )
        ).rejects.toThrow(TransferValidationError);
      }
    });

    it('defaults date to current YYYY-MM-DD if omitted', async () => {
      const transfer = await createTransfer(
        {
          amount: 5000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      expect(transfer.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects transfer when source and destination accounts are identical', async () => {
      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: bankAccount.id,
            date: '2026-10-25'
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);

      try {
        await createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: bankAccount.id
          },
          testDb
        );
      } catch (err) {
        expect(err.field).toBe('destination_account_id');
        expect(err.message).toContain('لا يمكن التحويل إلى نفس الحساب');
      }
    });

    it('rejects transfer if category_id is provided', async () => {
      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: cashAccount.id,
            category_id: 'some-cat-id'
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);
    });

    it('rejects transfer if source account does not exist or is soft-deleted', async () => {
      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: 'non-existent-account-id',
            destination_account_id: cashAccount.id
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);

      // Soft delete source account
      await testDb.accounts.update(bankAccount.id, { deleted_at: new Date().toISOString() });

      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: cashAccount.id
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);
    });

    it('rejects transfer if destination account does not exist or is soft-deleted', async () => {
      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: 'non-existent-dest-id'
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);

      // Soft delete destination account
      await testDb.accounts.update(cashAccount.id, { deleted_at: new Date().toISOString() });

      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: cashAccount.id
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);
    });

    it('rejects transfer between accounts with differing currencies', async () => {
      const usdAccount = await createAccount(
        {
          name: 'حساب دولار',
          type: 'bank',
          initial_balance: 10000,
          currency: 'USD'
        },
        testDb
      );

      await expect(
        createTransfer(
          {
            amount: 5000,
            account_id: bankAccount.id, // SAR
            destination_account_id: usdAccount.id // USD
          },
          testDb
        )
      ).rejects.toThrow(TransferValidationError);
    });

    it('validates transfer payload directly with validateTransferData', async () => {
      await expect(validateTransferData(null, false, testDb)).rejects.toThrow(
        TransferValidationError
      );

      await expect(
        validateTransferData(
          {
            amount: 5000,
            account_id: bankAccount.id,
            destination_account_id: cashAccount.id,
            date: '2026-10-25'
          },
          false,
          testDb
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('2. Atomic Ledger Balance Updates & Zero-Sum Invariants', () => {
    it('atomically deducts from source and credits to destination with zero drift', async () => {
      // Initial: Bank = 100,000; Cash = 20,000
      // Transfer 30,000 from Bank to Cash
      const transfer = await createTransfer(
        {
          amount: 30000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          date: '2026-10-25'
        },
        testDb
      );

      expect(transfer).toBeDefined();

      // Check updated accounts in DB
      const updatedBank = await testDb.accounts.get(bankAccount.id);
      const updatedCash = await testDb.accounts.get(cashAccount.id);

      expect(updatedBank.current_balance).toBe(70000); // 100,000 - 30,000
      expect(updatedCash.current_balance).toBe(50000); // 20,000 + 30,000

      // Verify against authoritative ledger calculation
      const bankLedger = await calculateAccountBalance(bankAccount.id, testDb);
      expect(bankLedger.calculatedBalance).toBe(70000);
      expect(bankLedger.transfersOut).toBe(30000);
      expect(bankLedger.transfersIn).toBe(0);
      expect(bankLedger.isDrifted).toBe(false);

      const cashLedger = await calculateAccountBalance(cashAccount.id, testDb);
      expect(cashLedger.calculatedBalance).toBe(50000);
      expect(cashLedger.transfersIn).toBe(30000);
      expect(cashLedger.transfersOut).toBe(0);
      expect(cashLedger.isDrifted).toBe(false);

      // Zero-sum invariant: Combined total funds remain unchanged
      const totalBefore = 100000 + 20000;
      const totalAfter = updatedBank.current_balance + updatedCash.current_balance;
      expect(totalAfter).toBe(totalBefore);
    });

    it('correctly handles multiple sequential transfers across several accounts', async () => {
      // 1. Bank -> Cash: 20,000
      await createTransfer(
        {
          amount: 20000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      // 2. Cash -> Wallet: 10,000
      await createTransfer(
        {
          amount: 10000,
          account_id: cashAccount.id,
          destination_account_id: walletAccount.id
        },
        testDb
      );

      // 3. Wallet -> Bank: 5,000
      await createTransfer(
        {
          amount: 5000,
          account_id: walletAccount.id,
          destination_account_id: bankAccount.id
        },
        testDb
      );

      // Bank: 100,000 - 20,000 + 5,000 = 85,000
      // Cash: 20,000 + 20,000 - 10,000 = 30,000
      // Wallet: 5,000 + 10,000 - 5,000 = 10,000
      const b = await testDb.accounts.get(bankAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);
      const w = await testDb.accounts.get(walletAccount.id);

      expect(b.current_balance).toBe(85000);
      expect(c.current_balance).toBe(30000);
      expect(w.current_balance).toBe(10000);

      // Combined sum before: 100,000 + 20,000 + 5,000 = 125,000
      // Combined sum after: 85,000 + 30,000 + 10,000 = 125,000
      expect(b.current_balance + c.current_balance + w.current_balance).toBe(125000);
    });
  });

  describe('3. Credit Card Liability Settlement & Financial Non-Distortion', () => {
    it('reduces credit card debt without creating an expense or altering period cash flow', async () => {
      // Bank = 100,000; Credit Card = -50,000 (debt owed: 50,000 cents = 500 SAR)
      // User settles 30,000 cents (300 SAR) of card debt from Bank
      const payment = await createTransfer(
        {
          amount: 30000,
          account_id: bankAccount.id,
          destination_account_id: creditCardAccount.id,
          date: '2026-10-25',
          notes: 'سداد جزئي للبطاقة الائتمانية'
        },
        testDb
      );

      expect(payment).toBeDefined();

      const updatedBank = await testDb.accounts.get(bankAccount.id);
      const updatedCard = await testDb.accounts.get(creditCardAccount.id);

      // Bank reduced by 30,000 -> 70,000
      expect(updatedBank.current_balance).toBe(70000);

      // Card debt reduced: -50,000 + 30,000 = -20,000 (debt is now only 200 SAR!)
      expect(updatedCard.current_balance).toBe(-20000);

      // Net Financial Position before: Available (100k + 20k + 5k = 125k) - Debt (50k) = 75,000 cents
      // Net Financial Position after: Available (70k + 20k + 5k = 95k) - Debt (20k) = 75,000 cents
      // Net position is mathematically unchanged!
      const availableFunds = updatedBank.current_balance + 20000 + 5000; // 95,000
      const debtLiability = Math.abs(updatedCard.current_balance); // 20,000
      const netPosition = availableFunds - debtLiability;
      expect(netPosition).toBe(75000);

      // Critical Accounting Check: Transfers NEVER appear in Cash Flow or Income/Expense summaries
      const summary = await getTransactionsSummary(testDb);
      expect(summary.totalIncome).toBe(0);
      expect(summary.totalExpense).toBe(0);
      expect(summary.netCashFlow).toBe(0);
      expect(summary.incomeCount).toBe(0);
      expect(summary.expenseCount).toBe(0);
      // Transfer count is included in total count
      expect(summary.count).toBe(1);
    });
  });

  describe('4. Retrieval, Filtering & Summaries', () => {
    beforeEach(async () => {
      // Seed 3 transfers
      await createTransfer(
        {
          id: 'transfer-1',
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          date: '2026-10-10',
          notes: 'سحب كاش',
          tags: ['atm']
        },
        testDb
      );

      await createTransfer(
        {
          id: 'transfer-2',
          amount: 25000,
          account_id: bankAccount.id,
          destination_account_id: walletAccount.id,
          date: '2026-10-15',
          notes: 'شحن المحفظة',
          tags: ['online', 'wallet']
        },
        testDb
      );

      await createTransfer(
        {
          id: 'transfer-3',
          amount: 5000,
          account_id: cashAccount.id,
          destination_account_id: walletAccount.id,
          date: '2026-10-20',
          notes: 'إيداع من الكاش',
          tags: ['deposit']
        },
        testDb
      );
    });

    it('retrieves transfer by ID, excluding soft-deleted records by default', async () => {
      const found = await getTransferById('transfer-1', testDb);
      expect(found).toBeDefined();
      expect(found.amount).toBe(10000);

      const notFound = await getTransferById('non-existent', testDb);
      expect(notFound).toBeNull();
    });

    it('filters transfers where account is either source OR destination', async () => {
      // Bank is involved in transfer-1 (source) and transfer-2 (source)
      const bankTransfers = await getTransfers(testDb, { accountId: bankAccount.id });
      expect(bankTransfers).toHaveLength(2);

      // Cash is involved in transfer-1 (dest) and transfer-3 (source)
      const cashTransfers = await getTransfers(testDb, { accountId: cashAccount.id });
      expect(cashTransfers).toHaveLength(2);

      // Wallet is involved in transfer-2 (dest) and transfer-3 (dest)
      const walletTransfers = await getTransfers(testDb, { accountId: walletAccount.id });
      expect(walletTransfers).toHaveLength(2);
    });

    it('filters transfers specifically by sourceAccountId or destinationAccountId', async () => {
      const sourceBank = await getTransfers(testDb, { sourceAccountId: bankAccount.id });
      expect(sourceBank).toHaveLength(2);

      const destWallet = await getTransfers(testDb, { destinationAccountId: walletAccount.id });
      expect(destWallet).toHaveLength(2);

      const destCash = await getTransfers(testDb, { destinationAccountId: cashAccount.id });
      expect(destCash).toHaveLength(1);
      expect(destCash[0].id).toBe('transfer-1');
    });

    it('filters by date range, amount range, search query, and tags', async () => {
      // Date range
      const midMonth = await getTransfers(testDb, {
        startDate: '2026-10-12',
        endDate: '2026-10-18'
      });
      expect(midMonth).toHaveLength(1);
      expect(midMonth[0].id).toBe('transfer-2');

      // Amount range
      const highAmount = await getTransfers(testDb, { minAmount: 20000 });
      expect(highAmount).toHaveLength(1);
      expect(highAmount[0].id).toBe('transfer-2');

      // Search keyword in notes
      const searchRes = await getTransfers(testDb, { search: 'شحن' });
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].id).toBe('transfer-2');

      // Tag filter
      const tagRes = await getTransfers(testDb, { tag: 'atm' });
      expect(tagRes).toHaveLength(1);
      expect(tagRes[0].id).toBe('transfer-1');
    });

    it('supports sorting and pagination', async () => {
      const sortedByAmount = await getTransfers(testDb, {
        sortBy: 'amount',
        sortOrder: 'asc'
      });
      expect(sortedByAmount.map((t) => t.amount)).toEqual([5000, 10000, 25000]);

      const paginated = await getTransfers(testDb, {
        sortBy: 'amount',
        sortOrder: 'desc',
        limit: 2,
        offset: 1
      });
      expect(paginated).toHaveLength(2);
      expect(paginated[0].amount).toBe(10000);
      expect(paginated[1].amount).toBe(5000);

      const count = await getTransfersCount(testDb);
      expect(count).toBe(3);
    });

    it('calculates transfers summary metrics', async () => {
      const summary = await getTransfersSummary(testDb);
      // 10,000 + 25,000 + 5,000 = 40,000
      expect(summary.totalTransferred).toBe(40000);
      expect(summary.count).toBe(3);
      expect(summary.averageAmount).toBe(Math.round(40000 / 3)); // 13333
    });
  });

  describe('5. Updating Transfers & Multi-Account Balance Adjustments', () => {
    it('adjusts both source and destination balances when transfer amount is modified', async () => {
      // Bank = 100,000; Cash = 20,000
      const transfer = await createTransfer(
        {
          amount: 20000, // 200 SAR
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id,
          date: '2026-10-25'
        },
        testDb
      );

      // Bank becomes 80,000; Cash becomes 40,000
      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(80000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(40000);

      // Modify amount to 35,000 (extra 15,000 transferred)
      const updated = await updateTransfer(
        transfer.id,
        {
          amount: 35000,
          notes: 'تعديل مبلغ السحب'
        },
        testDb
      );

      expect(updated.amount).toBe(35000);
      expect(updated.notes).toBe('تعديل مبلغ السحب');
      expect(updated.sync_version).toBe(2);

      // Bank should now be: 100,000 - 35,000 = 65,000
      // Cash should now be: 20,000 + 35,000 = 55,000
      const b = await testDb.accounts.get(bankAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);
      expect(b.current_balance).toBe(65000);
      expect(c.current_balance).toBe(55000);

      // Ledger balances have zero drift
      const bCalc = await calculateAccountBalance(bankAccount.id, testDb);
      const cCalc = await calculateAccountBalance(cashAccount.id, testDb);
      expect(bCalc.calculatedBalance).toBe(65000);
      expect(bCalc.isDrifted).toBe(false);
      expect(cCalc.calculatedBalance).toBe(55000);
      expect(cCalc.isDrifted).toBe(false);
    });

    it('correctly reconciles balances when destination account is changed', async () => {
      // Transfer 20,000 from Bank to Cash
      const transfer = await createTransfer(
        {
          amount: 20000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      // Cash has 40,000; Wallet has 5,000
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(40000);
      expect((await testDb.accounts.get(walletAccount.id)).current_balance).toBe(5000);

      // Change destination from Cash to Wallet!
      await updateTransfer(
        transfer.id,
        {
          destination_account_id: walletAccount.id
        },
        testDb
      );

      // Bank: still -20,000 = 80,000
      // Cash: restored to initial 20,000!
      // Wallet: receives 20,000 -> 5,000 + 20,000 = 25,000!
      const b = await testDb.accounts.get(bankAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);
      const w = await testDb.accounts.get(walletAccount.id);

      expect(b.current_balance).toBe(80000);
      expect(c.current_balance).toBe(20000);
      expect(w.current_balance).toBe(25000);
    });

    it('correctly reconciles balances when source account is changed', async () => {
      // Transfer 10,000 from Bank to Cash
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      // Change source from Bank to Wallet
      await updateTransfer(
        transfer.id,
        {
          account_id: walletAccount.id
        },
        testDb
      );

      // Bank: restored to 100,000!
      // Wallet: deducted 10,000 -> 5,000 - 10,000 = -5,000
      // Cash: still credited 10,000 = 30,000
      const b = await testDb.accounts.get(bankAccount.id);
      const w = await testDb.accounts.get(walletAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);

      expect(b.current_balance).toBe(100000);
      expect(w.current_balance).toBe(-5000);
      expect(c.current_balance).toBe(30000);
    });

    it('reconciles all 4 accounts when both source and destination are changed simultaneously', async () => {
      // Initial:
      // Bank: 100k, Cash: 20k, Wallet: 5k, Credit Card: -50k
      // Transfer 10,000 from Bank to Cash
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      // Change source to Wallet, and destination to Credit Card (settlement)
      await updateTransfer(
        transfer.id,
        {
          account_id: walletAccount.id,
          destination_account_id: creditCardAccount.id
        },
        testDb
      );

      // Bank: restored (100k)
      // Cash: restored (20k)
      // Wallet: deducted 10k (5k - 10k = -5k)
      // Credit Card: credited 10k (-50k + 10k = -40k)
      const b = await testDb.accounts.get(bankAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);
      const w = await testDb.accounts.get(walletAccount.id);
      const cc = await testDb.accounts.get(creditCardAccount.id);

      expect(b.current_balance).toBe(100000);
      expect(c.current_balance).toBe(20000);
      expect(w.current_balance).toBe(-5000);
      expect(cc.current_balance).toBe(-40000);
    });

    it('rejects updating transfer to invalid accounts or setting source equal to destination', async () => {
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      await expect(
        updateTransfer(transfer.id, { destination_account_id: bankAccount.id }, testDb)
      ).rejects.toThrow(TransferValidationError);

      await expect(
        updateTransfer(transfer.id, { amount: -500 }, testDb)
      ).rejects.toThrow(TransferValidationError);

      await expect(
        updateTransfer('non-existent-transfer', { notes: 'test' }, testDb)
      ).rejects.toThrow(TransferNotFoundError);
    });
  });

  describe('6. Soft Deletion & Balance Restoration', () => {
    it('soft-deletes transfer setting deleted_at and atomically restores both balances', async () => {
      // Transfer 25,000 from Bank to Cash
      const transfer = await createTransfer(
        {
          amount: 25000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(75000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(45000);

      // Soft delete transfer
      const deleted = await deleteTransfer(transfer.id, testDb);
      expect(deleted.deleted_at).toBeDefined();
      expect(deleted.sync_version).toBe(2);

      // Balances must be fully restored!
      const b = await testDb.accounts.get(bankAccount.id);
      const c = await testDb.accounts.get(cashAccount.id);
      expect(b.current_balance).toBe(100000); // 75,000 + 25,000
      expect(c.current_balance).toBe(20000); // 45,000 - 25,000

      // Offline queue records DELETE mutation
      const mutations = await testDb.offline_mutation_queue.toArray();
      const deleteMutation = mutations.find(
        (m) => m.entity_id === transfer.id && m.action === 'DELETE'
      );
      expect(deleteMutation).toBeDefined();

      // getTransferById excludes it by default
      expect(await getTransferById(transfer.id, testDb)).toBeNull();
      expect(await getTransferById(transfer.id, testDb, { includeDeleted: true })).toBeDefined();
    });

    it('throws TransferNotFoundError when attempting to delete an already deleted transfer', async () => {
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      await deleteTransfer(transfer.id, testDb);

      await expect(deleteTransfer(transfer.id, testDb)).rejects.toThrow(TransferNotFoundError);
    });
  });

  describe('7. Restoration & Safety Guards', () => {
    it('restores soft-deleted transfer and atomically re-applies balances', async () => {
      const transfer = await createTransfer(
        {
          amount: 25000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      await deleteTransfer(transfer.id, testDb);
      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(100000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(20000);

      // Restore transfer
      const restored = await restoreTransfer(transfer.id, testDb);
      expect(restored.deleted_at).toBeNull();
      expect(restored.sync_version).toBe(3);

      // Balances re-applied
      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(75000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(45000);
    });

    it('blocks restoring transfer if source account has been soft-deleted', async () => {
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      await deleteTransfer(transfer.id, testDb);

      // Soft delete source bank account
      await testDb.accounts.update(bankAccount.id, { deleted_at: new Date().toISOString() });

      await expect(restoreTransfer(transfer.id, testDb)).rejects.toThrow(TransferValidationError);
      try {
        await restoreTransfer(transfer.id, testDb);
      } catch (err) {
        expect(err.field).toBe('account_id');
        expect(err.message).toContain('حساب المصدر محذوف');
      }
    });

    it('blocks restoring transfer if destination account has been soft-deleted', async () => {
      const transfer = await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      await deleteTransfer(transfer.id, testDb);

      // Soft delete destination cash account
      await testDb.accounts.update(cashAccount.id, { deleted_at: new Date().toISOString() });

      await expect(restoreTransfer(transfer.id, testDb)).rejects.toThrow(TransferValidationError);
      try {
        await restoreTransfer(transfer.id, testDb);
      } catch (err) {
        expect(err.field).toBe('destination_account_id');
        expect(err.message).toContain('حساب الوجهة محذوف');
      }
    });
  });

  describe('8. Permanent Deletion', () => {
    it('permanently removes transfer from database and restores balances', async () => {
      const transfer = await createTransfer(
        {
          amount: 20000,
          account_id: bankAccount.id,
          destination_account_id: cashAccount.id
        },
        testDb
      );

      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(80000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(40000);

      const result = await permanentDeleteTransfer(transfer.id, testDb);
      expect(result).toBe(true);

      const inDb = await testDb.transactions.get(transfer.id);
      expect(inDb).toBeUndefined();

      expect((await testDb.accounts.get(bankAccount.id)).current_balance).toBe(100000);
      expect((await testDb.accounts.get(cashAccount.id)).current_balance).toBe(20000);
    });
  });
});
