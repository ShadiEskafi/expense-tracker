import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../db/db.js';
import { inspectSignOutSafety, purgeLocalCloudCache, SignOutBlockedError } from './signOutSafety.js';

describe('F019 sign-out safety', () => {
  let database;

  beforeEach(async () => {
    database = new ExpenseDatabase(`signout_${Date.now()}_${Math.random()}`);
    await database.open();
  });

  afterEach(async () => {
    await database.delete();
  });

  it.each(['pending', 'failed', 'syncing'])('blocks sign-out for a %s mutation', async (status) => {
    await database.offline_mutation_queue.add({ id: 'q1', entity_id: 'tx1', status });

    expect(await inspectSignOutSafety(database)).toEqual({ pendingCount: 1, canSignOut: false });
    await expect(purgeLocalCloudCache(database, 'user-1')).rejects.toThrow(SignOutBlockedError);
    expect(await database.offline_mutation_queue.count()).toBe(1);
  });

  it('purges only the signed-out account and its metadata while preserving guest and other local settings', async () => {
    await database.accounts.bulkAdd([
      { id: 'cloud-account', user_id: 'user-1' },
      { id: 'guest-account', user_id: null }
    ]);
    await database.categories.bulkAdd([
      { id: 'cloud-category', user_id: 'user-1' },
      { id: 'guest-category', user_id: null }
    ]);
    await database.transactions.bulkAdd([
      { id: 'cloud-transaction', user_id: 'user-1' },
      { id: 'guest-transaction', user_id: null }
    ]);
    await database.offline_mutation_queue.bulkAdd([
      { id: 'cloud-queue', entity_id: 'cloud-transaction', status: 'synced' },
      { id: 'guest-queue', entity_id: 'guest-transaction', status: 'synced' }
    ]);
    await database.conflict_audit_log.bulkAdd([
      { id: 'cloud-conflict', entity_id: 'cloud-transaction', client_payload: { user_id: 'user-1' } },
      { id: 'guest-conflict', entity_id: 'guest-transaction', client_payload: { user_id: null } }
    ]);
    await database.settings.bulkAdd([
      { key: 'last_cloud_sync_timestamp', value: '2026-01-01T00:00:00Z' },
      { key: 'base_currency', value: 'ILS' }
    ]);

    await purgeLocalCloudCache(database, 'user-1');

    expect(await database.accounts.toArray()).toMatchObject([{ id: 'guest-account' }]);
    expect(await database.categories.toArray()).toMatchObject([{ id: 'guest-category' }]);
    expect(await database.transactions.toArray()).toMatchObject([{ id: 'guest-transaction' }]);
    expect(await database.offline_mutation_queue.toArray()).toMatchObject([{ id: 'guest-queue' }]);
    expect(await database.conflict_audit_log.toArray()).toMatchObject([{ id: 'guest-conflict' }]);
    expect(await database.settings.get('last_cloud_sync_timestamp')).toBeUndefined();
    expect((await database.settings.get('base_currency')).value).toBe('ILS');
  });

  it('rechecks the queue inside the purge transaction and leaves account data intact on failure', async () => {
    await database.accounts.add({ id: 'cloud-account', user_id: 'user-1' });
    expect((await inspectSignOutSafety(database)).canSignOut).toBe(true);
    await database.offline_mutation_queue.add({ id: 'late', entity_id: 'cloud-account', status: 'pending' });

    await expect(purgeLocalCloudCache(database, 'user-1')).rejects.toThrow(SignOutBlockedError);
    expect(await database.accounts.get('cloud-account')).toBeDefined();
    expect(await database.offline_mutation_queue.get('late')).toBeDefined();
  });
});
