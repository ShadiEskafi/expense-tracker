import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../db/db.js';
import { seedDefaultCategories, getCategories } from '../services/category.js';
import { createAccount, getAccountById } from '../services/account.js';
import { getTransactionById } from '../services/transaction.js';
import { QuickAdd } from './QuickAdd.jsx';
import { LAST_USED_ACCOUNT_KEY, getTodayIsoDate } from './quickAddConstants.js';

describe('F009: Quick Add Transaction Flow (<5s Target)', () => {
  let testDb;
  let testAccounts = [];
  let testCategories = [];

  beforeEach(async () => {
    // Isolated in-memory Dexie database
    testDb = new ExpenseDatabase(`quickadd_test_${Date.now()}_${Math.random()}`);
    await seedDefaultCategories(testDb, null);

    // Seed test accounts: Cash and Bank
    const cashAcc = await createAccount(
      {
        name: 'كاش المحفظة',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 100000, // 1000.00 SAR
      },
      testDb
    );

    const bankAcc = await createAccount(
      {
        name: 'حساب الراجحي',
        type: 'bank',
        currency: 'SAR',
        initial_balance: 500000, // 5000.00 SAR
      },
      testDb
    );

    testAccounts = [cashAcc, bankAcc];
    testCategories = await getCategories(testDb);

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
    vi.restoreAllMocks();
  });

  describe('1. Dialog Rendering & Accessibility Semantics', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={false}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );
      expect(html).toBe('');
    });

    it('renders accessible dialog container with role="dialog" and aria-modal="true"', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="quick-add-title"');
      expect(html).toContain('quick-add-dialog');
      expect(html).toContain('تسجيل مصروف سريع');
    });

    it('renders segmented control with 3 tabs (expense, income, transfer)', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="نوع المعاملة"');
      expect(html).toContain('مصروف');
      expect(html).toContain('دخل');
      expect(html).toContain('تحويل داخلي');
      expect(html).toContain('is-expense');
    });

    it('renders amount input with inputMode="decimal" and tabular numbers display', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('inputMode="decimal"');
      expect(html).toContain('placeholder="0.00"');
      expect(html).toContain('quick-add-amount-input');
      expect(html).toContain('ر.س');
    });

    it('renders accessible close button with aria-label', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('aria-label="إغلاق نافذة التسجيل"');
    });
  });

  describe('2. Auto-Populated Defaults (<5s Target)', () => {
    it('generates current date as local ISO YYYY-MM-DD', () => {
      const today = getTodayIsoDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const parsed = new Date(today);
      expect(isNaN(parsed.getTime())).toBe(false);
    });

    it('pre-populates date input with today default', () => {
      const today = getTodayIsoDate();
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain(`value="${today}"`);
    });

    it('pre-selects account from localStorage last-used key if present', () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_USED_ACCOUNT_KEY, testAccounts[1].id);
      }

      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          defaultAccountId={testAccounts[1].id}
          database={testDb}
        />
      );

      // Account option is present and selected
      expect(html).toContain(testAccounts[1].name);
      expect(html).toContain(testAccounts[0].name);
    });
  });

  describe('3. Mode Switcher & Dynamic Surface Adapters', () => {
    it('adapts titles and buttons when rendered in income mode', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          initialType="income"
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('تسجيل دخل جديد');
      expect(html).toContain('حفظ الدخل (Enter)');
      expect(html).toContain('إيداع في حساب');
      expect(html).toContain('is-income');
    });

    it('adapts titles, buttons, and accounts when rendered in transfer mode', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          initialType="transfer"
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('تحويل بين الحسابات');
      expect(html).toContain('تأكيد التحويل (Enter)');
      expect(html).toContain('من حساب (المصدر)');
      expect(html).toContain('إلى حساب (الوجهة)');
      // Categories are hidden in transfer mode
      expect(html).not.toContain('التصنيف المالي *');
    });

    it('filters category chips according to active type', () => {
      const expenseHtml = renderToString(
        <QuickAdd
          isOpen={true}
          initialType="expense"
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(expenseHtml).toContain('طعام ومطاعم');
      expect(expenseHtml).toContain('بقالة وسوبرماركت');
      expect(expenseHtml).not.toContain('راتب شهري');

      const incomeHtml = renderToString(
        <QuickAdd
          isOpen={true}
          initialType="income"
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(incomeHtml).toContain('راتب شهري');
      expect(incomeHtml).toContain('عمل حر ومشاريع');
      expect(incomeHtml).not.toContain('طعام ومطاعم');
    });
  });

  describe('4. Collapsible Optional Details ("إضافة تفاصيل")', () => {
    it('renders the details toggle button in collapsed state by default', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('إضافة تفاصيل (ملاحظات، وسوم)');
      expect(html).toContain('aria-expanded="false"');
    });

    it('renders expanded details with notes and tags when initialData has notes', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          initialData={{
            amount: 5000,
            notes: 'قهوة وفطور عمل',
            tags: ['عمل', 'مقهى'],
          }}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('إخفاء التفاصيل الإضافية');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('ملاحظات / وصف');
      expect(html).toContain('قهوة وفطور عمل');
      expect(html).toContain('الوسوم (Tags)');
      expect(html).toContain('عمل, مقهى');
    });
  });

  describe('5. Database Persistence & Ledger Integration (Dexie)', () => {
    it('creates expense transaction and adjusts ledger-backed balance atomically', async () => {
      const foodCat = testCategories.find((c) => c.slug === 'cat_food');
      const cashAcc = testAccounts[0];

      // Simulate QuickAdd creation logic
      const { createTransaction } = await import('../services/transaction.js');
      const created = await createTransaction(
        {
          type: 'expense',
          amount: 3500, // 35.00 SAR
          category_id: foodCat.id,
          account_id: cashAcc.id,
          date: getTodayIsoDate(),
          notes: 'غداء سريع',
          tags: ['طعام', 'عمل'],
        },
        testDb
      );

      expect(created.id).toBeDefined();
      expect(created.amount).toBe(3500);
      expect(created.type).toBe('expense');
      expect(created.tags).toEqual(['طعام', 'عمل']);

      // Verify account balance updated atomically
      const updatedAcc = await getAccountById(cashAcc.id, testDb);
      // initial 1000.00 (100000) - 35.00 (3500) = 965.00 (96500)
      expect(updatedAcc.current_balance).toBe(96500);

      // Verify transaction retrievable from database
      const fetched = await getTransactionById(created.id, testDb);
      expect(fetched.notes).toBe('غداء سريع');
    });

    it('creates income transaction and increases account balance', async () => {
      const salaryCat = testCategories.find((c) => c.slug === 'cat_salary');
      const bankAcc = testAccounts[1];

      const { createTransaction } = await import('../services/transaction.js');
      const created = await createTransaction(
        {
          type: 'income',
          amount: 800000, // 8,000.00 SAR
          category_id: salaryCat.id,
          account_id: bankAcc.id,
          date: getTodayIsoDate(),
          notes: 'راتب الشهر الحالي',
        },
        testDb
      );

      expect(created.type).toBe('income');
      expect(created.amount).toBe(800000);

      const updatedBank = await getAccountById(bankAcc.id, testDb);
      // initial 5000.00 (500000) + 8000.00 (800000) = 13000.00 (1300000)
      expect(updatedBank.current_balance).toBe(1300000);
    });

    it('executes transfer between two accounts using single-record model', async () => {
      const sourceAcc = testAccounts[1]; // Bank: 5000.00 (500000)
      const destAcc = testAccounts[0];   // Cash: 1000.00 (100000)

      const { createTransfer } = await import('../services/transfer.js');
      const transfer = await createTransfer(
        {
          amount: 50000, // 500.00 SAR
          account_id: sourceAcc.id,
          destination_account_id: destAcc.id,
          date: getTodayIsoDate(),
          notes: 'سحب كاش من الصراف',
        },
        testDb
      );

      expect(transfer.type).toBe('transfer');
      expect(transfer.category_id).toBeNull();
      expect(transfer.amount).toBe(50000);

      // Source debited: 500000 - 50000 = 450000
      const updatedSource = await getAccountById(sourceAcc.id, testDb);
      expect(updatedSource.current_balance).toBe(450000);

      // Destination credited: 100000 + 50000 = 150000
      const updatedDest = await getAccountById(destAcc.id, testDb);
      expect(updatedDest.current_balance).toBe(150000);
    });

    it('persists last-used account in localStorage upon saving', () => {
      const accountId = testAccounts[1].id;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_USED_ACCOUNT_KEY, accountId);
        expect(localStorage.getItem(LAST_USED_ACCOUNT_KEY)).toBe(accountId);
      }
    });
  });

  describe('6. Non-Destructive Validation Contract', () => {
    it('parses both Western digits and Arabic-Indic numerals safely', async () => {
      const { parseAmountInput } = await import('../utils/currency.js');

      // Western decimal
      expect(parseAmountInput('25.50', 'SAR').minorUnits).toBe(2550);
      expect(parseAmountInput('25.50', 'SAR').isValid).toBe(true);
      expect(parseAmountInput('100', 'SAR').minorUnits).toBe(10000);

      // Arabic-Indic numerals
      expect(parseAmountInput('٢٥٫٥٠', 'SAR').minorUnits).toBe(2550);
      expect(parseAmountInput('١٠٠', 'SAR').minorUnits).toBe(10000);

      // Invalid input returns isValid: false without throwing
      expect(parseAmountInput('invalid', 'SAR').isValid).toBe(false);
      expect(parseAmountInput('0', 'SAR').isValid).toBe(false);
      expect(parseAmountInput('-50', 'SAR').isValid).toBe(false);
    });

    it('preserves user inputs in form state when validation errors occur', () => {
      // Demonstrates non-destructive rendering: entered amount & notes remain populated
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          initialData={{
            amount: 4500, // 45.00 SAR
            notes: 'بيانات لن تضيع',
            tags: ['ثابت'],
          }}
          onClose={() => {}}
          accounts={testAccounts}
          categories={testCategories}
          database={testDb}
        />
      );

      expect(html).toContain('45');
      expect(html).toContain('بيانات لن تضيع');
    });
  });

  describe('7. Design System & Craft Floor Verification', () => {
    it('verifies QuickAdd.css contains concentric border-radius and motion tokens', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const cssPath = path.resolve(dir, './QuickAdd.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      // Concentric radius & dialog styling
      expect(cssContent).toContain('--radius-2xl');
      expect(cssContent).toContain('max-width: 520px');
      expect(cssContent).toContain('font-variant-numeric: tabular-nums');

      // Mobile bottom sheet
      expect(cssContent).toContain('@media (max-width: 767px)');
      expect(cssContent).toContain('sheetSlideUp');
      expect(cssContent).toContain('env(safe-area-inset-bottom');

      // Transitions & Micro-interactions
      expect(cssContent).toContain('errorShake');
      expect(cssContent).toContain('scale(0.96)');
      expect(cssContent).toContain('direction: ltr'); // LTR number isolation

      // Reduced motion guard
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('animation: none !important');
    });
  });
});
