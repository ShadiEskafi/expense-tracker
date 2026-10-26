import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ExpenseDatabase } from '../db/db.js';
import {
  getSupabaseClient,
  setSupabaseClient,
  resetSupabaseClient,
  getCurrentUser,
  isGuestMode,
  getAuthSession,
  signUpWithEmail,
  signInWithEmail,
  signOutUser,
  subscribeToAuthChanges,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  formatLastSyncTimeArabic,
  mergeGuestDataOnLogin,
  pushPendingMutations,
  pullRemoteUpdates,
  syncWithCloud,
  SignOutBlockedError
} from './cloudSync.js';
import { enqueueMutation, getPendingMutations, getConflictAuditLogs } from './syncQueue.js';

/**
 * Creates a mock Supabase client with in-memory stores for tables and auth
 */
function createMockSupabaseClient({
  initialUser = null,
  initialTables = {}
} = {}) {
  let currentUser = initialUser;
  let session = initialUser ? { access_token: 'fake-jwt', user: initialUser } : null;

  // In-memory tables: { accounts: [], categories: [], transactions: [] }
  const tables = {
    accounts: [...(initialTables.accounts || [])],
    categories: [...(initialTables.categories || [])],
    transactions: [...(initialTables.transactions || [])]
  };

  const client = {
    auth: {
      async getUser() {
        return { data: { user: currentUser }, error: null };
      },
      async getSession() {
        return { data: { session }, error: null };
      },
      async signUp({ email, password }) {
        if (!email || !password) {
          return { data: { user: null, session: null }, error: new Error('Missing email or password') };
        }
        currentUser = { id: 'usr-new-uuid-999', email };
        session = { access_token: 'fake-jwt-new', user: currentUser };
        return { data: { user: currentUser, session }, error: null };
      },
      async signInWithPassword({ email, password }) {
        if (password === 'wrong-password') {
          return { data: { user: null, session: null }, error: new Error('Invalid login credentials') };
        }
        currentUser = { id: 'usr-existing-uuid-111', email };
        session = { access_token: 'fake-jwt-existing', user: currentUser };
        return { data: { user: currentUser, session }, error: null };
      },
      async signOut() {
        currentUser = null;
        session = null;
        return { error: null };
      }
    },
    from(tableName) {
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      let currentData = [...tables[tableName]];

      const queryBuilder = {
        select() {
          return queryBuilder;
        },
        eq(field, val) {
          currentData = currentData.filter((row) => row[field] === val);
          return queryBuilder;
        },
        or(conditionStr) {
          // simple parser for conditions like: user_id.eq.XYZ,is_default.eq.true
          const parts = conditionStr.split(',');
          currentData = currentData.filter((row) => {
            return parts.some((p) => {
              if (p.includes('user_id.eq.')) {
                const uid = p.split('user_id.eq.')[1];
                return row.user_id === uid;
              }
              if (p.includes('is_default.eq.true')) {
                return row.is_default === true;
              }
              return false;
            });
          });
          return queryBuilder;
        },
        gt(field, val) {
          currentData = currentData.filter((row) => new Date(row[field]) > new Date(val));
          return queryBuilder;
        },
        maybeSingle() {
          return Promise.resolve({
            data: currentData.length > 0 ? { ...currentData[0] } : null,
            error: null
          });
        },
        single() {
          return Promise.resolve({
            data: currentData.length > 0 ? { ...currentData[0] } : null,
            error: currentData.length === 0 ? new Error('No row found') : null
          });
        },
        upsert(record) {
          const idx = tables[tableName].findIndex((r) => r.id === record.id);
          if (idx >= 0) {
            tables[tableName][idx] = { ...record };
          } else {
            tables[tableName].push({ ...record });
          }
          currentData = [{ ...record }];
          return {
            select() {
              return {
                single: async () => ({ data: { ...record }, error: null }),
                maybeSingle: async () => ({ data: { ...record }, error: null })
              };
            },
            data: { ...record },
            error: null,
            then(resolve, reject) {
              return Promise.resolve({ data: { ...record }, error: null }).then(resolve, reject);
            }
          };
        },
        update(patch) {
          return {
            eq(field, val) {
              const target = tables[tableName].find((r) => r[field] === val);
              if (target) {
                Object.assign(target, patch);
              }
              return {
                select() {
                  return {
                    single: async () => ({ data: target ? { ...target } : null, error: null })
                  };
                },
                then(resolve, reject) {
                  return Promise.resolve({ data: target, error: null }).then(resolve, reject);
                }
              };
            }
          };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: currentData, error: null }).then(resolve, reject);
        }
      };

      return queryBuilder;
    },
    // Expose in-memory tables for inspection in tests
    _tables: tables
  };

  return client;
}

describe('Supabase Cloud Sync & Initial Account Merge (F018)', () => {
  let testDb;

  beforeEach(async () => {
    testDb = new ExpenseDatabase(`TestDB_CloudSync_${Date.now()}_${Math.random()}`);
    await testDb.open();
    resetSupabaseClient();
  });

  afterEach(async () => {
    resetSupabaseClient();
    if (testDb) {
      await testDb.delete();
    }
  });

  describe('1. Supabase Client & Auth State Management', () => {
    it('returns null for getCurrentUser when no client or user is logged in (Guest Mode)', async () => {
      const user = await getCurrentUser(null);
      expect(user).toBeNull();
      const guest = await isGuestMode(null);
      expect(guest).toBe(true);
    });

    it('manages singleton client injection via setSupabaseClient and resetSupabaseClient', async () => {
      const mock = createMockSupabaseClient({ initialUser: { id: 'u1', email: 'test@example.com' } });
      setSupabaseClient(mock);
      expect(getSupabaseClient()).toBe(mock);

      const user = await getCurrentUser();
      expect(user).toEqual({ id: 'u1', email: 'test@example.com' });
      expect(await isGuestMode()).toBe(false);
      const session = await getAuthSession();
      expect(session).toBeDefined();
      expect(session.access_token).toBe('fake-jwt');

      resetSupabaseClient();
      expect(getSupabaseClient()).toBeNull();
    });

    it('subscribes to auth state changes and unsubscribes cleanly', () => {
      const listener = vi.fn();
      const unsub = subscribeToAuthChanges(listener);
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('throws validation errors on invalid email or password for signUp and signIn', async () => {
      const mock = createMockSupabaseClient();
      await expect(signUpWithEmail({ email: 'bad-email', password: '123', client: mock, database: testDb }))
        .rejects.toThrow('يرجى إدخال بريد إلكتروني صالح');

      await expect(signUpWithEmail({ email: 'good@test.com', password: '12', client: mock, database: testDb }))
        .rejects.toThrow('كلمة المرور يجب أن لا تقل عن 6 أحرف');

      await expect(signInWithEmail({ email: 'good@test.com', password: '', client: mock, database: testDb }))
        .rejects.toThrow('يرجى إدخال كلمة المرور');
    });

    it('signs in successfully with correct credentials and returns user and session', async () => {
      const mock = createMockSupabaseClient();
      const result = await signInWithEmail({
        email: 'user@finance.app',
        password: 'valid-password',
        client: mock,
        database: testDb
      });

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('user@finance.app');
      expect(result.session).toBeDefined();
      expect(result.mergeSummary).toBeDefined();
    });
  });

  describe('2. Fail-Safe Sign-Out Pre-Check (Offline Mutations)', () => {
    it('permits sign-out when offline_mutation_queue is clean (0 pending mutations)', async () => {
      const mock = createMockSupabaseClient({ initialUser: { id: 'usr-1', email: 'usr@test.com' } });
      const res = await signOutUser({ client: mock, database: testDb, force: false });
      expect(res.success).toBe(true);
      expect(await getCurrentUser(mock)).toBeNull();
    });

    it('blocks sign-out and throws SignOutBlockedError when pending mutations exist', async () => {
      const mock = createMockSupabaseClient({ initialUser: { id: 'usr-1', email: 'usr@test.com' } });

      // Enqueue an un-synced mutation
      await enqueueMutation({
        entity_type: 'transaction',
        entity_id: 'tx-101',
        payload: { id: 'tx-101', amount: 5000 },
        database: testDb
      });

      await expect(signOutUser({ client: mock, database: testDb, force: false }))
        .rejects.toThrow(SignOutBlockedError);

      try {
        await signOutUser({ client: mock, database: testDb, force: false });
      } catch (err) {
        expect(err.name).toBe('SignOutBlockedError');
        expect(err.pendingCount).toBe(1);
      }
    });

    it('allows forced sign-out even when pending mutations exist if force=true', async () => {
      const mock = createMockSupabaseClient({ initialUser: { id: 'usr-1', email: 'usr@test.com' } });
      await enqueueMutation({
        entity_type: 'transaction',
        entity_id: 'tx-102',
        payload: { id: 'tx-102', amount: 3000 },
        database: testDb
      });

      const res = await signOutUser({ client: mock, database: testDb, force: true });
      expect(res.success).toBe(true);
      expect(await getCurrentUser(mock)).toBeNull();
    });
  });

  describe('3. Deterministic Category Deduplication by Slug (ADR-006 & Section 19.2)', () => {
    it('deduplicates default categories by matching slug and re-maps guest transaction category_ids', async () => {
      const guestFoodId = 'guest-cat-food-uuid';
      const cloudFoodId = 'cloud-cat-food-uuid';
      const customCatId = 'guest-custom-cat-uuid';

      // 1. Seed guest categories in local IndexedDB
      await testDb.categories.bulkAdd([
        {
          id: guestFoodId,
          user_id: null,
          slug: 'cat_food',
          name: 'طعام ومطاعم',
          type: 'expense',
          is_default: true,
          sync_version: 1,
          updated_at: new Date().toISOString()
        },
        {
          id: customCatId,
          user_id: null,
          slug: null, // Custom category has no fixed default slug
          name: 'اشتراكات برمجية مخصصة',
          type: 'expense',
          is_default: false,
          sync_version: 1,
          updated_at: new Date().toISOString()
        }
      ]);

      // 2. Seed a guest account and 2 transactions
      await testDb.accounts.add({
        id: 'acc-cash-1',
        user_id: null,
        name: 'محفظة نقدية',
        type: 'cash',
        initial_balance: 0,
        current_balance: -7500,
        currency: 'SAR',
        deleted_at: null,
        sync_version: 1,
        updated_at: new Date().toISOString()
      });

      await testDb.transactions.bulkAdd([
        {
          id: 'tx-food-1',
          user_id: null,
          type: 'expense',
          amount: 5000,
          date: '2026-10-25',
          category_id: guestFoodId,
          account_id: 'acc-cash-1',
          deleted_at: null,
          sync_version: 1,
          updated_at: new Date().toISOString()
        },
        {
          id: 'tx-custom-1',
          user_id: null,
          type: 'expense',
          amount: 2500,
          date: '2026-10-25',
          category_id: customCatId,
          account_id: 'acc-cash-1',
          deleted_at: null,
          sync_version: 1,
          updated_at: new Date().toISOString()
        }
      ]);

      // 3. Create mock cloud client with existing cloud 'cat_food' category
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-auth-456', email: 'cloud@user.com' },
        initialTables: {
          categories: [
            {
              id: cloudFoodId,
              user_id: 'usr-auth-456',
              slug: 'cat_food',
              name: 'طعام ومطاعم',
              type: 'expense',
              is_default: true,
              sync_version: 5,
              updated_at: new Date().toISOString()
            }
          ]
        }
      });

      // 4. Execute initial merge
      const summary = await mergeGuestDataOnLogin({
        userId: 'usr-auth-456',
        client: mockCloudClient,
        database: testDb
      });

      expect(summary.success).toBe(true);
      expect(summary.deduplicatedCategoriesCount).toBe(1);

      // 5. Verify local categories
      const localCategories = await testDb.categories.toArray();
      const foodCategories = localCategories.filter((c) => c.slug === 'cat_food');
      expect(foodCategories.length).toBe(1);
      expect(foodCategories[0].id).toBe(cloudFoodId); // Deduplicated to cloud UUID

      const customCat = await testDb.categories.get(customCatId);
      expect(customCat).toBeDefined();
      expect(customCat.user_id).toBe('usr-auth-456');

      // 6. Verify local transactions re-mapped
      const txFood = await testDb.transactions.get('tx-food-1');
      expect(txFood.category_id).toBe(cloudFoodId); // Successfully remapped
      expect(txFood.user_id).toBe('usr-auth-456');

      const txCustom = await testDb.transactions.get('tx-custom-1');
      expect(txCustom.category_id).toBe(customCatId);
      expect(txCustom.user_id).toBe('usr-auth-456');

      // 7. Verify mutations were enqueued and pushed to cloud during merge sync
      expect(summary.syncResult).toBeDefined();
      expect(summary.syncResult.push.pushedCount).toBe(4); // 1 custom cat + 1 account + 2 tx
      const remainingQueued = await getPendingMutations({ database: testDb });
      expect(remainingQueued.length).toBe(0); // Cleanly dequeued upon cloud upload
      expect(mockCloudClient._tables.categories.some((c) => c.id === customCatId)).toBe(true);
      expect(mockCloudClient._tables.transactions.some((t) => t.id === 'tx-food-1')).toBe(true);
    });
  });

  describe('4. Account Independence (Section 19.3)', () => {
    it('preserves guest accounts as distinct entities without destructive blind merging', async () => {
      // Local guest has "حساب جاري"
      await testDb.accounts.add({
        id: 'acc-guest-checking',
        user_id: null,
        name: 'حساب جاري',
        type: 'bank',
        initial_balance: 100000,
        current_balance: 100000,
        currency: 'SAR',
        deleted_at: null,
        sync_version: 1,
        updated_at: new Date().toISOString()
      });

      // Cloud already has a "حساب جاري"
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-auth-789', email: 'user@bank.com' },
        initialTables: {
          accounts: [
            {
              id: 'acc-cloud-checking',
              user_id: 'usr-auth-789',
              name: 'حساب جاري',
              type: 'bank',
              initial_balance: 500000,
              current_balance: 500000,
              currency: 'SAR',
              deleted_at: null,
              sync_version: 3,
              updated_at: new Date().toISOString()
            }
          ]
        }
      });

      const summary = await mergeGuestDataOnLogin({
        userId: 'usr-auth-789',
        client: mockCloudClient,
        database: testDb
      });

      expect(summary.success).toBe(true);

      const localAcc = await testDb.accounts.get('acc-guest-checking');
      expect(localAcc.user_id).toBe('usr-auth-789');
      // Account name distinguished to prevent accidental balance mingling
      expect(localAcc.name).toContain('حساب جاري');
      expect(localAcc.name).toContain('(محلي)');
    });
  });

  describe('5. Push Mutations Cycle & Optimistic Concurrency Control (OCC)', () => {
    it('pushes pending mutations successfully when no conflict exists (version match)', async () => {
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-1', email: 'user@test.com' }
      });

      // Add account in local DB
      await testDb.accounts.add({
        id: 'acc-1',
        user_id: 'usr-1',
        name: 'محفظة',
        type: 'cash',
        initial_balance: 0,
        current_balance: 0,
        currency: 'SAR',
        deleted_at: null,
        sync_version: 1,
        updated_at: new Date().toISOString()
      });

      // Enqueue mutation with client_base_version = 0 (new account)
      await enqueueMutation({
        entity_type: 'account',
        entity_id: 'acc-1',
        action: 'UPSERT',
        client_base_version: 0,
        payload: {
          id: 'acc-1',
          user_id: 'usr-1',
          name: 'محفظة',
          type: 'cash',
          initial_balance: 0,
          current_balance: 0,
          currency: 'SAR',
          deleted_at: null
        },
        database: testDb
      });

      const res = await pushPendingMutations({
        client: mockCloudClient,
        database: testDb,
        userId: 'usr-1'
      });

      expect(res.pushedCount).toBe(1);
      expect(res.conflictsCount).toBe(0);
      expect(res.failedCount).toBe(0);

      // Verify mutation was dequeued
      const remaining = await getPendingMutations({ database: testDb });
      expect(remaining.length).toBe(0);

      // Verify remote table now has the account
      expect(mockCloudClient._tables.accounts.length).toBe(1);
      expect(mockCloudClient._tables.accounts[0].id).toBe('acc-1');
    });

    it('detects OCC version conflict, archives local edit into conflict_audit_log, and adopts canonical version', async () => {
      // Remote account already at sync_version = 5
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-1', email: 'user@test.com' },
        initialTables: {
          accounts: [
            {
              id: 'acc-conflict-1',
              user_id: 'usr-1',
              name: 'الحساب الرسمي في الخادم',
              type: 'bank',
              initial_balance: 1000,
              current_balance: 1000,
              currency: 'SAR',
              deleted_at: null,
              sync_version: 5,
              updated_at: '2026-10-25T12:00:00Z'
            }
          ]
        }
      });

      // Local database has account with conflicting local edit based on old version 2
      await testDb.accounts.add({
        id: 'acc-conflict-1',
        user_id: 'usr-1',
        name: 'التعديل المحلي المتعارض',
        type: 'bank',
        initial_balance: 1000,
        current_balance: 1000,
        currency: 'SAR',
        deleted_at: null,
        sync_version: 2,
        updated_at: '2026-10-26T08:00:00Z'
      });

      await enqueueMutation({
        entity_type: 'account',
        entity_id: 'acc-conflict-1',
        action: 'UPSERT',
        client_base_version: 2, // Mismatch with server's 5!
        payload: {
          id: 'acc-conflict-1',
          name: 'التعديل المحلي المتعارض',
          sync_version: 2
        },
        database: testDb
      });

      const pushRes = await pushPendingMutations({
        client: mockCloudClient,
        database: testDb,
        userId: 'usr-1'
      });

      expect(pushRes.conflictsCount).toBe(1);
      expect(pushRes.pushedCount).toBe(0);

      // Verify conflict audit log entry was created
      const auditLogs = await getConflictAuditLogs({ database: testDb });
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].entity_id).toBe('acc-conflict-1');
      expect(auditLogs[0].client_payload.name).toBe('التعديل المحلي المتعارض');
      expect(auditLogs[0].server_payload.name).toBe('الحساب الرسمي في الخادم');

      // Verify local table adopted server canonical record
      const localRecord = await testDb.accounts.get('acc-conflict-1');
      expect(localRecord.name).toBe('الحساب الرسمي في الخادم');
      expect(localRecord.sync_version).toBe(5);

      // Verify mutation was dequeued upon conflict resolution
      const pending = await getPendingMutations({ database: testDb });
      expect(pending.length).toBe(0);
    });

    it('marks mutation failed and records error on network or server error', async () => {
      // Client throwing network error
      const brokenClient = {
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        from() {
          throw new Error('Network timeout: Failed to connect to Supabase');
        }
      };

      await enqueueMutation({
        entity_type: 'category',
        entity_id: 'cat-fail-1',
        action: 'UPSERT',
        client_base_version: 1,
        payload: { id: 'cat-fail-1', name: 'فئة معطلة' },
        database: testDb
      });

      const res = await pushPendingMutations({
        client: brokenClient,
        database: testDb,
        userId: 'u1'
      });

      expect(res.failedCount).toBe(1);
      const pending = await getPendingMutations({ database: testDb, statuses: ['failed'] });
      expect(pending.length).toBe(1);
      expect(pending[0].retry_count).toBe(1);
      expect(pending[0].last_error).toContain('Network timeout');
    });
  });

  describe('6. Pull Remote Updates Cycle', () => {
    it('pulls remote accounts, categories, and transactions into local IndexedDB and reconciles balances', async () => {
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-sync-1', email: 'sync@user.com' },
        initialTables: {
          accounts: [
            {
              id: 'acc-cloud-1',
              user_id: 'usr-sync-1',
              name: 'البنك السحابي',
              type: 'bank',
              initial_balance: 20000,
              current_balance: 20000,
              currency: 'SAR',
              deleted_at: null,
              sync_version: 1,
              updated_at: '2026-10-26T09:00:00Z'
            }
          ],
          categories: [
            {
              id: 'cat-cloud-1',
              user_id: 'usr-sync-1',
              slug: 'cat_groceries',
              name: 'بقالة وسوبرماركت',
              type: 'expense',
              is_default: true,
              sync_version: 1,
              updated_at: '2026-10-26T09:00:00Z'
            }
          ],
          transactions: [
            {
              id: 'tx-cloud-1',
              user_id: 'usr-sync-1',
              type: 'expense',
              amount: 4500,
              date: '2026-10-26',
              account_id: 'acc-cloud-1',
              category_id: 'cat-cloud-1',
              destination_account_id: null,
              deleted_at: null,
              sync_version: 1,
              updated_at: '2026-10-26T09:05:00Z'
            }
          ]
        }
      });

      const pullRes = await pullRemoteUpdates({
        client: mockCloudClient,
        database: testDb,
        userId: 'usr-sync-1'
      });

      expect(pullRes.accountsCount).toBe(1);
      expect(pullRes.categoriesCount).toBe(1);
      expect(pullRes.transactionsCount).toBe(1);

      // Verify records inserted in local IndexedDB
      const acc = await testDb.accounts.get('acc-cloud-1');
      expect(acc).toBeDefined();
      expect(acc.name).toBe('البنك السحابي');

      const tx = await testDb.transactions.get('tx-cloud-1');
      expect(tx).toBeDefined();
      expect(tx.amount).toBe(4500);

      // Verify account balance was reconciled: 20000 - 4500 = 15500
      const reconciledAcc = await testDb.accounts.get('acc-cloud-1');
      expect(reconciledAcc.current_balance).toBe(15500);

      // Verify last_cloud_sync_timestamp recorded
      const timestamp = await getLastSyncTimestamp(testDb);
      expect(timestamp).toBeDefined();
    });

    it('does not overwrite local records that have pending un-pushed mutations', async () => {
      // Local edit queued for tx-local-pending
      await testDb.transactions.add({
        id: 'tx-local-pending',
        user_id: 'u1',
        amount: 8888,
        sync_version: 2,
        updated_at: '2026-10-26T10:00:00Z'
      });

      await enqueueMutation({
        entity_type: 'transaction',
        entity_id: 'tx-local-pending',
        action: 'UPSERT',
        client_base_version: 2,
        payload: { id: 'tx-local-pending', amount: 8888 },
        database: testDb
      });

      // Remote has an update
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'u1' },
        initialTables: {
          transactions: [
            {
              id: 'tx-local-pending',
              user_id: 'u1',
              amount: 1111,
              sync_version: 3,
              updated_at: '2026-10-26T10:05:00Z'
            }
          ]
        }
      });

      await pullRemoteUpdates({
        client: mockCloudClient,
        database: testDb,
        userId: 'u1'
      });

      // Local transaction still retains local value pending push
      const tx = await testDb.transactions.get('tx-local-pending');
      expect(tx.amount).toBe(8888);
    });
  });

  describe('7. Complete Two-Way Sync (syncWithCloud)', () => {
    it('executes push then pull cycles and returns clean synced pill status', async () => {
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-full-1', email: 'full@test.com' }
      });

      const outcome = await syncWithCloud({
        client: mockCloudClient,
        database: testDb,
        userId: 'usr-full-1'
      });

      expect(outcome.success).toBe(true);
      expect(outcome.pillStatus).toBe('synced');
      expect(outcome.lastSyncTextArabic).toBe('الآن');
      expect(outcome.push).toBeDefined();
      expect(outcome.pull).toBeDefined();
    });

    it('handles offline state gracefully when client is absent', async () => {
      const outcome = await syncWithCloud({
        client: null,
        database: testDb
      });

      expect(outcome.success).toBe(false);
      expect(outcome.status).toBe('offline');
    });
  });

  describe('8. Arabic Time Formatting & Utilities', () => {
    it('formats sync timestamps into natural Arabic strings', () => {
      expect(formatLastSyncTimeArabic(null)).toBe('غير متزامن بعد');
      expect(formatLastSyncTimeArabic('')).toBe('غير متزامن بعد');

      const now = new Date().toISOString();
      expect(formatLastSyncTimeArabic(now)).toBe('الآن');

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(formatLastSyncTimeArabic(fiveMinutesAgo)).toBe('منذ 5 دقائق');

      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      expect(formatLastSyncTimeArabic(twoMinutesAgo)).toBe('منذ 2 دقيقتين');

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      expect(formatLastSyncTimeArabic(twoHoursAgo)).toBe('منذ 2 ساعتين');
    });

    it('stores and retrieves last sync timestamp in database settings', async () => {
      expect(await getLastSyncTimestamp(testDb)).toBeNull();
      const now = new Date().toISOString();
      await setLastSyncTimestamp(now, testDb);
      expect(await getLastSyncTimestamp(testDb)).toBe(now);
    });

    it('handles idempotent replay when mergeGuestDataOnLogin is called repeatedly', async () => {
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-idem-1', email: 'idem@test.com' }
      });

      await testDb.accounts.add({
        id: 'acc-idem-1',
        user_id: null,
        name: 'محفظة الاختبار',
        type: 'cash',
        initial_balance: 5000,
        current_balance: 5000,
        currency: 'SAR',
        deleted_at: null,
        sync_version: 1,
        updated_at: new Date().toISOString()
      });

      const firstMerge = await mergeGuestDataOnLogin({
        userId: 'usr-idem-1',
        client: mockCloudClient,
        database: testDb
      });
      expect(firstMerge.success).toBe(true);

      // Second merge should run cleanly with 0 guest records remaining
      const secondMerge = await mergeGuestDataOnLogin({
        userId: 'usr-idem-1',
        client: mockCloudClient,
        database: testDb
      });
      expect(secondMerge.success).toBe(true);
      expect(secondMerge.mergedAccountsCount).toBe(0);
    });

    it('supports Supabase RPC sync_mutation execution when defined on client', async () => {
      const rpcSpy = vi.fn().mockResolvedValue({
        data: {
          success: true,
          conflict: false,
          serverRecord: {
            id: 'tx-rpc-1',
            sync_version: 2,
            updated_at: new Date().toISOString()
          }
        },
        error: null
      });

      const mockClientWithRpc = createMockSupabaseClient({
        initialUser: { id: 'usr-rpc-1' }
      });
      mockClientWithRpc.rpc = rpcSpy;

      await testDb.transactions.add({
        id: 'tx-rpc-1',
        user_id: 'usr-rpc-1',
        amount: 2000,
        sync_version: 1
      });

      await enqueueMutation({
        entity_type: 'transaction',
        entity_id: 'tx-rpc-1',
        action: 'UPSERT',
        client_base_version: 1,
        payload: { id: 'tx-rpc-1', amount: 2000 },
        database: testDb
      });

      const res = await pushPendingMutations({
        client: mockClientWithRpc,
        database: testDb,
        userId: 'usr-rpc-1'
      });

      expect(res.pushedCount).toBe(1);
      expect(rpcSpy).toHaveBeenCalled();
      const tx = await testDb.transactions.get('tx-rpc-1');
      expect(tx.sync_version).toBe(2);
    });

    it('pushes DELETE mutation as soft delete on server', async () => {
      const mockCloudClient = createMockSupabaseClient({
        initialUser: { id: 'usr-del-1' },
        initialTables: {
          accounts: [
            {
              id: 'acc-del-1',
              user_id: 'usr-del-1',
              name: 'حساب محذوف',
              deleted_at: null,
              sync_version: 1
            }
          ]
        }
      });

      await testDb.accounts.add({
        id: 'acc-del-1',
        user_id: 'usr-del-1',
        name: 'حساب محذوف',
        deleted_at: new Date().toISOString(),
        sync_version: 1
      });

      await enqueueMutation({
        entity_type: 'account',
        entity_id: 'acc-del-1',
        action: 'DELETE',
        client_base_version: 1,
        payload: { id: 'acc-del-1', deleted_at: new Date().toISOString() },
        database: testDb
      });

      const res = await pushPendingMutations({
        client: mockCloudClient,
        database: testDb,
        userId: 'usr-del-1'
      });

      expect(res.pushedCount).toBe(1);
      const serverAcc = mockCloudClient._tables.accounts.find((a) => a.id === 'acc-del-1');
      expect(serverAcc.deleted_at).toBeDefined();
    });
  });
});
