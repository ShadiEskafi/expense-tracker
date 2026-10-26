import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../db/db.js';
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
  BackupValidationError,
  BackupRestoreError,
  createBackup,
  downloadBackup,
  validateBackupFile,
  parseBackupFile,
  previewBackupMetadata,
  createSafetySnapshot,
  restoreFromSafetySnapshot,
  restoreFromBackup
} from './backupRestore.js';

describe('Atomic JSON Backup & Restore Pipeline (F016)', () => {
  let database;

  beforeEach(async () => {
    database = new ExpenseDatabase(`TestDB_${Date.now()}_${Math.random()}`);
    await database.open();
  });

  const seedTestData = async (dbInstance) => {
    const now = new Date().toISOString();
    const accounts = [
      {
        id: 'acc-cash',
        user_id: null,
        name: 'نقد',
        type: 'cash',
        initial_balance: 50000,
        current_balance: 45000,
        currency: 'SAR',
        is_archived: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      },
      {
        id: 'acc-bank',
        user_id: null,
        name: 'حساب بنكي',
        type: 'bank',
        initial_balance: 200000,
        current_balance: 200000,
        currency: 'SAR',
        is_archived: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      }
    ];

    const categories = [
      {
        id: 'cat-food',
        user_id: null,
        slug: 'cat_food',
        name: 'طعام ومطاعم',
        type: 'expense',
        icon: 'utensils',
        color: '#F97316',
        is_default: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      },
      {
        id: 'cat-salary',
        user_id: null,
        slug: 'cat_salary',
        name: 'راتب',
        type: 'income',
        icon: 'banknote',
        color: '#10B981',
        is_default: true,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      },
      {
        id: 'cat-old',
        user_id: null,
        slug: null,
        name: 'تصنيف محذوف ناعماً',
        type: 'expense',
        icon: 'trash',
        color: '#EF4444',
        is_default: false,
        created_at: now,
        updated_at: now,
        deleted_at: now,
        sync_version: 2
      }
    ];

    const transactions = [
      {
        id: 'txn-1',
        user_id: null,
        type: 'expense',
        amount: 5000,
        date: '2026-10-20',
        category_id: 'cat-food',
        account_id: 'acc-cash',
        destination_account_id: null,
        payment_method: 'cash',
        notes: 'غداء عمل',
        tags: ['طعام', 'عمل'],
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      },
      {
        id: 'txn-2',
        user_id: null,
        type: 'income',
        amount: 1500000,
        date: '2026-10-01',
        category_id: 'cat-salary',
        account_id: 'acc-bank',
        destination_account_id: null,
        payment_method: 'bank',
        notes: 'راتب شهري',
        tags: ['راتب'],
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1
      },
      {
        id: 'txn-deleted',
        user_id: null,
        type: 'expense',
        amount: 2000,
        date: '2026-10-05',
        category_id: 'cat-food',
        account_id: 'acc-cash',
        destination_account_id: null,
        payment_method: 'cash',
        notes: 'معاملة ملغاة',
        tags: [],
        created_at: now,
        updated_at: now,
        deleted_at: now,
        sync_version: 2
      }
    ];

    const settings = [
      { key: 'base_currency', value: 'SAR', updated_at: now },
      { key: 'theme', value: 'light', updated_at: now }
    ];

    const queue = [
      {
        id: 'mut-1',
        entity_type: 'transaction',
        entity_id: 'txn-1',
        action: 'UPSERT',
        client_base_version: 0,
        payload: transactions[0],
        client_timestamp: now,
        retry_count: 0,
        status: 'pending'
      }
    ];

    const conflict = [
      {
        id: 'conf-1',
        entity_type: 'transaction',
        entity_id: 'txn-1',
        client_payload: transactions[0],
        server_payload: transactions[0],
        resolved_at: now,
        resolution_note: 'Resolved via OCC'
      }
    ];

    await dbInstance.transaction('rw', dbInstance.tables, async () => {
      await dbInstance.accounts.bulkAdd(accounts);
      await dbInstance.categories.bulkAdd(categories);
      await dbInstance.transactions.bulkAdd(transactions);
      await dbInstance.settings.bulkAdd(settings);
      await dbInstance.offline_mutation_queue.bulkAdd(queue);
      await dbInstance.conflict_audit_log.bulkAdd(conflict);
    });

    return { accounts, categories, transactions, settings, queue, conflict };
  };

  describe('1. Constants & Schema Specifications', () => {
    it('defines BACKUP_SCHEMA_VERSION as 1', () => {
      expect(BACKUP_SCHEMA_VERSION).toBe(1);
    });

    it('defines BACKUP_TABLES containing core tables only', () => {
      expect(BACKUP_TABLES).toEqual(['accounts', 'categories', 'transactions', 'settings']);
      expect(BACKUP_TABLES).not.toContain('offline_mutation_queue');
      expect(BACKUP_TABLES).not.toContain('conflict_audit_log');
    });

    it('exports proper custom error classes', () => {
      const valErr = new BackupValidationError('اختبار تحقق');
      expect(valErr).toBeInstanceOf(Error);
      expect(valErr.name).toBe('BackupValidationError');
      expect(valErr.message).toBe('اختبار تحقق');

      const resErr = new BackupRestoreError('اختبار استعادة');
      expect(resErr).toBeInstanceOf(Error);
      expect(resErr.name).toBe('BackupRestoreError');
      expect(resErr.message).toBe('اختبار استعادة');
    });
  });

  describe('2. Backup Creation (createBackup)', () => {
    it('creates an empty backup from fresh database', async () => {
      const backup = await createBackup(database);
      expect(backup.schema_version).toBe(1);
      expect(backup.app_name).toBe('ExpenseTrackerApp');
      expect(typeof backup.created_at).toBe('string');
      expect(backup.metadata).toEqual({
        account_count: 0,
        category_count: 0,
        transaction_count: 0,
        base_currency: null
      });
      expect(backup.data.accounts).toEqual([]);
      expect(backup.data.categories).toEqual([]);
      expect(backup.data.transactions).toEqual([]);
      expect(backup.data.settings).toEqual([]);
    });

    it('creates a complete backup including all records and metadata', async () => {
      await seedTestData(database);

      const backup = await createBackup(database);
      expect(backup.schema_version).toBe(1);
      expect(backup.app_name).toBe('ExpenseTrackerApp');
      expect(backup.metadata.account_count).toBe(2);
      expect(backup.metadata.category_count).toBe(3);
      expect(backup.metadata.transaction_count).toBe(3);
      expect(backup.metadata.base_currency).toBe('SAR');

      expect(backup.data.accounts).toHaveLength(2);
      expect(backup.data.categories).toHaveLength(3);
      expect(backup.data.transactions).toHaveLength(3);
      expect(backup.data.settings).toHaveLength(2);

      // Verify soft-deleted items are included in full backup
      const deletedCat = backup.data.categories.find((c) => c.id === 'cat-old');
      expect(deletedCat).toBeDefined();
      expect(deletedCat.deleted_at).not.toBeNull();

      const deletedTxn = backup.data.transactions.find((t) => t.id === 'txn-deleted');
      expect(deletedTxn).toBeDefined();
      expect(deletedTxn.deleted_at).not.toBeNull();
    });

    it('does not include ephemeral sync queues in exported backup data', async () => {
      await seedTestData(database);
      const backup = await createBackup(database);
      expect(backup.data.offline_mutation_queue).toBeUndefined();
      expect(backup.data.conflict_audit_log).toBeUndefined();
    });
  });

  describe('3. Validation (validateBackupFile)', () => {
    it('validates a well-formed backup object successfully', async () => {
      await seedTestData(database);
      const backup = await createBackup(database);

      const result = validateBackupFile(backup);
      expect(result.valid).toBe(true);
      expect(result.metadata.account_count).toBe(2);
      expect(result.metadata.category_count).toBe(3);
      expect(result.metadata.transaction_count).toBe(3);
      expect(result.metadata.base_currency).toBe('SAR');
    });

    it('throws BackupValidationError for non-object or null input', () => {
      expect(() => validateBackupFile(null)).toThrow(BackupValidationError);
      expect(() => validateBackupFile(undefined)).toThrow(BackupValidationError);
      expect(() => validateBackupFile('invalid string')).toThrow(BackupValidationError);
      expect(() => validateBackupFile(12345)).toThrow(BackupValidationError);
      expect(() => validateBackupFile([])).toThrow(BackupValidationError);
    });

    it('throws BackupValidationError for missing or invalid schema_version', () => {
      expect(() => validateBackupFile({ data: {} })).toThrow(BackupValidationError);
      expect(() => validateBackupFile({ schema_version: 99, data: {} })).toThrow(BackupValidationError);
      expect(() => validateBackupFile({ schema_version: '1', data: {} })).toThrow(BackupValidationError);
    });

    it('throws BackupValidationError for missing or invalid data object', () => {
      expect(() => validateBackupFile({ schema_version: 1 })).toThrow(BackupValidationError);
      expect(() => validateBackupFile({ schema_version: 1, data: null })).toThrow(BackupValidationError);
      expect(() => validateBackupFile({ schema_version: 1, data: [] })).toThrow(BackupValidationError);
      expect(() => validateBackupFile({ schema_version: 1, data: 'not-an-object' })).toThrow(BackupValidationError);
    });

    it('throws BackupValidationError when any of the 4 core tables is missing or not an array', () => {
      const base = {
        schema_version: 1,
        data: {
          accounts: [],
          categories: [],
          transactions: [],
          settings: []
        }
      };

      // Missing accounts
      const noAccounts = { ...base, data: { ...base.data } };
      delete noAccounts.data.accounts;
      expect(() => validateBackupFile(noAccounts)).toThrow(BackupValidationError);

      // Accounts is an object instead of array
      const objAccounts = { ...base, data: { ...base.data, accounts: {} } };
      expect(() => validateBackupFile(objAccounts)).toThrow(BackupValidationError);

      // Missing categories
      const noCategories = { ...base, data: { ...base.data } };
      delete noCategories.data.categories;
      expect(() => validateBackupFile(noCategories)).toThrow(BackupValidationError);

      // Missing transactions
      const noTxns = { ...base, data: { ...base.data } };
      delete noTxns.data.transactions;
      expect(() => validateBackupFile(noTxns)).toThrow(BackupValidationError);

      // Missing settings
      const noSettings = { ...base, data: { ...base.data } };
      delete noSettings.data.settings;
      expect(() => validateBackupFile(noSettings)).toThrow(BackupValidationError);
    });

    it('derives metadata dynamically if metadata property is omitted from backup', () => {
      const backupWithoutMetadata = {
        schema_version: 1,
        data: {
          accounts: [{ id: 'a1' }],
          categories: [{ id: 'c1' }, { id: 'c2' }],
          transactions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
          settings: [{ key: 'base_currency', value: 'KWD' }]
        }
      };

      const result = validateBackupFile(backupWithoutMetadata);
      expect(result.valid).toBe(true);
      expect(result.metadata.account_count).toBe(1);
      expect(result.metadata.category_count).toBe(2);
      expect(result.metadata.transaction_count).toBe(3);
      expect(result.metadata.base_currency).toBe('KWD');
    });
  });

  describe('4. Metadata Preview (previewBackupMetadata)', () => {
    it('extracts metadata from backup object correctly', async () => {
      await seedTestData(database);
      const backup = await createBackup(database);

      const preview = previewBackupMetadata(backup);
      expect(preview.account_count).toBe(2);
      expect(preview.category_count).toBe(3);
      expect(preview.transaction_count).toBe(3);
      expect(preview.base_currency).toBe('SAR');
      expect(typeof preview.created_at).toBe('string');
    });

    it('falls back to data lengths and settings when metadata is missing or null', () => {
      const rawBackup = {
        created_at: '2026-10-26T10:00:00.000Z',
        data: {
          accounts: [{ id: '1' }],
          categories: [],
          transactions: [{ id: 't1' }, { id: 't2' }],
          settings: [{ key: 'base_currency', value: 'AED' }]
        }
      };

      const preview = previewBackupMetadata(rawBackup);
      expect(preview.account_count).toBe(1);
      expect(preview.category_count).toBe(0);
      expect(preview.transaction_count).toBe(2);
      expect(preview.base_currency).toBe('AED');
      expect(preview.created_at).toBe('2026-10-26T10:00:00.000Z');
    });

    it('handles empty or malformed inputs without throwing', () => {
      const preview = previewBackupMetadata({});
      expect(preview.account_count).toBe(0);
      expect(preview.category_count).toBe(0);
      expect(preview.transaction_count).toBe(0);
      expect(preview.base_currency).toBeNull();
      expect(preview.created_at).toBeNull();
    });
  });

  describe('5. Safety Snapshot (createSafetySnapshot & restoreFromSafetySnapshot)', () => {
    it('creates a safety snapshot that includes all 6 tables including mutation queues', async () => {
      await seedTestData(database);
      const snapshot = await createSafetySnapshot(database);

      expect(snapshot.schema_version).toBe(1);
      expect(snapshot.data.accounts).toHaveLength(2);
      expect(snapshot.data.categories).toHaveLength(3);
      expect(snapshot.data.transactions).toHaveLength(3);
      expect(snapshot.data.settings).toHaveLength(2);
      expect(snapshot.data.offline_mutation_queue).toHaveLength(1);
      expect(snapshot.data.conflict_audit_log).toHaveLength(1);
    });

    it('restores database completely from a safety snapshot', async () => {
      await seedTestData(database);
      const snapshot = await createSafetySnapshot(database);

      // Modify the database drastically
      await database.transaction('rw', database.tables, async () => {
        await database.accounts.clear();
        await database.transactions.clear();
        await database.offline_mutation_queue.clear();
      });

      expect(await database.accounts.count()).toBe(0);
      expect(await database.transactions.count()).toBe(0);

      // Restore from snapshot
      await restoreFromSafetySnapshot(snapshot, database);

      expect(await database.accounts.count()).toBe(2);
      expect(await database.categories.count()).toBe(3);
      expect(await database.transactions.count()).toBe(3);
      expect(await database.settings.count()).toBe(2);
      expect(await database.offline_mutation_queue.count()).toBe(1);
      expect(await database.conflict_audit_log.count()).toBe(1);
    });
  });

  describe('6. Atomic Restore Pipeline (restoreFromBackup)', () => {
    it('atomically replaces existing data with backup data', async () => {
      // 1. Initial state
      await seedTestData(database);
      expect(await database.accounts.count()).toBe(2);

      // 2. Prepare new backup data
      const newBackup = {
        schema_version: 1,
        app_name: 'ExpenseTrackerApp',
        created_at: new Date().toISOString(),
        metadata: {
          account_count: 1,
          category_count: 1,
          transaction_count: 1,
          base_currency: 'USD'
        },
        data: {
          accounts: [
            {
              id: 'acc-usd',
              user_id: null,
              name: 'USD Account',
              type: 'bank',
              initial_balance: 10000,
              current_balance: 10000,
              currency: 'USD',
              is_archived: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
              sync_version: 1
            }
          ],
          categories: [
            {
              id: 'cat-usd-exp',
              user_id: null,
              slug: 'cat_misc',
              name: 'متفرقات',
              type: 'expense',
              icon: 'shopping-bag',
              color: '#3B82F6',
              is_default: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
              sync_version: 1
            }
          ],
          transactions: [
            {
              id: 'txn-usd-1',
              user_id: null,
              type: 'expense',
              amount: 2500,
              date: '2026-10-25',
              category_id: 'cat-usd-exp',
              account_id: 'acc-usd',
              destination_account_id: null,
              payment_method: 'card',
              notes: 'Dollar expense',
              tags: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
              sync_version: 1
            }
          ],
          settings: [
            { key: 'base_currency', value: 'USD', updated_at: new Date().toISOString() }
          ]
        }
      };

      const result = await restoreFromBackup(newBackup, database);
      expect(result.success).toBe(true);
      expect(result.metadata.base_currency).toBe('USD');
      expect(result.metadata.account_count).toBe(1);

      // Verify DB contains only restored data
      expect(await database.accounts.count()).toBe(1);
      const acc = await database.accounts.get('acc-usd');
      expect(acc).toBeDefined();
      expect(acc.name).toBe('USD Account');

      expect(await database.categories.count()).toBe(1);
      expect(await database.transactions.count()).toBe(1);
      expect(await database.settings.get('base_currency')).toEqual({
        key: 'base_currency',
        value: 'USD',
        updated_at: expect.any(String)
      });
    });

    it('rejects invalid backup without altering existing database state', async () => {
      await seedTestData(database);
      const accountsBefore = await database.accounts.toArray();

      const invalidBackup = { schema_version: 999, data: {} };

      await expect(restoreFromBackup(invalidBackup, database)).rejects.toThrow(BackupRestoreError);

      const accountsAfter = await database.accounts.toArray();
      expect(accountsAfter).toEqual(accountsBefore);
    });

    it('rolls back to safety snapshot if atomic insertion fails midway', async () => {
      await seedTestData(database);
      const initialAccounts = await database.accounts.toArray();

      // Corrupt backup where transactions has an invalid record violating primary key or bulkAdd
      const failingBackup = {
        schema_version: 1,
        data: {
          accounts: [{ id: 'temp-acc', name: 'Temp' }],
          categories: [],
          // Providing duplicate IDs in array to induce bulkAdd constraint error
          transactions: [
            { id: 'dup-id', amount: 100 },
            { id: 'dup-id', amount: 200 }
          ],
          settings: []
        }
      };

      await expect(restoreFromBackup(failingBackup, database)).rejects.toThrow(BackupRestoreError);

      // Ensure state is preserved exactly as before
      const accountsAfter = await database.accounts.toArray();
      expect(accountsAfter.map((a) => a.id)).toEqual(initialAccounts.map((a) => a.id));
    });

    it('preserves full fidelity across complete export-restore cycle', async () => {
      await seedTestData(database);
      const backup = await createBackup(database);

      // Wipe current DB
      await database.resetDatabase();
      expect(await database.accounts.count()).toBe(0);

      // Restore
      await restoreFromBackup(backup, database);

      expect(await database.accounts.count()).toBe(2);
      expect(await database.categories.count()).toBe(3);
      expect(await database.transactions.count()).toBe(3);
      expect(await database.settings.count()).toBe(2);

      const restoredTxns = await database.transactions.toArray();
      const expenseTxn = restoredTxns.find((t) => t.id === 'txn-1');
      expect(expenseTxn.amount).toBe(5000);
      expect(expenseTxn.tags).toEqual(['طعام', 'عمل']);
    });
  });

  describe('7. File Parsing & Browser Download Helpers', () => {
    it('parses valid File object via parseBackupFile', async () => {
      const mockData = {
        schema_version: 1,
        metadata: { account_count: 1, category_count: 0, transaction_count: 0, base_currency: 'SAR' },
        data: {
          accounts: [{ id: 'a1' }],
          categories: [],
          transactions: [],
          settings: []
        }
      };

      const mockFile = {
        text: vi.fn().mockResolvedValue(JSON.stringify(mockData))
      };

      const result = await parseBackupFile(mockFile);
      expect(result.data.accounts).toHaveLength(1);
      expect(result.metadata.base_currency).toBe('SAR');
    });

    it('throws BackupValidationError when parseBackupFile encounters invalid JSON', async () => {
      const mockFile = {
        text: vi.fn().mockResolvedValue('invalid { json ...')
      };

      await expect(parseBackupFile(mockFile)).rejects.toThrow(BackupValidationError);
    });

    it('throws BackupValidationError when File read fails in parseBackupFile', async () => {
      const mockFile = {
        text: vi.fn().mockRejectedValue(new Error('Disk read failure'))
      };

      await expect(parseBackupFile(mockFile)).rejects.toThrow(BackupValidationError);
    });

    it('triggers DOM download in downloadBackup in browser environment', async () => {
      await seedTestData(database);

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn()
      };

      const mockDoc = {
        createElement: vi.fn().mockReturnValue(mockAnchor),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn()
        }
      };

      const origWindow = globalThis.window;
      const origDoc = globalThis.document;
      const origUrl = globalThis.URL;

      globalThis.window = {};
      globalThis.document = mockDoc;
      globalThis.URL = {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn()
      };

      try {
        const res = await downloadBackup(database);
        expect(res.filename).toMatch(/^expense-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
        expect(res.size).toBeGreaterThan(0);
        expect(mockDoc.createElement).toHaveBeenCalledWith('a');
        expect(mockDoc.body.appendChild).toHaveBeenCalledWith(mockAnchor);
        expect(mockAnchor.click).toHaveBeenCalled();
        expect(mockDoc.body.removeChild).toHaveBeenCalledWith(mockAnchor);
        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      } finally {
        globalThis.window = origWindow;
        globalThis.document = origDoc;
        globalThis.URL = origUrl;
      }
    });

    it('gracefully completes without throwing in non-browser environment', async () => {
      await seedTestData(database);

      const origWindow = globalThis.window;
      const origDoc = globalThis.document;

      delete globalThis.window;
      delete globalThis.document;

      try {
        const res = await downloadBackup(database);
        expect(res.filename).toMatch(/^expense-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
        expect(res.size).toBeGreaterThan(0);
      } finally {
        if (origWindow !== undefined) globalThis.window = origWindow;
        if (origDoc !== undefined) globalThis.document = origDoc;
      }
    });
  });
});
