import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpenseDatabase, db, SCHEMA_V1, DB_NAME } from './db.js';

describe('Local-First IndexedDB Schema & Database Client (F001)', () => {
  let testDb;

  beforeEach(() => {
    testDb = new ExpenseDatabase(`test-db-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  it('exports valid database configuration and default singleton instance', () => {
    expect(DB_NAME).toBe('ExpenseTrackerDB');
    expect(db).toBeInstanceOf(ExpenseDatabase);
    expect(SCHEMA_V1).toBeDefined();
    expect(Object.keys(SCHEMA_V1)).toEqual([
      'accounts',
      'categories',
      'transactions',
      'offline_mutation_queue',
      'conflict_audit_log',
      'settings'
    ]);
  });

  it('initializes all 6 required tables with correct schema names and primary keys', () => {
    const tableNames = testDb.tables.map((t) => t.name);
    expect(tableNames).toContain('accounts');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('offline_mutation_queue');
    expect(tableNames).toContain('conflict_audit_log');
    expect(tableNames).toContain('settings');

    expect(testDb.accounts.schema.primKey.name).toBe('id');
    expect(testDb.categories.schema.primKey.name).toBe('id');
    expect(testDb.transactions.schema.primKey.name).toBe('id');
    expect(testDb.offline_mutation_queue.schema.primKey.name).toBe('id');
    expect(testDb.conflict_audit_log.schema.primKey.name).toBe('id');
    expect(testDb.settings.schema.primKey.name).toBe('key');
  });

  it('verifies essential indexes are configured on primary entity tables', () => {
    const accountIndexNames = testDb.accounts.schema.indexes.map((idx) => idx.name);
    expect(accountIndexNames).toContain('user_id');
    expect(accountIndexNames).toContain('type');
    expect(accountIndexNames).toContain('deleted_at');
    expect(accountIndexNames).toContain('sync_version');

    const categoryIndexNames = testDb.categories.schema.indexes.map((idx) => idx.name);
    expect(categoryIndexNames).toContain('slug');
    expect(categoryIndexNames).toContain('type');
    expect(categoryIndexNames).toContain('is_default');
    expect(categoryIndexNames).toContain('deleted_at');

    const txIndexNames = testDb.transactions.schema.indexes.map((idx) => idx.name);
    expect(txIndexNames).toContain('type');
    expect(txIndexNames).toContain('date');
    expect(txIndexNames).toContain('category_id');
    expect(txIndexNames).toContain('account_id');
    expect(txIndexNames).toContain('destination_account_id');
    expect(txIndexNames).toContain('tags');
    expect(txIndexNames).toContain('deleted_at');

    // Multi-entry index verification for tags
    const tagsIndex = testDb.transactions.schema.indexes.find((idx) => idx.name === 'tags');
    expect(tagsIndex?.multi).toBe(true);

    const queueIndexNames = testDb.offline_mutation_queue.schema.indexes.map((idx) => idx.name);
    expect(queueIndexNames).toContain('status');
    expect(queueIndexNames).toContain('entity_type');

    const auditIndexNames = testDb.conflict_audit_log.schema.indexes.map((idx) => idx.name);
    expect(auditIndexNames).toContain('entity_type');
    expect(auditIndexNames).toContain('entity_id');
  });

  it('performs CRUD operations on accounts table', async () => {
    const account = {
      id: 'acc-uuid-1',
      user_id: null,
      name: 'الحساب الجاري',
      type: 'bank',
      initial_balance: 500000,
      current_balance: 500000,
      currency: 'SAR',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_version: 1
    };

    await testDb.accounts.add(account);
    const retrieved = await testDb.accounts.get('acc-uuid-1');
    expect(retrieved).toEqual(account);

    const bankAccounts = await testDb.accounts.where('type').equals('bank').toArray();
    expect(bankAccounts).toHaveLength(1);
    expect(bankAccounts[0].name).toBe('الحساب الجاري');
  });

  it('performs CRUD operations on categories table including slug indexing', async () => {
    const category = {
      id: 'cat-uuid-1',
      user_id: null,
      slug: 'cat_groceries',
      name: 'بقالة ومواد غذائية',
      type: 'expense',
      icon: 'shopping-cart',
      color: '#10B981',
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_version: 1
    };

    await testDb.categories.add(category);
    const bySlug = await testDb.categories.where('slug').equals('cat_groceries').first();
    expect(bySlug).toBeDefined();
    expect(bySlug?.id).toBe('cat-uuid-1');
    expect(bySlug?.is_default).toBe(true);
  });

  it('performs CRUD operations on transactions with multi-entry tags indexing', async () => {
    const tx = {
      id: 'tx-uuid-1',
      user_id: null,
      type: 'expense',
      amount: 15000, // 150.00 SAR in minor units
      date: '2026-10-24',
      category_id: 'cat-uuid-1',
      account_id: 'acc-uuid-1',
      destination_account_id: null,
      payment_method: 'card',
      notes: 'سوبرماركت التميمي',
      tags: ['طعام', 'أسرة', 'عطلة'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      sync_version: 1
    };

    await testDb.transactions.add(tx);
    const byTag = await testDb.transactions.where('tags').equals('طعام').toArray();
    expect(byTag).toHaveLength(1);
    expect(byTag[0].id).toBe('tx-uuid-1');

    const byAccount = await testDb.transactions.where('account_id').equals('acc-uuid-1').toArray();
    expect(byAccount).toHaveLength(1);
  });

  it('stores and retrieves offline mutations and conflict logs', async () => {
    const mutation = {
      id: 'mut-uuid-1',
      entity_type: 'transaction',
      entity_id: 'tx-uuid-1',
      action: 'UPSERT',
      client_base_version: 1,
      payload: { id: 'tx-uuid-1', amount: 15000 },
      client_timestamp: new Date().toISOString(),
      retry_count: 0,
      status: 'pending'
    };

    await testDb.offline_mutation_queue.add(mutation);
    const pendingMutations = await testDb.offline_mutation_queue.where('status').equals('pending').toArray();
    expect(pendingMutations).toHaveLength(1);
    expect(pendingMutations[0].entity_type).toBe('transaction');

    const conflict = {
      id: 'conf-uuid-1',
      entity_type: 'transaction',
      entity_id: 'tx-uuid-1',
      client_payload: { amount: 15000 },
      server_payload: { amount: 18000 },
      resolved_at: new Date().toISOString(),
      resolution_note: 'Server version retained under OCC rule'
    };

    await testDb.conflict_audit_log.add(conflict);
    const auditLogs = await testDb.conflict_audit_log.where('entity_id').equals('tx-uuid-1').toArray();
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].resolution_note).toContain('OCC rule');
  });

  it('stores and retrieves settings via key primary key', async () => {
    await testDb.settings.put({
      key: 'base_currency',
      value: 'SAR',
      updated_at: new Date().toISOString()
    });

    const setting = await testDb.settings.get('base_currency');
    expect(setting).toBeDefined();
    expect(setting.value).toBe('SAR');
  });

  it('clears all tables cleanly using resetDatabase', async () => {
    await testDb.accounts.add({ id: 'acc-1', name: 'نقدي', type: 'cash' });
    await testDb.categories.add({ id: 'cat-1', name: 'أخرى', type: 'expense' });
    await testDb.settings.put({ key: 'theme', value: 'light' });

    expect(await testDb.accounts.count()).toBe(1);
    expect(await testDb.categories.count()).toBe(1);
    expect(await testDb.settings.count()).toBe(1);

    await testDb.resetDatabase();

    expect(await testDb.accounts.count()).toBe(0);
    expect(await testDb.categories.count()).toBe(0);
    expect(await testDb.settings.count()).toBe(0);
  });
});
