import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import { TransactionLedger } from './TransactionLedger.jsx';
import { TransactionDetailModal } from './TransactionDetailModal.jsx';
import { TransactionEditModal } from './TransactionEditModal.jsx';
import { TransactionDeleteConfirmModal } from './TransactionDeleteConfirmModal.jsx';
import { TransactionFilterDrawer } from './TransactionFilterDrawer.jsx';
import { createAccount } from '../../services/account.js';
import { seedDefaultCategories, getCategories } from '../../services/category.js';
import { DEFAULT_FILTERS } from './filter.js';

describe('Transaction Ledger Component Tests (F011)', () => {
  let testDb;
  let cashAccount;
  let bankAccount;
  let foodCategory;
  let salaryCategory;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`ledger_component_test_${Date.now()}_${Math.random()}`);
    await testDb.open();
    await seedDefaultCategories(testDb, null);

    const categories = await getCategories(testDb, { includeDeleted: true });
    foodCategory = categories.find((c) => c.slug === 'cat_food') || categories[0];
    salaryCategory = categories.find((c) => c.slug === 'cat_salary') || categories[1];

    cashAccount = await createAccount(
      {
        name: 'كاش المحفظة',
        type: 'cash',
        currency: 'SAR',
        initial_balance: 100000 // 1,000.00 SAR
      },
      testDb
    );

    bankAccount = await createAccount(
      {
        name: 'الحساب الجاري',
        type: 'bank',
        currency: 'SAR',
        initial_balance: 1500000 // 15,000.00 SAR
      },
      testDb
    );
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('1. Empty States & Layout Shell', () => {
    it('renders initial loading skeleton when initialTransactions is null (SSR default)', () => {
      const html = renderToString(<TransactionLedger database={testDb} />);
      expect(html).toContain('ledger-loading-skeleton');
    });

    it('renders initial empty state when zero transactions exist in database', () => {
      const html = renderToString(
        <TransactionLedger
          initialTransactions={[]}
          initialCategories={[foodCategory, salaryCategory]}
          initialAccounts={[cashAccount, bankAccount]}
          onOpenQuickAdd={() => {}}
        />
      );

      expect(html).toContain('سجل المعاملات المالي');
      expect(html).toContain('لا توجد معاملات مسجلة بعد');
      expect(html).toContain('تسجيل أول معاملة');
    });

    it('renders header, search input, segmented type tabs, and date presets when initialized', () => {
      const html = renderToString(
        <TransactionLedger
          initialTransactions={[]}
          initialCategories={[foodCategory, salaryCategory]}
          initialAccounts={[cashAccount, bankAccount]}
        />
      );

      expect(html).toContain('ابحث بالوصف، التصنيف، الحساب، أو الوسوم...');
      expect(html).toContain('الكل');
      expect(html).toContain('مصاريف');
      expect(html).toContain('دخل');
      expect(html).toContain('تحويلات');
      expect(html).toContain('تصفية');
      expect(html).toContain('كل الفترات');
      expect(html).toContain('اليوم');
      expect(html).toContain('أمس');
      expect(html).toContain('هذا الأسبوع');
      expect(html).toContain('هذا الشهر');
    });
  });

  describe('2. Detail Modal Component', () => {
    it('renders complete transaction metadata for expense', () => {
      const mockTx = {
        id: 'tx-123',
        type: 'expense',
        amount: 4500, // 45.00 SAR
        date: '2026-10-25',
        category_id: foodCategory.id,
        category: foodCategory,
        account_id: cashAccount.id,
        account: cashAccount,
        notes: 'وجبة غداء عمل',
        tags: ['عمل', 'مطاعم']
      };

      const html = renderToString(
        <TransactionDetailModal
          transaction={mockTx}
          onClose={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(html).toContain('وجبة غداء عمل');
      expect(html).toContain('45.00');
      expect(html).toContain('كاش المحفظة');
      expect(html).toContain('#عمل');
      expect(html).toContain('#مطاعم');
      expect(html).toContain('حذف');
      expect(html).toContain('تعديل');
      expect(html).toContain('إغلاق');
    });

    it('renders transfer details with source and destination accounts', () => {
      const mockTransfer = {
        id: 'tr-456',
        type: 'transfer',
        amount: 50000, // 500.00 SAR
        date: '2026-10-25',
        category_id: null,
        account_id: bankAccount.id,
        account: bankAccount,
        destination_account_id: cashAccount.id,
        destinationAccount: cashAccount,
        notes: 'سحب نقدي من الصراف'
      };

      const html = renderToString(
        <TransactionDetailModal
          transaction={mockTransfer}
          onClose={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(html).toContain('تحويل بين الحسابات');
      expect(html).toContain('500.00');
      expect(html).toContain('من حساب');
      expect(html).toContain('الحساب الجاري');
      expect(html).toContain('إلى حساب');
      expect(html).toContain('كاش المحفظة');
      expect(html).toContain('سحب نقدي من الصراف');
    });
  });

  describe('3. Delete Confirmation Modal', () => {
    it('renders safety message explaining soft-delete and ledger balance restoration', () => {
      const mockTx = {
        id: 'tx-del',
        amount: 3500,
        type: 'expense'
      };

      const html = renderToString(
        <TransactionDeleteConfirmModal
          transaction={mockTx}
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
          isDeleting={false}
        />
      );

      expect(html).toContain('هل أنت متأكد من حذف هذه المعاملة؟');
      expect(html).toContain('35.00');
      expect(html).toContain('استعادة رصيد الحساب المالي المرتبط');
      expect(html).toContain('تأكيد الحذف');
      expect(html).toContain('إلغاء');
    });
  });

  describe('4. Filter Drawer Component', () => {
    it('renders category and account chips for multi-filtering', () => {
      const categories = [foodCategory, salaryCategory];
      const accounts = [cashAccount, bankAccount];

      const html = renderToString(
        <TransactionFilterDrawer
          isOpen={true}
          onClose={() => {}}
          filters={DEFAULT_FILTERS}
          onApplyFilters={() => {}}
          onResetFilters={() => {}}
          categories={categories}
          accounts={accounts}
        />
      );

      expect(html).toContain('تصفية المعاملات المتقدمة');
      expect(html).toContain('نوع المعاملة');
      expect(html).toContain('الفترة الزمنية');
      expect(html).toContain('التصنيفات');
      expect(html).toContain(foodCategory.name);
      expect(html).toContain(salaryCategory.name);
      expect(html).toContain('الحسابات والمحافظ');
      expect(html).toContain(cashAccount.name);
      expect(html).toContain(bankAccount.name);
      expect(html).toContain('نطاق المبلغ (ر.س)');
      expect(html).toContain('تطبيق الفلاتر');
    });
  });

  describe('5. Edit Modal Component', () => {
    it('renders pre-populated fields for editing', () => {
      const mockTx = {
        id: 'tx-edit',
        type: 'expense',
        amount: 8500, // 85.00 SAR
        category_id: foodCategory.id,
        account_id: cashAccount.id,
        date: '2026-10-25',
        notes: 'فطور في المطعم',
        tags: ['فطور']
      };

      const html = renderToString(
        <TransactionEditModal
          transaction={mockTx}
          isOpen={true}
          onClose={() => {}}
          onSave={() => {}}
          categories={[foodCategory]}
          accounts={[cashAccount]}
        />
      );

      expect(html).toContain('تعديل المعاملة');
      expect(html).toContain('85.00');
      expect(html).toContain('فطور في المطعم');
      expect(html).toContain('حفظ التعديلات');
    });
  });

  describe('6. Ledger Populated List & Summaries', () => {
    it('renders populated transaction rows with formatted amounts, tags, and summary', () => {
      const mockList = [
        {
          id: 'tx-1',
          type: 'expense',
          amount: 5000, // 50.00 SAR
          date: '2026-10-25',
          category_id: foodCategory.id,
          category: foodCategory,
          account_id: cashAccount.id,
          account: cashAccount,
          notes: 'شراء قهوة الصباح',
          tags: ['قهوة'],
          deleted_at: null
        },
        {
          id: 'tx-2',
          type: 'income',
          amount: 800000, // 8,000.00 SAR
          date: '2026-10-25',
          category_id: salaryCategory.id,
          category: salaryCategory,
          account_id: bankAccount.id,
          account: bankAccount,
          notes: 'راتب شهري',
          tags: ['عمل'],
          deleted_at: null
        }
      ];

      const html = renderToString(
        <TransactionLedger
          initialTransactions={mockList}
          initialCategories={[foodCategory, salaryCategory]}
          initialAccounts={[cashAccount, bankAccount]}
        />
      );

      // Verify title & summary strip
      expect(html).toContain('سجل المعاملات المالي');
      expect(html).toContain('المصاريف المفلترة');
      expect(html).toContain('50.00');
      expect(html).toContain('الدخل المفلتر');
      expect(html).toContain('8,000.00');

      // Verify transaction row content
      expect(html).toContain('شراء قهوة الصباح');
      expect(html).toContain('#قهوة');
      expect(html).toContain('راتب شهري');
      expect(html).toContain('#عمل');
      expect(html).toContain('كاش المحفظة');
      expect(html).toContain('الحساب الجاري');
    });
  });
});
