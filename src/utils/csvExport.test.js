import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  UTF8_BOM,
  CRLF,
  CSV_COLUMNS_AR,
  CSV_COLUMNS_EN,
  escapeCsvField,
  generateCsv,
  resolveTransactionRelations,
  formatTransactionRow,
  generateTransactionsCsv,
  createCsvBlob,
  generateCsvFilename,
  downloadCsvFile,
  exportTransactions
} from './csvExport.js';
import { ExpenseDatabase } from '../db/db.js';

describe('CSV Export Engine (F015)', () => {
  describe('1. Field Escaping & RFC 4180 Compliance (escapeCsvField)', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('returns simple text and numbers unquoted', () => {
      expect(escapeCsvField('Groceries')).toBe('Groceries');
      expect(escapeCsvField(1250)).toBe('1250');
      expect(escapeCsvField('SAR')).toBe('SAR');
      expect(escapeCsvField('مصروف')).toBe('مصروف');
    });

    it('encloses fields containing commas in double quotes', () => {
      expect(escapeCsvField('Food, Dining')).toBe('"Food, Dining"');
      expect(escapeCsvField('طعام, مطاعم')).toBe('"طعام, مطاعم"');
    });

    it('escapes and doubles internal double quotes', () => {
      expect(escapeCsvField('Item "Special" Promo')).toBe('"Item ""Special"" Promo"');
      expect(escapeCsvField('عشاء "فاخر"')).toBe('"عشاء ""فاخر"""');
    });

    it('encloses fields containing newlines or carriage returns in quotes', () => {
      expect(escapeCsvField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCsvField('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
    });

    it('encloses fields with leading or trailing whitespace in quotes', () => {
      expect(escapeCsvField(' spaced ')).toBe('" spaced "');
    });
  });

  describe('2. Formula Injection Sanitization (CSV Injection Protection)', () => {
    it('prepends a single quote to dangerous formula trigger characters (=, +, -, @, \\t)', () => {
      expect(escapeCsvField('=1+1')).toBe("'=1+1");
      expect(escapeCsvField('@SUM(A1:B10)')).toBe("'@SUM(A1:B10)");
      expect(escapeCsvField('+cmd|/C calc')).toBe("'+cmd|/C calc");
      expect(escapeCsvField('-dangerous')).toBe("'-dangerous");
      expect(escapeCsvField('\tleadingTab')).toBe("'\tleadingTab");
    });

    it('does NOT sanitize standard numeric values starting with minus sign', () => {
      expect(escapeCsvField('-12.50')).toBe('-12.50');
      expect(escapeCsvField('-500')).toBe('-500');
      expect(escapeCsvField('100.25')).toBe('100.25');
    });

    it('allows disabling formula sanitization if explicitly configured', () => {
      expect(escapeCsvField('=1+1', { sanitizeFormulas: false })).toBe('=1+1');
    });
  });

  describe('3. CSV Generation & UTF-8 BOM (generateCsv)', () => {
    it('prepends UTF-8 BOM (\\uFEFF) by default for Arabic spreadsheet compatibility', () => {
      const headers = ['المعرف', 'المبلغ'];
      const rows = [['tx-1', '50.00']];
      const result = generateCsv(headers, rows);

      expect(result.startsWith(UTF8_BOM)).toBe(true);
      expect(result.slice(1)).toBe(`المعرف,المبلغ${CRLF}tx-1,50.00`);
    });

    it('supports omitting BOM when withBom is false', () => {
      const headers = ['ID', 'Amount'];
      const rows = [['tx-1', '10.00']];
      const result = generateCsv(headers, rows, { withBom: false });

      expect(result.startsWith(UTF8_BOM)).toBe(false);
      expect(result).toBe(`ID,Amount${CRLF}tx-1,10.00`);
    });

    it('separates lines using RFC 4180 CRLF (\\r\\n)', () => {
      const headers = ['Col1', 'Col2'];
      const rows = [
        ['A', 'B'],
        ['C', 'D']
      ];
      const result = generateCsv(headers, rows, { withBom: false });

      const lines = result.split(CRLF);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('Col1,Col2');
      expect(lines[1]).toBe('A,B');
      expect(lines[2]).toBe('C,D');
    });

    it('faithfully preserves Arabic letters, diacritics, and symbols', () => {
      const headers = ['التصنيف', 'البيان'];
      const rows = [['بقالة وسوبرماركت', 'شراء خضار وفواكه طازجة']];
      const result = generateCsv(headers, rows);

      expect(result).toContain('بقالة وسوبرماركت');
      expect(result).toContain('شراء خضار وفواكه طازجة');
    });
  });

  describe('4. Relation Resolution (resolveTransactionRelations)', () => {
    const categoriesMap = new Map([
      ['cat-food', { id: 'cat-food', name: 'طعام ومطاعم' }],
      ['cat-salary', { id: 'cat-salary', name: 'راتب' }]
    ]);

    const accountsMap = new Map([
      ['acc-cash', { id: 'acc-cash', name: 'كاش المحفظة' }],
      ['acc-bank', { id: 'acc-bank', name: 'حساب بنكي' }]
    ]);

    it('uses existing pre-resolved relation names if available', () => {
      const tx = {
        categoryName: 'تسوق',
        accountName: 'بطاقة ائتمان',
        destinationAccountName: 'حساب التوفير'
      };
      const res = resolveTransactionRelations(tx);
      expect(res.categoryName).toBe('تسوق');
      expect(res.accountName).toBe('بطاقة ائتمان');
      expect(res.destinationAccountName).toBe('حساب التوفير');
    });

    it('resolves IDs using Map lookups', () => {
      const tx = {
        category_id: 'cat-food',
        account_id: 'acc-cash',
        destination_account_id: 'acc-bank'
      };
      const res = resolveTransactionRelations(tx, {
        categories: categoriesMap,
        accounts: accountsMap
      });
      expect(res.categoryName).toBe('طعام ومطاعم');
      expect(res.accountName).toBe('كاش المحفظة');
      expect(res.destinationAccountName).toBe('حساب بنكي');
    });

    it('resolves IDs using Array lookups', () => {
      const tx = {
        category_id: 'cat-salary',
        account_id: 'acc-bank'
      };
      const res = resolveTransactionRelations(tx, {
        categories: Array.from(categoriesMap.values()),
        accounts: Array.from(accountsMap.values())
      });
      expect(res.categoryName).toBe('راتب');
      expect(res.accountName).toBe('حساب بنكي');
      expect(res.destinationAccountName).toBe('');
    });

    it('returns empty strings for unknown or unassigned relations', () => {
      const tx = { category_id: null, account_id: 'unknown' };
      const res = resolveTransactionRelations(tx, { accounts: accountsMap });
      expect(res.categoryName).toBe('');
      expect(res.accountName).toBe('');
      expect(res.destinationAccountName).toBe('');
    });
  });

  describe('5. Row Formatting (formatTransactionRow)', () => {
    const lookups = {
      categories: new Map([['c1', { id: 'c1', name: 'بقالة' }]]),
      accounts: new Map([
        ['a1', { id: 'a1', name: 'محفظة كاش' }],
        ['a2', { id: 'a2', name: 'بطاقة ائتمان' }]
      ])
    };

    it('formats an expense transaction accurately', () => {
      const tx = {
        id: 'tx-exp-1',
        date: '2026-10-25',
        type: 'expense',
        amount: 3550, // 35.50 SAR in minor units
        currency: 'SAR',
        category_id: 'c1',
        account_id: 'a1',
        payment_method: 'نقدي',
        notes: 'مشتريات الغداء',
        tags: ['عمل', 'طعام'],
        created_at: '2026-10-25T12:00:00Z'
      };

      const row = formatTransactionRow(tx, { lookups, baseCurrency: 'SAR' });

      expect(row).toEqual([
        'tx-exp-1',
        '2026-10-25',
        'مصروف',
        '35.50',
        'SAR',
        'بقالة',
        'محفظة كاش',
        '',
        'نقدي',
        'مشتريات الغداء',
        'عمل, طعام',
        '2026-10-25T12:00:00Z'
      ]);
    });

    it('formats an income transaction with positive decimal and income type', () => {
      const tx = {
        id: 'tx-inc-1',
        date: '2026-10-01',
        type: 'income',
        amount: 1500000, // 15,000.00 SAR
        currency: 'SAR',
        categoryName: 'راتب شهري',
        accountName: 'البنك الأهلي',
        payment_method: 'تحويل بنكي',
        notes: 'راتب شهر أكتوبر',
        tags: ['راتب'],
        created_at: '2026-10-01T08:00:00Z'
      };

      const row = formatTransactionRow(tx);

      expect(row[2]).toBe('دخل');
      expect(row[3]).toBe('15000.00');
      expect(row[5]).toBe('راتب شهري');
      expect(row[6]).toBe('البنك الأهلي');
      expect(row[7]).toBe(''); // destination account empty for income
    });

    it('formats an internal transfer with transfer category and destination account', () => {
      const tx = {
        id: 'tx-trf-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 50000, // 500.00 SAR
        currency: 'SAR',
        account_id: 'a1',
        destination_account_id: 'a2',
        payment_method: 'تحويل',
        notes: 'سداد بطاقة الائتمان',
        tags: ['سداد'],
        created_at: '2026-10-20T10:00:00Z'
      };

      const row = formatTransactionRow(tx, { lookups });

      expect(row[2]).toBe('تحويل');
      expect(row[3]).toBe('500.00');
      expect(row[5]).toBe('تحويل مالي'); // Category label for transfer
      expect(row[6]).toBe('محفظة كاش'); // Source account
      expect(row[7]).toBe('بطاقة ائتمان'); // Destination account
    });

    it('supports signedAmounts option for expense rows', () => {
      const tx = {
        id: 'tx-exp-2',
        date: '2026-10-25',
        type: 'expense',
        amount: 2500,
        currency: 'SAR'
      };

      const row = formatTransactionRow(tx, { signedAmounts: true });
      expect(row[3]).toBe('-25.00');
    });

    it('supports English language export', () => {
      const tx = {
        id: 'tx-exp-3',
        date: '2026-10-25',
        type: 'transfer',
        amount: 1000,
        currency: 'USD'
      };

      const row = formatTransactionRow(tx, { language: 'en' });
      expect(row[2]).toBe('Transfer');
      expect(row[5]).toBe('Internal Transfer');
    });
  });

  describe('6. Full Transaction CSV Generation (generateTransactionsCsv)', () => {
    const sampleTransactions = [
      {
        id: 'tx-1',
        date: '2026-10-25',
        type: 'expense',
        amount: 1250,
        currency: 'SAR',
        categoryName: 'طعام',
        accountName: 'كاش',
        notes: 'سندوتش',
        deleted_at: null
      },
      {
        id: 'tx-2',
        date: '2026-10-24',
        type: 'expense',
        amount: 9900,
        currency: 'SAR',
        categoryName: 'محروقات',
        accountName: 'كاش',
        deleted_at: '2026-10-24T18:00:00Z' // Soft-deleted
      }
    ];

    it('filters out soft-deleted transactions by default', () => {
      const csv = generateTransactionsCsv(sampleTransactions);
      expect(csv).toContain('tx-1');
      expect(csv).toContain('12.50');
      expect(csv).not.toContain('99.00');
    });

    it('includes soft-deleted transactions when includeDeleted is true', () => {
      const csv = generateTransactionsCsv(sampleTransactions, { includeDeleted: true });
      expect(csv).toContain('12.50');
      expect(csv).toContain('99.00');
    });

    it('includes all standard Arabic headers in CSV_COLUMNS_AR', () => {
      const csv = generateTransactionsCsv([]);
      CSV_COLUMNS_AR.forEach((col) => {
        expect(csv).toContain(col.label);
      });
    });

    it('includes all English headers when language is en', () => {
      const csv = generateTransactionsCsv([], { language: 'en' });
      CSV_COLUMNS_EN.forEach((col) => {
        expect(csv).toContain(col.label);
      });
    });
  });

  describe('7. File Utilities & Blob Creation', () => {
    it('creates a standard filename with current date stamp', () => {
      const refDate = new Date('2026-10-25T12:00:00Z');
      const filename = generateCsvFilename('masareef-transactions', refDate);
      expect(filename).toBe('masareef-transactions-2026-10-25.csv');
    });

    it('creates a valid UTF-8 CSV Blob', () => {
      const blob = createCsvBlob(`${UTF8_BOM}test`);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/csv;charset=utf-8;');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('handles non-browser download environment safely', () => {
      const result = downloadCsvFile('content', 'test.csv');
      // When window / document are not defined
      expect(result.success).toBe(true);
      expect(result.filename).toBe('test.csv');
    });

    it('simulates browser download when window and document are mocked', () => {
      vi.useFakeTimers();
      const clickMock = vi.fn();
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();

      const mockLink = {
        href: '',
        style: {},
        parentNode: null,
        setAttribute: vi.fn(),
        click: clickMock
      };

      const mockDocument = {
        createElement: vi.fn(() => mockLink),
        body: {
          appendChild: vi.fn((el) => {
            el.parentNode = mockDocument.body;
            appendChildMock(el);
          }),
          removeChild: vi.fn((el) => {
            el.parentNode = null;
            removeChildMock(el);
          })
        }
      };

      const mockUrl = {
        createObjectURL: vi.fn(() => 'blob:http://localhost/mock-uuid'),
        revokeObjectURL: vi.fn()
      };

      const origWindow = globalThis.window;
      const origDocument = globalThis.document;
      const origUrl = globalThis.URL;

      try {
        globalThis.window = {};
        globalThis.document = mockDocument;
        globalThis.URL = mockUrl;

        const res = downloadCsvFile('test-data', 'test-download.csv');
        expect(res.success).toBe(true);
        expect(res.isBrowser).toBe(true);
        expect(clickMock).toHaveBeenCalled();
        expect(mockDocument.createElement).toHaveBeenCalledWith('a');
        expect(appendChildMock).toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(removeChildMock).toHaveBeenCalled();
        expect(mockUrl.revokeObjectURL).toHaveBeenCalled();
      } finally {
        globalThis.window = origWindow;
        globalThis.document = origDocument;
        globalThis.URL = origUrl;
        vi.useRealTimers();
      }
    });
  });

  describe('8. End-to-End Database Integration (exportTransactions)', () => {
    let testDb;

    beforeEach(async () => {
      testDb = new ExpenseDatabase('test-csv-export-db-' + Math.random().toString(36).slice(2));
      await testDb.open();

      // Seed settings
      await testDb.settings.put({ key: 'base_currency', value: 'SAR' });

      // Seed accounts
      await testDb.accounts.bulkAdd([
        {
          id: 'acc-1',
          name: 'المحفظة النقدية',
          type: 'cash',
          initial_balance: 10000,
          current_balance: 10000,
          currency: 'SAR',
          deleted_at: null
        },
        {
          id: 'acc-2',
          name: 'بنك الراجحي',
          type: 'bank',
          initial_balance: 50000,
          current_balance: 50000,
          currency: 'SAR',
          deleted_at: null
        }
      ]);

      // Seed categories
      await testDb.categories.bulkAdd([
        {
          id: 'cat-1',
          name: 'مطاعم وكافيهات',
          slug: 'cat_food',
          type: 'expense',
          deleted_at: null
        },
        {
          id: 'cat-2',
          name: 'الراتب الأساسي',
          slug: 'cat_salary',
          type: 'income',
          deleted_at: null
        }
      ]);

      // Seed transactions
      await testDb.transactions.bulkAdd([
        {
          id: 'tx-1',
          type: 'expense',
          amount: 4500, // 45.00 SAR
          date: '2026-10-25',
          category_id: 'cat-1',
          account_id: 'acc-1',
          payment_method: 'نقدي',
          notes: 'وجبة عشاء',
          tags: ['طعام', 'مطاعم'],
          created_at: '2026-10-25T19:00:00Z',
          deleted_at: null
        },
        {
          id: 'tx-2',
          type: 'income',
          amount: 800000, // 8,000.00 SAR
          date: '2026-10-24',
          category_id: 'cat-2',
          account_id: 'acc-2',
          payment_method: 'تحويل',
          notes: 'مستحقات الاستشارة',
          tags: ['عمل'],
          created_at: '2026-10-24T10:00:00Z',
          deleted_at: null
        },
        {
          id: 'tx-3',
          type: 'transfer',
          amount: 10000, // 100.00 SAR
          date: '2026-10-23',
          category_id: null,
          account_id: 'acc-2',
          destination_account_id: 'acc-1',
          payment_method: 'سحب آلي',
          notes: 'سحب كاش للمحفظة',
          tags: ['سحب'],
          created_at: '2026-10-23T14:00:00Z',
          deleted_at: null
        },
        {
          id: 'tx-deleted',
          type: 'expense',
          amount: 2000,
          date: '2026-10-22',
          category_id: 'cat-1',
          account_id: 'acc-1',
          notes: 'محذوفة',
          deleted_at: '2026-10-22T15:00:00Z'
        }
      ]);
    });

    afterEach(async () => {
      if (testDb) {
        await testDb.delete();
      }
    });

    it('exports all active transactions directly from the database with correct relations', async () => {
      const result = await exportTransactions({
        database: testDb,
        download: false
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.csv.startsWith(UTF8_BOM)).toBe(true);

      // Verify expense row
      expect(result.csv).toContain('45.00');
      expect(result.csv).toContain('مطاعم وكافيهات');
      expect(result.csv).toContain('المحفظة النقدية');

      // Verify income row
      expect(result.csv).toContain('8000.00');
      expect(result.csv).toContain('الراتب الأساسي');
      expect(result.csv).toContain('بنك الراجحي');

      // Verify transfer row
      expect(result.csv).toContain('100.00');
      expect(result.csv).toContain('تحويل مالي');

      // Verify soft-deleted transaction is excluded
      expect(result.csv).not.toContain('محذوفة');
    });

    it('exports filtered transaction subset when transactions option is provided', async () => {
      // Pass only expense transaction
      const customList = [
        {
          id: 'tx-1',
          type: 'expense',
          amount: 4500,
          date: '2026-10-25',
          category_id: 'cat-1',
          account_id: 'acc-1',
          deleted_at: null
        }
      ];

      const result = await exportTransactions({
        database: testDb,
        transactions: customList,
        download: false
      });

      expect(result.count).toBe(1);
      expect(result.csv).toContain('45.00');
      expect(result.csv).not.toContain('8000.00');
      expect(result.csv).not.toContain('100.00');
    });
  });
});
