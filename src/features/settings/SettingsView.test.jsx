import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../../db/db.js';
import { SettingsView } from './SettingsView.jsx';
import { CurrencyLockCard } from './CurrencyLockCard.jsx';
import { CurrencySelectorModal } from './CurrencySelectorModal.jsx';
import { BackupRestoreModal } from './BackupRestoreModal.jsx';
import { SupabaseAuthModal } from './SupabaseAuthModal.jsx';
import {
  setBaseCurrency,
  checkCurrencyLockStatus,
  SETTING_KEY_BASE_CURRENCY
} from '../../services/currencyLock.js';
import { seedDefaultAccounts } from '../../services/account.js';
import { seedDefaultCategories } from '../../services/category.js';
import { createTransaction } from '../../services/transaction.js';

describe('Settings View & Currency Immutability Lock Component Tests (F014)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`settings_test_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    await testDb.open();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. SettingsView Layout & Hub Cards', () => {
    it('renders the Settings view header with title and description', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('الإعدادات وسلامة البيانات');
      expect(html).toContain('التحكم في العملة الأساسية، المظهر، التصنيفات، واستدامة السجلات المالية');
    });

    it('renders the Theme Switcher row with current theme and toggle button', () => {
      const htmlLight = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );
      expect(htmlLight).toContain('مظهر التطبيق');
      expect(htmlLight).toContain('الوضع الفاتح (نشط)');

      const htmlDark = renderToString(
        <SettingsView
          theme="dark"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );
      expect(htmlDark).toContain('الوضع الداكن (نشط)');
    });

    it('renders the Categories Management shortcut button', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('إدارة التصنيفات المالية');
      expect(html).toContain('إدارة التصنيفات');
    });

    it('renders the Local-First Storage & Safety card with technical guarantees', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('التخزين المحلي وسلامة البيانات');
      expect(html).toContain('تخزين محلي آمن');
      expect(html).toContain('قاعدة بيانات محلية سريعة');
      expect(html).toContain('خصوصية تامة واستخدام دون اتصال');
      expect(html).toContain('دقة الحسابات المالية (ISO 4217)');
    });

    it('renders the Data Portability card with CSV export and JSON backup & restore actions (F015 & F016)', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('تصدير البيانات والنسخ الاحتياطي');
      expect(html).toContain('تصدير كافة المعاملات كملف CSV');
      expect(html).toContain('تصدير كملف CSV');

      // F016 JSON Backup & Restore buttons
      expect(html).toContain('نسخة احتياطية كاملة واستعادة (JSON)');
      expect(html).toContain('تنزيل نسخة JSON');
      expect(html).toContain('استعادة نسخة JSON');
    });
  });

  describe('2. CurrencyLockCard Component Tests', () => {
    it('renders default currency (SAR) and unlocked state on fresh database', () => {
      const html = renderToString(
        <CurrencyLockCard
          database={testDb}
          refreshTrigger={0}
        />
      );

      expect(html).toContain('العملة الأساسية وسياسة الثبات');
      expect(html).toContain('ريال سعودي');
      expect(html).toContain('SAR');
      expect(html).toContain('ر.س');
      expect(html).toContain('🇸🇦');
    });

    it('renders custom configured currency (e.g. KWD) when set in settings', async () => {
      await testDb.settings.put({
        key: SETTING_KEY_BASE_CURRENCY,
        value: 'KWD',
        updated_at: new Date().toISOString()
      });

      // Also verify service reads it
      const status = await checkCurrencyLockStatus(testDb);
      expect(status.currency).toBe('KWD');
    });
  });

  describe('3. CurrencySelectorModal Component Tests', () => {
    it('does not render when isOpen is false', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={false}
          onClose={vi.fn()}
          currentCurrency="SAR"
          onSelectCurrency={vi.fn()}
        />
      );

      expect(html).toBe('');
    });

    it('renders accessible modal dialog with title, search, filter scopes, and currencies list when open', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={vi.fn()}
          currentCurrency="SAR"
          onSelectCurrency={vi.fn()}
          isLocked={false}
        />
      );

      expect(html).toContain('اختيار العملة الأساسية');
      expect(html).toContain('حدد العملة المعتمدة لكافة حساباتك ومعاملاتك وتقاريرك المالية');
      expect(html).toContain('البحث عن عملة');
      expect(html).toContain('الكل');
      expect(html).toContain('العملات العربية');
      expect(html).toContain('العملات العالمية');
      expect(html).toContain('تأكيد العملة الأساسية');
      expect(html).toContain('إلغاء');

      // Check common currencies present
      expect(html).toContain('ريال سعودي');
      expect(html).toContain('درهم إماراتي');
      expect(html).toContain('دولار أمريكي');
      expect(html).toContain('يورو');
      expect(html).toContain('دينار كويتي');
    });

    it('renders clean read-only locked state without interactive selector or confirm button when isLocked is true', () => {
      const explanation = 'العملة مقفلة لوجود 5 معاملات مسجلة في السجل.';
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={vi.fn()}
          currentCurrency="SAR"
          onSelectCurrency={vi.fn()}
          isLocked={true}
          lockExplanation={explanation}
        />
      );

      expect(html).toContain('العملة الأساسية مقفلة');
      expect(html).toContain('تعديل العملة مقفل حالياً');
      expect(html).toContain(explanation);
      expect(html).toContain('العملة الأساسية النشطة حالياً:');
      expect(html).toContain('ريال سعودي');
      expect(html).toContain('حسناً، فهمت ذلك');
      // Must not display active selector list or confirm button in locked state
      expect(html).not.toContain('تأكيد العملة الأساسية');
      expect(html).not.toContain('currency-search-input');
    });

    it('displays Israeli New Shekel (ILS) in currency options list', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={vi.fn()}
          currentCurrency="SAR"
          onSelectCurrency={vi.fn()}
          isLocked={false}
        />
      );

      expect(html).toContain('ILS');
      expect(html).toContain('شيكل إسرائيلي جديد');
      expect(html).toContain('₪');
    });

    it('marks current currency option as checked/selected', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={vi.fn()}
          currentCurrency="AED"
          onSelectCurrency={vi.fn()}
          isLocked={false}
        />
      );

      expect(html).toContain('AED');
      expect(html).toContain('درهم إماراتي');
      expect(html).toContain('selected');
    });
  });

  describe('4. Full Immutability Lock Lifecycle Integration', () => {
    it('transitions from unlocked to locked upon creating a transaction', async () => {
      await seedDefaultAccounts(testDb, null, 'SAR');
      await seedDefaultCategories(testDb, null);

      // Initially unlocked
      let status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(false);

      // Change currency to USD while unlocked
      await setBaseCurrency('USD', testDb);
      status = await checkCurrencyLockStatus(testDb);
      expect(status.currency).toBe('USD');
      expect(status.isLocked).toBe(false);

      // Add a transaction
      const accounts = await testDb.accounts.toArray();
      const categories = await testDb.categories.toArray();
      const expenseCategory = categories.find((c) => c.type === 'expense');

      await createTransaction({
        account_id: accounts[0].id,
        category_id: expenseCategory.id,
        type: 'expense',
        amount: 5000,
        date: '2026-10-25'
      }, testDb);

      // Now permanently locked
      status = await checkCurrencyLockStatus(testDb);
      expect(status.isLocked).toBe(true);
      expect(status.reason).toBe('HAS_TRANSACTIONS');
      expect(status.transactionCount).toBe(1);
      expect(status.explanationAr).toContain('تغيير العملة دون تحويل أسعار الصرف');
    });
  });

  describe('5. BackupRestoreModal Component Tests (F016)', () => {
    it('does not render when isOpen is false', () => {
      const html = renderToString(
        <BackupRestoreModal
          isOpen={false}
          onClose={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toBe('');
    });

    it('renders accessible dialog with title, dropzone, and safety instructions when isOpen is true', () => {
      const html = renderToString(
        <BackupRestoreModal
          isOpen={true}
          onClose={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('استعادة نسخة احتياطية');
      expect(html).toContain('استبدال البيانات الحالية بسجلات نسخة احتياطية سابقة (JSON)');
      expect(html).toContain('انقر لاختيار ملف النسخة الاحتياطية (.json)');
      expect(html).toContain('يدعم ملفات النسخ الاحتياطي الرسمية المُصدَّرة من التطبيق');
      expect(html).toContain('إلغاء');
    });
  });

  describe('5. Supabase Cloud Sync & Auth Modal Component Tests (F018)', () => {
    it('renders the Cloud Sync & Supabase card in Guest Mode with login action button', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('المزامنة السحابية والمصادقة (Supabase)');
      expect(html).toContain('وضع الضيف (محلي)');
      expect(html).toContain('تسجيل الدخول / ربط الحساب');
    });

    it('renders SupabaseAuthModal dialog when isOpen is true with tabs, inputs and merge safety notice', () => {
      const html = renderToString(
        <SupabaseAuthModal
          isOpen={true}
          onClose={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('تسجيل الدخول إلى حسابك السحابي');
      expect(html).toContain('تسجيل الدخول');
      expect(html).toContain('حساب جديد');
      expect(html).toContain('ضمان سلامة البيانات');
      expect(html).toContain('البريد الإلكتروني');
      expect(html).toContain('كلمة المرور');
      expect(html).toContain('إلغاء');
    });

    it('renders null when SupabaseAuthModal isOpen is false', () => {
      const html = renderToString(
        <SupabaseAuthModal
          isOpen={false}
          onClose={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('6. Storage Persistence & Durability Status Component Tests (F020 / FR-23)', () => {
    it('renders the Storage Durability controls and status pill in SettingsView', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('استدامة التخزين (Storage Durability)');
      expect(html).toContain('تخزين افتراضي');
      expect(html).toContain('طلب حماية التخزين');
    });

    it('renders the Guest Mode Data Safety & Storage Disclosure callout', () => {
      const html = renderToString(
        <SettingsView
          theme="light"
          onToggleTheme={vi.fn()}
          onSelectTab={vi.fn()}
          database={testDb}
        />
      );

      expect(html).toContain('تنبيه سلامة البيانات والتخزين المحلي');
      expect(html).toContain('بياناتك المالية مخزنة حالياً في هذا المتصفح');
      expect(html).toContain('لحمايتها من الحذف العرضي في حال مسح بيانات المتصفح');
    });
  });
});
