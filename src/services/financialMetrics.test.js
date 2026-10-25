import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import { createAccount } from './account.js';
import { createTransaction } from './transaction.js';
import { createTransfer } from './transfer.js';
import {
  CreditCardPaymentValidationError,
  FinancialMetricsError,
  getMonthDateRange,
  getPreviousMonth,
  calculatePercentageChange,
  getFinancialPositionMetrics,
  calculatePeriodCashFlow,
  getMonthOverMonthMetrics,
  getCreditCardLiabilitySummary,
  recordCreditCardPayment,
  getDashboardOverviewMetrics
} from './financialMetrics.js';

describe('Credit Card Liability & Financial Position Metrics (F007)', () => {
  let testDb;
  let bankAccount;
  let cashAccount;
  let walletAccount;
  let creditCardVisa;
  let creditCardMaster;
  let foodCategory;
  let salaryCategory;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`test-metrics-db-${Date.now()}-${Math.random()}`);

    // Pre-create categories
    foodCategory = {
      id: 'cat-food-1',
      name: 'طعام ومطاعم',
      type: 'expense',
      color: '#F97316',
      icon: 'utensils',
      slug: 'cat_food',
      is_default: true,
      deleted_at: null,
      sync_version: 1
    };
    salaryCategory = {
      id: 'cat-salary-1',
      name: 'راتب شهري',
      type: 'income',
      color: '#10B981',
      icon: 'banknote',
      slug: 'cat_salary',
      is_default: true,
      deleted_at: null,
      sync_version: 1
    };
    await testDb.categories.bulkAdd([foodCategory, salaryCategory]);

    // Pre-create accounts
    // Bank: 1,000.00 SAR (100,000 minor units)
    bankAccount = await createAccount(
      {
        name: 'حساب بنكي',
        type: 'bank',
        initial_balance: 100000,
        currency: 'SAR'
      },
      testDb
    );

    // Cash: 200.00 SAR (20,000 minor units)
    cashAccount = await createAccount(
      {
        name: 'محفظة كاش',
        type: 'cash',
        initial_balance: 20000,
        currency: 'SAR'
      },
      testDb
    );

    // Wallet: 50.00 SAR (5,000 minor units)
    walletAccount = await createAccount(
      {
        name: 'محفظة رقمية',
        type: 'digital_wallet',
        initial_balance: 5000,
        currency: 'SAR'
      },
      testDb
    );

    // Credit Card Visa: 0 initial balance
    creditCardVisa = await createAccount(
      {
        name: 'بطاقة فيزا الائتمانية',
        type: 'credit_card',
        initial_balance: 0,
        currency: 'SAR'
      },
      testDb
    );

    // Credit Card Mastercard: -300.00 SAR initial debt (-30,000 minor units)
    creditCardMaster = await createAccount(
      {
        name: 'ماستركارد الائتمانية',
        type: 'credit_card',
        initial_balance: -30000,
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

  describe('1. Date & Calculation Utility Functions', () => {
    it('returns valid start and end dates for a given calendar month', () => {
      const rangeOct = getMonthDateRange('2026-10');
      expect(rangeOct).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });

      const rangeApr = getMonthDateRange('2026-04');
      expect(rangeApr).toEqual({ startDate: '2026-04-01', endDate: '2026-04-30' });

      // Leap year check
      const rangeFebLeap = getMonthDateRange('2024-02');
      expect(rangeFebLeap).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });

      // Non-leap year check
      const rangeFebNonLeap = getMonthDateRange('2025-02');
      expect(rangeFebNonLeap).toEqual({ startDate: '2025-02-01', endDate: '2025-02-28' });
    });

    it('throws FinancialMetricsError on invalid month formats', () => {
      expect(() => getMonthDateRange('')).toThrow(FinancialMetricsError);
      expect(() => getMonthDateRange('2026')).toThrow(FinancialMetricsError);
      expect(() => getMonthDateRange('2026-13')).toThrow(FinancialMetricsError);
      expect(() => getMonthDateRange('invalid-month')).toThrow(FinancialMetricsError);
    });

    it('calculates the correct previous calendar month with year-wrap support', () => {
      expect(getPreviousMonth('2026-10')).toBe('2026-09');
      expect(getPreviousMonth('2026-02')).toBe('2026-01');
      // Year-wrap: January rolls back to December of prior year
      expect(getPreviousMonth('2026-01')).toBe('2025-12');
      expect(getPreviousMonth('2020-01')).toBe('2019-12');
    });

    it('throws FinancialMetricsError when getting previous month with invalid input', () => {
      expect(() => getPreviousMonth(null)).toThrow(FinancialMetricsError);
      expect(() => getPreviousMonth('2026/05')).toThrow(FinancialMetricsError);
    });

    it('calculates percentage changes safely without divide-by-zero errors', () => {
      // Normal cases
      expect(calculatePercentageChange(150, 100)).toBe(50);
      expect(calculatePercentageChange(50, 100)).toBe(-50);
      expect(calculatePercentageChange(100, 100)).toBe(0);

      // Fractional percentages rounded to 2 decimals
      expect(calculatePercentageChange(133, 100)).toBe(33);
      expect(calculatePercentageChange(115.55, 100)).toBe(15.55);

      // Zero baseline handling
      expect(calculatePercentageChange(100, 0)).toBe(100);
      expect(calculatePercentageChange(-50, 0)).toBe(-100);
      expect(calculatePercentageChange(0, 0)).toBe(0);

      // Non-numeric inputs
      expect(calculatePercentageChange('abc', 100)).toBe(0);
      expect(calculatePercentageChange(100, 'def')).toBe(0);
    });
  });

  describe('2. Financial Position: Available Funds, Credit Card Debt & Net Position', () => {
    it('distinguishes between liquid assets and credit card debt liability', async () => {
      // Prior setup:
      // Bank = 100,000; Cash = 20,000; Wallet = 5,000 -> Available Funds = 125,000 cents (1,250 SAR)
      // Visa = 0; Master = -30,000 -> Credit Card Debt = 30,000 cents (300 SAR)
      // Net Position = 125,000 - 30,000 = 95,000 cents (950 SAR)

      const metrics = await getFinancialPositionMetrics(testDb);

      expect(metrics.availableFunds).toBe(125000);
      expect(metrics.creditCardDebt).toBe(30000);
      expect(metrics.overdraftLiabilities).toBe(0);
      expect(metrics.totalLiabilities).toBe(30000);
      expect(metrics.netPosition).toBe(95000);
      expect(metrics.accountsCount).toBe(5);
      expect(metrics.assetAccountsCount).toBe(3);
      expect(metrics.liabilityAccountsCount).toBe(1);

      // Breakdown by type
      expect(metrics.breakdownByType.bank).toBe(100000);
      expect(metrics.breakdownByType.cash).toBe(20000);
      expect(metrics.breakdownByType.digital_wallet).toBe(5000);
      expect(metrics.breakdownByType.credit_card).toBe(-30000);

      // Breakdown by account details
      const masterCardItem = metrics.breakdownByAccount.find((acc) => acc.id === creditCardMaster.id);
      expect(masterCardItem).toBeDefined();
      expect(masterCardItem.isLiability).toBe(true);
      expect(masterCardItem.liabilityAmount).toBe(30000);
      expect(masterCardItem.availableAmount).toBe(0);

      const bankItem = metrics.breakdownByAccount.find((acc) => acc.id === bankAccount.id);
      expect(bankItem).toBeDefined();
      expect(bankItem.isLiability).toBe(false);
      expect(bankItem.availableAmount).toBe(100000);

      const walletItem = metrics.breakdownByAccount.find((acc) => acc.id === walletAccount.id);
      expect(walletItem).toBeDefined();
      expect(walletItem.isLiability).toBe(false);
      expect(walletItem.availableAmount).toBe(5000);
    });

    it('treats overdraft on liquid accounts as overdraft liabilities', async () => {
      // Add an overdrawn cash account (-5,000 cents overdraft)
      await createAccount(
        {
          name: 'حساب مسحوب على المكشوف',
          type: 'custom',
          initial_balance: -5000,
          currency: 'SAR'
        },
        testDb
      );

      const metrics = await getFinancialPositionMetrics(testDb);

      // Available funds remain 125,000 (positive assets only)
      expect(metrics.availableFunds).toBe(125000);
      // Credit card debt is 30,000
      expect(metrics.creditCardDebt).toBe(30000);
      // Overdraft is 5,000
      expect(metrics.overdraftLiabilities).toBe(5000);
      // Total liabilities = 30,000 + 5,000 = 35,000
      expect(metrics.totalLiabilities).toBe(35000);
      // Net position = 125,000 - 35,000 = 90,000
      expect(metrics.netPosition).toBe(90000);
      expect(metrics.liabilityAccountsCount).toBe(2);
    });

    it('excludes soft-deleted accounts from financial position metrics', async () => {
      // Soft-delete creditCardMaster
      const now = new Date().toISOString();
      await testDb.accounts.update(creditCardMaster.id, { deleted_at: now });

      const metrics = await getFinancialPositionMetrics(testDb);

      // Master card is soft-deleted, so liability is now 0!
      expect(metrics.creditCardDebt).toBe(0);
      expect(metrics.totalLiabilities).toBe(0);
      expect(metrics.availableFunds).toBe(125000);
      expect(metrics.netPosition).toBe(125000);
      expect(metrics.accountsCount).toBe(4);
    });

    it('supports recalculation strictly from ledger when reconcile option is true', async () => {
      // Manually drift the cached balance on Visa card without ledger transaction
      await testDb.accounts.update(creditCardVisa.id, { current_balance: -99999 });

      // Cached mode reflects the drifted cache
      const cachedMetrics = await getFinancialPositionMetrics(testDb, { reconcile: false });
      expect(cachedMetrics.creditCardDebt).toBe(129999); // 30,000 + 99,999

      // Reconciled mode calculates strictly from ledger (ADR-003)
      const reconciledMetrics = await getFinancialPositionMetrics(testDb, { reconcile: true });
      // Visa ledger balance is initial_balance = 0, so debt is purely Master card's 30,000!
      expect(reconciledMetrics.creditCardDebt).toBe(30000);
    });

    it('handles backwards compatibility when userId string is passed directly as second argument', async () => {
      const metrics = await getFinancialPositionMetrics(testDb, 'guest-user-123');
      expect(metrics.accountsCount).toBe(0); // none match guest-user-123
    });
  });

  describe('3. Period Cash Flow & Transfer Invariants', () => {
    it('calculates period cash flow with expenses, incomes, and savings rate', async () => {
      // Add Income: 500.00 SAR (50,000 cents) on 2026-10-05
      await createTransaction(
        {
          type: 'income',
          amount: 50000,
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          date: '2026-10-05'
        },
        testDb
      );

      // Add Expense via Bank: 120.00 SAR (12,000 cents) on 2026-10-10
      await createTransaction(
        {
          type: 'expense',
          amount: 12000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-10-10'
        },
        testDb
      );

      // Add Expense via Credit Card: 80.00 SAR (8,000 cents) on 2026-10-15
      // Purchases on card count as period expenses!
      await createTransaction(
        {
          type: 'expense',
          amount: 8000,
          account_id: creditCardVisa.id,
          category_id: foodCategory.id,
          date: '2026-10-15'
        },
        testDb
      );

      const cashFlow = await calculatePeriodCashFlow(testDb, { targetMonth: '2026-10' });

      // Income = 50,000
      expect(cashFlow.totalIncome).toBe(50000);
      // Total Expense = 12,000 (Bank) + 8,000 (Credit Card) = 20,000
      expect(cashFlow.totalExpense).toBe(20000);
      // Net Cash Flow = 50,000 - 20,000 = 30,000 cents (300 SAR positive cash flow)
      expect(cashFlow.netCashFlow).toBe(30000);
      // Savings rate = (30,000 / 50,000) * 100 = 60%
      expect(cashFlow.savingsRate).toBe(60);
      // Expense ratio = (20,000 / 50,000) * 100 = 40%
      expect(cashFlow.expenseRatio).toBe(40);
      expect(cashFlow.incomeCount).toBe(1);
      expect(cashFlow.expenseCount).toBe(2);
      expect(cashFlow.categoryBreakdown[foodCategory.id]).toBe(20000);
    });

    it('strictly guarantees that transfers and credit card settlements never distort period cash flow', async () => {
      // 1. Initial Expense on Credit Card: 250.00 SAR (25,000 cents)
      await createTransaction(
        {
          type: 'expense',
          amount: 25000,
          account_id: creditCardVisa.id,
          category_id: foodCategory.id,
          date: '2026-10-02'
        },
        testDb
      );

      // Cash flow before card bill payment:
      const beforePayment = await calculatePeriodCashFlow(testDb, { targetMonth: '2026-10' });
      expect(beforePayment.totalExpense).toBe(25000);
      expect(beforePayment.totalIncome).toBe(0);
      expect(beforePayment.netCashFlow).toBe(-25000);

      // 2. User settles the 250.00 SAR credit card bill from Bank account (via Transfer)
      await createTransfer(
        {
          amount: 25000,
          account_id: bankAccount.id,
          destination_account_id: creditCardVisa.id,
          date: '2026-10-20',
          notes: 'سداد فاتورة البطاقة الائتمانية'
        },
        testDb
      );

      // Cash flow AFTER bill payment:
      const afterPayment = await calculatePeriodCashFlow(testDb, { targetMonth: '2026-10' });

      // INVARIANT TEST: Total expense is STILL 25,000! Bill payment did NOT add a 2nd expense!
      expect(afterPayment.totalExpense).toBe(25000);
      expect(afterPayment.totalIncome).toBe(0);
      expect(afterPayment.netCashFlow).toBe(-25000);

      // Transfer metrics are tracked for visibility without altering financial totals
      expect(afterPayment.transferCount).toBe(1);
      expect(afterPayment.totalTransferred).toBe(25000);
      expect(afterPayment.creditCardPaymentsCount).toBe(1);
      expect(afterPayment.totalCreditCardPayments).toBe(25000);
    });

    it('excludes soft-deleted transactions from cash flow calculations', async () => {
      const tx = await createTransaction(
        {
          type: 'expense',
          amount: 15000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-10-12'
        },
        testDb
      );

      // Soft delete transaction
      const now = new Date().toISOString();
      await testDb.transactions.update(tx.id, { deleted_at: now });

      const cashFlow = await calculatePeriodCashFlow(testDb, { targetMonth: '2026-10' });
      expect(cashFlow.totalExpense).toBe(0);
      expect(cashFlow.totalTransactionsCount).toBe(0);
    });

    it('filters strictly within specified start and end date boundaries', async () => {
      // Transaction in September
      await createTransaction(
        {
          type: 'expense',
          amount: 10000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-09-30'
        },
        testDb
      );

      // Transaction in October
      await createTransaction(
        {
          type: 'expense',
          amount: 20000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-10-01'
        },
        testDb
      );

      // Transaction in November
      await createTransaction(
        {
          type: 'expense',
          amount: 30000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-11-01'
        },
        testDb
      );

      // Query only October
      const octFlow = await calculatePeriodCashFlow(testDb, {
        startDate: '2026-10-01',
        endDate: '2026-10-31'
      });
      expect(octFlow.totalExpense).toBe(20000);
      expect(octFlow.expenseCount).toBe(1);
    });
  });

  describe('4. Credit Card Liability Summary & Management', () => {
    it('summarizes all credit cards, individual debts, and period payment activity', async () => {
      // creditCardMaster starts with -30,000 debt
      // creditCardVisa starts with 0 balance

      // Charge 15,000 expense to Visa
      await createTransaction(
        {
          type: 'expense',
          amount: 15000,
          account_id: creditCardVisa.id,
          category_id: foodCategory.id,
          date: '2026-10-05'
        },
        testDb
      );

      // Make a partial payment of 10,000 to Master card
      await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: creditCardMaster.id,
          date: '2026-10-10'
        },
        testDb
      );

      const summary = await getCreditCardLiabilitySummary(testDb, { targetMonth: '2026-10' });

      expect(summary.cardCount).toBe(2);
      expect(summary.cardsInDebtCount).toBe(2);
      // Master debt was 30,000 - 10,000 payment = 20,000
      // Visa debt was 0 + 15,000 expense = 15,000
      // Total credit card debt = 20,000 + 15,000 = 35,000 cents (350 SAR)
      expect(summary.totalCreditCardDebt).toBe(35000);
      expect(summary.totalPeriodCardExpenses).toBe(15000);
      expect(summary.totalPeriodCardPayments).toBe(10000);

      const visaSummary = summary.cards.find((c) => c.id === creditCardVisa.id);
      expect(visaSummary.outstandingDebt).toBe(15000);
      expect(visaSummary.periodExpenses).toBe(15000);
      expect(visaSummary.periodPayments).toBe(0);
      expect(visaSummary.isDebtFree).toBe(false);

      const masterSummary = summary.cards.find((c) => c.id === creditCardMaster.id);
      expect(masterSummary.outstandingDebt).toBe(20000);
      expect(masterSummary.periodExpenses).toBe(0);
      expect(masterSummary.periodPayments).toBe(10000);
    });

    it('identifies debt-free credit cards correctly when balance is zero or positive', async () => {
      const summary = await getCreditCardLiabilitySummary(testDb, { targetMonth: '2026-10' });
      const visaSummary = summary.cards.find((c) => c.id === creditCardVisa.id);
      expect(visaSummary.outstandingDebt).toBe(0);
      expect(visaSummary.isDebtFree).toBe(true);
    });
  });

  describe('5. Credit Card Debt Payment Execution (recordCreditCardPayment)', () => {
    it('executes a validated card debt payment reducing liability without altering Net Financial Position', async () => {
      // Prior State:
      // Bank = 100,000; Cash = 20,000; Wallet = 5,000 (Available = 125,000)
      // Master Card = -30,000 (Debt = 30,000)
      // Net Position = 125,000 - 30,000 = 95,000 cents (950 SAR)

      const positionBefore = await getFinancialPositionMetrics(testDb);
      expect(positionBefore.availableFunds).toBe(125000);
      expect(positionBefore.creditCardDebt).toBe(30000);
      expect(positionBefore.netPosition).toBe(95000);

      // Execute payment of 20,000 cents (200 SAR) from Bank to Master Card
      const result = await recordCreditCardPayment(
        {
          sourceAccountId: bankAccount.id,
          creditCardAccountId: creditCardMaster.id,
          amount: 20000,
          date: '2026-10-22',
          notes: 'سداد جزئي لماستركارد'
        },
        testDb
      );

      expect(result.transfer).toBeDefined();
      expect(result.transfer.type).toBe('transfer');
      expect(result.priorDebt).toBe(30000);
      expect(result.remainingDebt).toBe(10000);
      expect(result.debtSettled).toBe(false);
      expect(result.netPositionImpact).toBe(0);

      // Check updated balances
      expect(result.sourceAccount.current_balance).toBe(80000); // 100,000 - 20,000
      expect(result.creditCardAccount.current_balance).toBe(-10000); // -30,000 + 20,000

      // Financial Position After Payment:
      // Available = 80,000 + 20,000 + 5,000 = 105,000
      // Debt = 10,000
      // Net Position = 105,000 - 10,000 = 95,000
      const positionAfter = await getFinancialPositionMetrics(testDb);
      expect(positionAfter.availableFunds).toBe(105000);
      expect(positionAfter.creditCardDebt).toBe(10000);
      expect(positionAfter.netPosition).toBe(95000);

      // Absolute proof: Net Financial Position is identical!
      expect(positionAfter.netPosition).toBe(positionBefore.netPosition);
    });

    it('settles credit card debt completely to 0 and flags debtSettled as true', async () => {
      // Master Card debt = 30,000
      // Pay full 30,000
      const result = await recordCreditCardPayment(
        {
          sourceAccountId: bankAccount.id,
          creditCardAccountId: creditCardMaster.id,
          amount: 30000
        },
        testDb
      );

      expect(result.remainingDebt).toBe(0);
      expect(result.debtSettled).toBe(true);
      expect(result.creditCardAccount.current_balance).toBe(0);

      const metrics = await getFinancialPositionMetrics(testDb);
      expect(metrics.creditCardDebt).toBe(0);
      expect(metrics.netPosition).toBe(95000);
    });

    it('rejects payment if destination account is not a credit card', async () => {
      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: bankAccount.id,
            creditCardAccountId: cashAccount.id, // Cash is NOT a credit card
            amount: 10000
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);
    });

    it('rejects payment if source account is a credit card', async () => {
      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: creditCardVisa.id, // Cannot pay card with card
            creditCardAccountId: creditCardMaster.id,
            amount: 10000
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);
    });

    it('rejects payment with non-positive or non-integer amount', async () => {
      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: bankAccount.id,
            creditCardAccountId: creditCardMaster.id,
            amount: -5000
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);

      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: bankAccount.id,
            creditCardAccountId: creditCardMaster.id,
            amount: 25.5 // Float rejected
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);
    });

    it('rejects payment between accounts with mismatched currencies', async () => {
      // Create USD credit card
      const usdCard = await createAccount(
        {
          name: 'بطاقة دولارية',
          type: 'credit_card',
          initial_balance: 0,
          currency: 'USD'
        },
        testDb
      );

      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: bankAccount.id, // SAR
            creditCardAccountId: usdCard.id, // USD
            amount: 1000
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);
    });
  });

  describe('6. Month-over-Month (MoM) Comparisons', () => {
    it('compares spending, income, and net cash flow against the previous month', async () => {
      // September: Income 100,000, Expense 40,000
      await createTransaction(
        {
          type: 'income',
          amount: 100000,
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          date: '2026-09-01'
        },
        testDb
      );
      await createTransaction(
        {
          type: 'expense',
          amount: 40000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-09-15'
        },
        testDb
      );

      // October: Income 120,000, Expense 50,000
      await createTransaction(
        {
          type: 'income',
          amount: 120000,
          account_id: bankAccount.id,
          category_id: salaryCategory.id,
          date: '2026-10-01'
        },
        testDb
      );
      await createTransaction(
        {
          type: 'expense',
          amount: 50000,
          account_id: bankAccount.id,
          category_id: foodCategory.id,
          date: '2026-10-15'
        },
        testDb
      );

      const mom = await getMonthOverMonthMetrics(testDb, { targetMonth: '2026-10' });

      expect(mom.currentMonth.month).toBe('2026-10');
      expect(mom.currentMonth.totalExpense).toBe(50000);
      expect(mom.currentMonth.totalIncome).toBe(120000);
      expect(mom.currentMonth.netCashFlow).toBe(70000);

      expect(mom.previousMonth.month).toBe('2026-09');
      expect(mom.previousMonth.totalExpense).toBe(40000);
      expect(mom.previousMonth.totalIncome).toBe(100000);
      expect(mom.previousMonth.netCashFlow).toBe(60000);

      // Expense Delta: 50,000 - 40,000 = +10,000 (+25%)
      expect(mom.expenseDelta).toBe(10000);
      expect(mom.expenseDeltaPercentage).toBe(25);
      expect(mom.spendingTrend).toBe('increased');

      // Income Delta: 120,000 - 100,000 = +20,000 (+20%)
      expect(mom.incomeDelta).toBe(20000);
      expect(mom.incomeDeltaPercentage).toBe(20);
      expect(mom.incomeTrend).toBe('increased');

      // Net Cash Flow Delta: 70,000 - 60,000 = +10,000
      expect(mom.netCashFlowDelta).toBe(10000);
      expect(mom.netCashFlowTrend).toBe('improved');
    });
  });

  describe('7. Unified Dashboard Financial Overview Payload', () => {
    it('aggregates all verified KPI metrics into a single atomic payload', async () => {
      const overview = await getDashboardOverviewMetrics(testDb, { targetMonth: '2026-10' });

      expect(overview.financialPosition).toBeDefined();
      expect(overview.financialPosition.availableFunds).toBe(125000);
      expect(overview.financialPosition.totalLiabilities).toBe(30000);
      expect(overview.financialPosition.netPosition).toBe(95000);

      expect(overview.cashFlow).toBeDefined();
      expect(overview.monthOverMonth).toBeDefined();
      expect(overview.creditCards).toBeDefined();
      expect(overview.currency).toBe('SAR');
    });

    it('handles empty database and returns cleanly without errors', async () => {
      const emptyDb = new ExpenseDatabase(`empty-test-db-${Date.now()}`);
      try {
        const overview = await getDashboardOverviewMetrics(emptyDb, { targetMonth: '2026-10' });
        expect(overview.financialPosition.availableFunds).toBe(0);
        expect(overview.financialPosition.totalLiabilities).toBe(0);
        expect(overview.financialPosition.netPosition).toBe(0);
        expect(overview.cashFlow.totalIncome).toBe(0);
        expect(overview.cashFlow.totalExpense).toBe(0);
        expect(overview.cashFlow.netCashFlow).toBe(0);
        expect(overview.cashFlow.savingsRate).toBe(0);
        expect(overview.creditCards.totalCreditCardDebt).toBe(0);
        expect(overview.creditCards.cardCount).toBe(0);
      } finally {
        await emptyDb.delete();
      }
    });

    it('correctly handles credit cards with surplus balance (overpayments)', async () => {
      // Overpay credit card by 10,000 cents (starting at 0)
      await createTransfer(
        {
          amount: 10000,
          account_id: bankAccount.id,
          destination_account_id: creditCardVisa.id,
          date: '2026-10-25'
        },
        testDb
      );

      const summary = await getCreditCardLiabilitySummary(testDb, { targetMonth: '2026-10' });
      const visaCard = summary.cards.find((c) => c.id === creditCardVisa.id);

      expect(visaCard.current_balance).toBe(10000);
      expect(visaCard.outstandingDebt).toBe(0);
      expect(visaCard.creditSurplus).toBe(10000);
      expect(visaCard.isDebtFree).toBe(true);

      const position = await getFinancialPositionMetrics(testDb);
      // Visa surplus is not counted as debt liability
      expect(position.creditCardDebt).toBe(30000); // only Master card
    });

    it('isolates metrics by userId when userId filter is provided', async () => {
      // Create user-specific account
      const userAccount = await createAccount(
        {
          name: 'حساب مستخدم محدد',
          type: 'bank',
          initial_balance: 50000,
          currency: 'SAR',
          user_id: 'user-xyz-999'
        },
        testDb
      );

      const userMetrics = await getFinancialPositionMetrics(testDb, { userId: 'user-xyz-999' });
      expect(userMetrics.accountsCount).toBe(1);
      expect(userMetrics.availableFunds).toBe(50000);
      expect(userMetrics.breakdownByAccount[0].id).toBe(userAccount.id);

      const otherMetrics = await getFinancialPositionMetrics(testDb, { userId: 'unknown-user' });
      expect(otherMetrics.accountsCount).toBe(0);
      expect(otherMetrics.availableFunds).toBe(0);
    });

    it('rejects credit card payment with missing parameters', async () => {
      await expect(recordCreditCardPayment(null, testDb)).rejects.toThrow(
        CreditCardPaymentValidationError
      );
      await expect(
        recordCreditCardPayment({ sourceAccountId: bankAccount.id }, testDb)
      ).rejects.toThrow(CreditCardPaymentValidationError);
      await expect(
        recordCreditCardPayment({ creditCardAccountId: creditCardVisa.id }, testDb)
      ).rejects.toThrow(CreditCardPaymentValidationError);
      await expect(
        recordCreditCardPayment(
          {
            sourceAccountId: bankAccount.id,
            creditCardAccountId: creditCardVisa.id
            // missing amount
          },
          testDb
        )
      ).rejects.toThrow(CreditCardPaymentValidationError);
    });
  });
});
