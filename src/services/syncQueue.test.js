import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExpenseDatabase } from '../db/db.js';
import {
  MUTATION_STATUS,
  MUTATION_ACTIONS,
  ENTITY_TYPES,
  SYNC_STATUS,
  MAX_MUTATION_RETRIES,
  DEFAULT_CONFLICT_ARABIC_MESSAGE,
  SyncQueueValidationError,
  generateUUID,
  serializePayload,
  parsePayload,
  enqueueMutation,
  getPendingMutations,
  getNextMutation,
  peekMutationQueue,
  markMutationSyncing,
  markMutationFailed,
  dequeueMutation,
  removeMutationsForEntity,
  requeueFailedMutations,
  clearMutationQueue,
  getQueueMetrics,
  computeSyncPillStatus,
  evaluateOCC,
  resolveConflictAndArchive,
  applySyncResult,
  getConflictAuditLogs,
  getConflictAuditLogById,
  clearConflictAuditLogs,
  subscribeToSyncEvents,
  clearSyncListeners
} from './syncQueue.js';
import { createCategory, updateCategory, deleteCategory } from './category.js';

describe('Offline Mutation Queue & Concurrency Engine (OCC) — F017', () => {
  let testDb;

  beforeEach(() => {
    testDb = new ExpenseDatabase(`test-sync-db-${Date.now()}-${Math.random()}`);
    clearSyncListeners();
  });

  afterEach(async () => {
    clearSyncListeners();
    if (testDb) {
      await testDb.delete();
      testDb.close();
    }
  });

  describe('1. Constants, Enums & Utilities', () => {
    it('defines standard mutation statuses', () => {
      expect(MUTATION_STATUS.PENDING).toBe('pending');
      expect(MUTATION_STATUS.SYNCING).toBe('syncing');
      expect(MUTATION_STATUS.FAILED).toBe('failed');
    });

    it('defines mutation actions (UPSERT, DELETE)', () => {
      expect(MUTATION_ACTIONS.UPSERT).toBe('UPSERT');
      expect(MUTATION_ACTIONS.DELETE).toBe('DELETE');
    });

    it('defines supported entity types (account, category, transaction)', () => {
      expect(ENTITY_TYPES.ACCOUNT).toBe('account');
      expect(ENTITY_TYPES.CATEGORY).toBe('category');
      expect(ENTITY_TYPES.TRANSACTION).toBe('transaction');
    });

    it('defines sync pill states matching design tokens', () => {
      expect(SYNC_STATUS.SYNCED).toBe('synced');
      expect(SYNC_STATUS.PENDING).toBe('pending');
      expect(SYNC_STATUS.SYNCING).toBe('syncing');
      expect(SYNC_STATUS.FAILED).toBe('failed');
      expect(SYNC_STATUS.OFFLINE).toBe('offline');
    });

    it('generates valid RFC4122 v4 UUIDs', () => {
      const id1 = generateUUID();
      const id2 = generateUUID();
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });

    it('serializes and parses payloads safely', () => {
      const obj = { amount: 2500, notes: 'غداء عمل' };
      const serialized = serializePayload(obj);
      expect(typeof serialized).toBe('string');
      expect(parsePayload(serialized)).toEqual(obj);

      // Pre-serialized string
      expect(serializePayload(serialized)).toBe(serialized);
    });

    it('throws validation errors on invalid payloads', () => {
      expect(() => serializePayload(null)).toThrow(SyncQueueValidationError);
      expect(() => serializePayload(undefined)).toThrow(SyncQueueValidationError);
      expect(() => serializePayload('invalid json string {')).toThrow(SyncQueueValidationError);
    });
  });

  describe('2. Input Validation & Enqueueing Guards', () => {
    it('throws when entity_type is invalid or missing', async () => {
      await expect(
        enqueueMutation({
          entity_type: 'invalid_type',
          entity_id: 'acc-1',
          payload: { name: 'Test' },
          database: testDb
        })
      ).rejects.toThrow(SyncQueueValidationError);
    });

    it('throws when action is invalid', async () => {
      await expect(
        enqueueMutation({
          entity_type: ENTITY_TYPES.TRANSACTION,
          action: 'DROP_TABLE',
          entity_id: 'tx-1',
          payload: { amount: 100 },
          database: testDb
        })
      ).rejects.toThrow(SyncQueueValidationError);
    });

    it('throws when entity_id is empty or whitespace', async () => {
      await expect(
        enqueueMutation({
          entity_type: ENTITY_TYPES.ACCOUNT,
          entity_id: '   ',
          payload: { name: 'Test' },
          database: testDb
        })
      ).rejects.toThrow(SyncQueueValidationError);
    });

    it('throws when client_base_version is negative or not an integer', async () => {
      await expect(
        enqueueMutation({
          entity_type: ENTITY_TYPES.TRANSACTION,
          entity_id: 'tx-1',
          client_base_version: -1,
          payload: { amount: 100 },
          database: testDb
        })
      ).rejects.toThrow(SyncQueueValidationError);

      await expect(
        enqueueMutation({
          entity_type: ENTITY_TYPES.TRANSACTION,
          entity_id: 'tx-1',
          client_base_version: 1.5,
          payload: { amount: 100 },
          database: testDb
        })
      ).rejects.toThrow(SyncQueueValidationError);
    });
  });

  describe('3. Queue Ingestion & FIFO Sequence Invariant', () => {
    it('enqueues mutations sequentially with monotonic base version and pending status', async () => {
      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-uuid-1',
        action: MUTATION_ACTIONS.UPSERT,
        client_base_version: 0,
        payload: { id: 'tx-uuid-1', amount: 3500, type: 'expense' },
        database: testDb
      });

      expect(mutation.id).toBeDefined();
      expect(mutation.entity_type).toBe('transaction');
      expect(mutation.entity_id).toBe('tx-uuid-1');
      expect(mutation.client_base_version).toBe(0);
      expect(mutation.status).toBe('pending');
      expect(mutation.retry_count).toBe(0);
      expect(mutation.client_timestamp).toBeDefined();

      const stored = await testDb.offline_mutation_queue.get(mutation.id);
      expect(stored).toBeDefined();
      expect(JSON.parse(stored.payload).amount).toBe(3500);
    });

    it('retrieves mutations in strict FIFO sequence by client_timestamp', async () => {
      const time1 = '2026-10-26T08:00:00.000Z';
      const time2 = '2026-10-26T08:05:00.000Z';
      const time3 = '2026-10-26T08:10:00.000Z';

      // Insert out of order
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-2',
        client_timestamp: time2,
        payload: { seq: 2 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        client_timestamp: time1,
        payload: { seq: 1 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.CATEGORY,
        entity_id: 'cat-3',
        client_timestamp: time3,
        payload: { seq: 3 },
        database: testDb
      });

      const pending = await getPendingMutations({ database: testDb });
      expect(pending).toHaveLength(3);
      expect(JSON.parse(pending[0].payload).seq).toBe(1);
      expect(JSON.parse(pending[1].payload).seq).toBe(2);
      expect(JSON.parse(pending[2].payload).seq).toBe(3);

      const next = await getNextMutation({ database: testDb });
      expect(JSON.parse(next.payload).seq).toBe(1);
    });

    it('filters pending mutations by entity_type', async () => {
      await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'Cash' },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-1',
        payload: { amount: 100 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-2',
        payload: { amount: 200 },
        database: testDb
      });

      const txOnly = await getPendingMutations({
        database: testDb,
        entityType: ENTITY_TYPES.TRANSACTION
      });
      expect(txOnly).toHaveLength(2);
      expect(txOnly.every((m) => m.entity_type === 'transaction')).toBe(true);
    });

    it('provides peekMutationQueue with parsed payload convenience field', async () => {
      await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'بنك الرياض', initial_balance: 50000 },
        database: testDb
      });

      const peek = await peekMutationQueue({ database: testDb });
      expect(peek).toHaveLength(1);
      expect(peek[0].parsedPayload.name).toBe('بنك الرياض');
      expect(peek[0].parsedPayload.initial_balance).toBe(50000);
    });
  });

  describe('4. Status Transitions, Retries & Queue Hygiene', () => {
    it('marks mutation as syncing with timestamp', async () => {
      const mut = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'Test' },
        database: testDb
      });

      const syncing = await markMutationSyncing(mut.id, { database: testDb });
      expect(syncing.status).toBe('syncing');
      expect(syncing.syncing_started_at).toBeDefined();

      const stored = await testDb.offline_mutation_queue.get(mut.id);
      expect(stored.status).toBe('syncing');
    });

    it('marks mutation as failed, increments retry count, and records error', async () => {
      const mut = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'Test' },
        database: testDb
      });

      const failed = await markMutationFailed(mut.id, 'انقطاع الاتصال بالشبكة', { database: testDb });
      expect(failed.status).toBe('failed');
      expect(failed.retry_count).toBe(1);
      expect(failed.last_error).toBe('انقطاع الاتصال بالشبكة');
      expect(failed.is_permanently_failed).toBe(false);

      // Subsequent failures
      await markMutationFailed(mut.id, 'خطأ في الخادم (500)', { database: testDb });
      await markMutationFailed(mut.id, 'مهلة الطلب', { database: testDb });
      await markMutationFailed(mut.id, 'خطأ', { database: testDb });
      const permFailed = await markMutationFailed(mut.id, 'خطأ أخير', {
        database: testDb,
        maxRetries: MAX_MUTATION_RETRIES
      });

      expect(permFailed.retry_count).toBe(5);
      expect(permFailed.is_permanently_failed).toBe(true);
    });

    it('dequeues successfully processed mutation', async () => {
      const mut = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-1',
        payload: { amount: 1500 },
        database: testDb
      });

      const result = await dequeueMutation(mut.id, { database: testDb });
      expect(result.dequeued).toBe(true);
      expect(result.id).toBe(mut.id);

      const stored = await testDb.offline_mutation_queue.get(mut.id);
      expect(stored).toBeUndefined();
    });

    it('removes all mutations for a specific entity ID', async () => {
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-target',
        action: 'UPSERT',
        payload: { amount: 100 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-target',
        action: 'DELETE',
        payload: { amount: 100 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-other',
        payload: { amount: 500 },
        database: testDb
      });

      const removedCount = await removeMutationsForEntity('tx-target', { database: testDb });
      expect(removedCount).toBe(2);

      const remaining = await testDb.offline_mutation_queue.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].entity_id).toBe('tx-other');
    });

    it('requeues failed mutations back to pending', async () => {
      const m1 = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'A' },
        database: testDb
      });
      const m2 = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-2',
        payload: { name: 'B' },
        database: testDb
      });

      await markMutationFailed(m1.id, 'خطأ 1', { database: testDb });
      await markMutationFailed(m2.id, 'خطأ 2', { database: testDb });

      const requeuedCount = await requeueFailedMutations({
        database: testDb,
        resetRetryCount: true
      });
      expect(requeuedCount).toBe(2);

      const pending = await getPendingMutations({
        database: testDb,
        statuses: [MUTATION_STATUS.PENDING]
      });
      expect(pending).toHaveLength(2);
      expect(pending[0].status).toBe('pending');
      expect(pending[0].retry_count).toBe(0);
    });

    it('clears all mutations from queue', async () => {
      await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'A' },
        database: testDb
      });
      await clearMutationQueue({ database: testDb });

      const count = await testDb.offline_mutation_queue.count();
      expect(count).toBe(0);
    });
  });

  describe('5. Queue Metrics & SyncStatusPill Computations', () => {
    it('computes metrics with breakdown by status and entity type', async () => {
      const m1 = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        payload: { name: 'A' },
        database: testDb
      });
      const m2 = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-1',
        payload: { amount: 100 },
        database: testDb
      });
      await enqueueMutation({
        entity_type: ENTITY_TYPES.CATEGORY,
        entity_id: 'cat-1',
        payload: { name: 'C' },
        database: testDb
      });

      await markMutationSyncing(m1.id, { database: testDb });
      await markMutationFailed(m2.id, 'Err', { database: testDb });

      const metrics = await getQueueMetrics({ database: testDb });
      expect(metrics.total).toBe(3);
      expect(metrics.pending).toBe(1);
      expect(metrics.syncing).toBe(1);
      expect(metrics.failed).toBe(1);
      expect(metrics.hasPending).toBe(true);
      expect(metrics.isSynced).toBe(false);
      expect(metrics.byEntityType.account).toBe(1);
      expect(metrics.byEntityType.transaction).toBe(1);
      expect(metrics.byEntityType.category).toBe(1);
    });

    it('maps metrics correctly to SyncStatusPill tokens', async () => {
      // 1. Offline takes precedence
      expect(await computeSyncPillStatus({ database: testDb, isOnline: false })).toBe('offline');

      // 2. Empty queue -> synced
      expect(await computeSyncPillStatus({ database: testDb, isOnline: true })).toBe('synced');

      // 3. Pending mutation -> pending
      const mut = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-1',
        payload: { amount: 100 },
        database: testDb
      });
      expect(await computeSyncPillStatus({ database: testDb, isOnline: true })).toBe('pending');

      // 4. Syncing mutation -> syncing
      await markMutationSyncing(mut.id, { database: testDb });
      expect(await computeSyncPillStatus({ database: testDb, isOnline: true })).toBe('syncing');

      // 5. Failed mutation -> failed
      await markMutationFailed(mut.id, 'Network error', { database: testDb });
      expect(await computeSyncPillStatus({ database: testDb, isOnline: true })).toBe('failed');
    });
  });

  describe('6. Optimistic Concurrency Control (OCC) Engine', () => {
    it('returns conflict: false when server sync_version matches client_base_version', () => {
      const mutation = {
        client_base_version: 3,
        entity_id: 'tx-1',
        entity_type: 'transaction'
      };
      const serverRecord = {
        id: 'tx-1',
        sync_version: 3,
        amount: 5000
      };

      const result = evaluateOCC({ mutation, serverRecord });
      expect(result.conflict).toBe(false);
      expect(result.clientBaseVersion).toBe(3);
      expect(result.serverVersion).toBe(3);
    });

    it('returns conflict: false when entity is brand new on server (serverRecord is null)', () => {
      const mutation = {
        client_base_version: 0,
        entity_id: 'tx-new',
        entity_type: 'transaction'
      };

      const result = evaluateOCC({ mutation, serverRecord: null });
      expect(result.conflict).toBe(false);
      expect(result.clientBaseVersion).toBe(0);
      expect(result.serverVersion).toBe(0);
    });

    it('returns conflict: true when server sync_version differs from client_base_version', () => {
      const mutation = {
        client_base_version: 1,
        entity_id: 'tx-1',
        entity_type: 'transaction'
      };
      const serverRecord = {
        id: 'tx-1',
        sync_version: 3, // Another device updated this record in the interim
        amount: 8000
      };

      const result = evaluateOCC({ mutation, serverRecord });
      expect(result.conflict).toBe(true);
      expect(result.reason).toBe('VERSION_MISMATCH');
      expect(result.clientBaseVersion).toBe(1);
      expect(result.serverVersion).toBe(3);
      expect(result.message).toContain('تعارض');
    });
  });

  describe('7. Conflict Archiving & Canonical Resolution (ADR-005)', () => {
    it('never drops local edit; archives local snapshot to conflict_audit_log and applies server canonical version', async () => {
      // Setup local transaction and accounts
      const localAccount = {
        id: 'acc-1',
        name: 'كاش',
        type: 'cash',
        initial_balance: 10000,
        current_balance: 7500,
        currency: 'SAR',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 1
      };
      await testDb.accounts.add(localAccount);

      const localTx = {
        id: 'tx-100',
        type: 'expense',
        amount: 2500, // Local user changed amount to 25.00 SAR
        account_id: 'acc-1',
        category_id: 'cat-food',
        destination_account_id: null,
        date: '2026-10-26',
        notes: 'تعديل محلي بدون اتصال',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 2
      };
      await testDb.transactions.add(localTx);

      // Mutation queued with client_base_version = 1
      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: localTx.id,
        action: MUTATION_ACTIONS.UPSERT,
        client_base_version: 1,
        payload: localTx,
        database: testDb
      });

      // Canonical server record from another device (with sync_version = 2 and amount = 4000)
      const serverCanonicalTx = {
        id: 'tx-100',
        type: 'expense',
        amount: 4000,
        account_id: 'acc-1',
        category_id: 'cat-food',
        destination_account_id: null,
        date: '2026-10-26',
        notes: 'تعديل على الهاتف المحمول',
        tags: ['مطعم'],
        created_at: localTx.created_at,
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 2
      };

      // Execute conflict resolution
      const resolution = await resolveConflictAndArchive({
        mutation,
        serverCanonicalRecord: serverCanonicalTx,
        database: testDb
      });

      expect(resolution.status).toBe('conflict_resolved');
      expect(resolution.warningMessage).toBe(DEFAULT_CONFLICT_ARABIC_MESSAGE);

      // 1. Local conflicting edit preserved in conflict_audit_log
      const auditLogs = await testDb.conflict_audit_log.toArray();
      expect(auditLogs).toHaveLength(1);
      const log = auditLogs[0];
      expect(log.entity_type).toBe('transaction');
      expect(log.entity_id).toBe('tx-100');
      expect(log.client_payload.amount).toBe(2500);
      expect(log.client_payload.notes).toBe('تعديل محلي بدون اتصال');
      expect(log.server_payload.amount).toBe(4000);
      expect(log.server_payload.notes).toBe('تعديل على الهاتف المحمول');
      expect(log.resolution_note).toBeDefined();

      // 2. Canonical server record applied to local IndexedDB table
      const canonicalStored = await testDb.transactions.get('tx-100');
      expect(canonicalStored.amount).toBe(4000);
      expect(canonicalStored.notes).toBe('تعديل على الهاتف المحمول');

      // 3. Mutation dequeued from offline_mutation_queue
      const storedMutation = await testDb.offline_mutation_queue.get(mutation.id);
      expect(storedMutation).toBeUndefined();

      // 4. Ledger balance recalculated according to ADR-003: 10000 - 4000 = 6000
      const updatedAccount = await testDb.accounts.get('acc-1');
      expect(updatedAccount.current_balance).toBe(6000);
    });

    it('resolves conflicts on account entities and preserves audit log', async () => {
      const localAccount = {
        id: 'acc-2',
        name: 'حساب محلي',
        type: 'bank',
        initial_balance: 5000,
        current_balance: 5000,
        currency: 'SAR',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 2
      };
      await testDb.accounts.add(localAccount);

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: localAccount.id,
        action: MUTATION_ACTIONS.UPSERT,
        client_base_version: 1,
        payload: localAccount,
        database: testDb
      });

      const serverAccount = {
        ...localAccount,
        name: 'حساب بنك الراجحي الرسمي',
        sync_version: 3
      };

      const result = await resolveConflictAndArchive({
        mutation,
        serverCanonicalRecord: serverAccount,
        database: testDb
      });

      expect(result.status).toBe('conflict_resolved');
      const stored = await testDb.accounts.get('acc-2');
      expect(stored.name).toBe('حساب بنك الراجحي الرسمي');

      const audit = await getConflictAuditLogs({ database: testDb, entityType: 'account' });
      expect(audit).toHaveLength(1);
      expect(audit[0].client_payload.name).toBe('حساب محلي');
      expect(audit[0].server_payload.name).toBe('حساب بنك الراجحي الرسمي');
    });

    it('resolves conflicts on category entities', async () => {
      const localCat = {
        id: 'cat-custom-1',
        name: 'ملابس وأحذية',
        type: 'expense',
        icon: 'shirt',
        color: '#3B82F6',
        is_default: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        sync_version: 2
      };
      await testDb.categories.add(localCat);

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.CATEGORY,
        entity_id: localCat.id,
        action: MUTATION_ACTIONS.UPSERT,
        client_base_version: 1,
        payload: localCat,
        database: testDb
      });

      const serverCat = {
        ...localCat,
        name: 'أزياء ومظهر شخصي',
        color: '#8B5CF6',
        sync_version: 3
      };

      await resolveConflictAndArchive({
        mutation,
        serverCanonicalRecord: serverCat,
        database: testDb
      });

      const stored = await testDb.categories.get('cat-custom-1');
      expect(stored.name).toBe('أزياء ومظهر شخصي');
      expect(stored.color).toBe('#8B5CF6');
    });
  });

  describe('8. applySyncResult Dispatcher', () => {
    it('applies successful write response: bumps sync_version and removes mutation', async () => {
      const localTx = {
        id: 'tx-200',
        amount: 7000,
        sync_version: 1
      };
      await testDb.transactions.add(localTx);

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: localTx.id,
        client_base_version: 1,
        payload: localTx,
        database: testDb
      });

      const outcome = await applySyncResult({
        mutation,
        syncResponse: {
          success: true,
          conflict: false,
          serverRecord: {
            id: localTx.id,
            sync_version: 2,
            updated_at: '2026-10-26T12:00:00.000Z'
          }
        },
        database: testDb
      });

      expect(outcome.status).toBe('synced');
      expect(outcome.newSyncVersion).toBe(2);

      const updated = await testDb.transactions.get(localTx.id);
      expect(updated.sync_version).toBe(2);

      const queueCount = await testDb.offline_mutation_queue.count();
      expect(queueCount).toBe(0);
    });

    it('dispatches to conflict archiving when syncResponse.conflict is true', async () => {
      const localTx = { id: 'tx-201', amount: 3000, sync_version: 1 };
      await testDb.transactions.add(localTx);

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: localTx.id,
        client_base_version: 1,
        payload: localTx,
        database: testDb
      });

      const outcome = await applySyncResult({
        mutation,
        syncResponse: {
          success: false,
          conflict: true,
          serverRecord: {
            id: localTx.id,
            amount: 5000,
            sync_version: 3
          }
        },
        database: testDb
      });

      expect(outcome.status).toBe('conflict_resolved');
      expect(outcome.auditEntry).toBeDefined();

      const stored = await testDb.transactions.get(localTx.id);
      expect(stored.amount).toBe(5000);
    });

    it('marks mutation failed when sync fails without conflict', async () => {
      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-failed',
        payload: { name: 'F' },
        database: testDb
      });

      const outcome = await applySyncResult({
        mutation,
        syncResponse: {
          success: false,
          conflict: false,
          error: 'Rate limit exceeded'
        },
        database: testDb
      });

      expect(outcome.status).toBe('failed');
      const stored = await testDb.offline_mutation_queue.get(mutation.id);
      expect(stored.status).toBe('failed');
      expect(stored.last_error).toBe('Rate limit exceeded');
    });
  });

  describe('9. Conflict Audit Log Inspection & Management', () => {
    it('lists and clears conflict audit logs', async () => {
      const mut1 = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-1',
        client_base_version: 1,
        payload: { name: 'A' },
        database: testDb
      });
      const mut2 = await enqueueMutation({
        entity_type: ENTITY_TYPES.TRANSACTION,
        entity_id: 'tx-1',
        client_base_version: 1,
        payload: { amount: 100 },
        database: testDb
      });

      await resolveConflictAndArchive({
        mutation: mut1,
        serverCanonicalRecord: { id: 'acc-1', name: 'Server A', sync_version: 3 },
        database: testDb
      });
      await resolveConflictAndArchive({
        mutation: mut2,
        serverCanonicalRecord: { id: 'tx-1', amount: 500, sync_version: 3 },
        database: testDb
      });

      const logs = await getConflictAuditLogs({ database: testDb });
      expect(logs).toHaveLength(2);

      const specificLog = await getConflictAuditLogById(logs[0].id, { database: testDb });
      expect(specificLog).toBeDefined();
      expect(specificLog.id).toBe(logs[0].id);

      await clearConflictAuditLogs({ database: testDb });
      expect(await getConflictAuditLogs({ database: testDb })).toHaveLength(0);
    });
  });

  describe('10. Event Emitter & Subscription Subsystem', () => {
    it('notifies subscribers of ENQUEUED, SYNCING, FAILED, DEQUEUED and CONFLICT_RESOLVED events', async () => {
      const events = [];
      const unsubscribe = subscribeToSyncEvents((event) => {
        events.push(event);
      });

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.CATEGORY,
        entity_id: 'cat-event',
        payload: { name: 'تسلية' },
        database: testDb
      });

      await markMutationSyncing(mutation.id, { database: testDb });
      await markMutationFailed(mutation.id, 'Err', { database: testDb });
      await dequeueMutation(mutation.id, { database: testDb });

      expect(events.map((e) => e.type)).toEqual(['ENQUEUED', 'SYNCING', 'FAILED', 'DEQUEUED']);

      unsubscribe();
      // After unsubscribe, no new events received
      await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-quiet',
        payload: { name: 'Quiet' },
        database: testDb
      });
      expect(events).toHaveLength(4);
    });

    it('handles subscriber errors gracefully without breaking execution', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      subscribeToSyncEvents(() => {
        throw new Error('Subscriber error');
      });

      const mutation = await enqueueMutation({
        entity_type: ENTITY_TYPES.ACCOUNT,
        entity_id: 'acc-safe',
        payload: { name: 'Safe' },
        database: testDb
      });

      expect(mutation.id).toBeDefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('11. Integration with Category Operations (Deterministic Queuing)', () => {
    it('automatically queues an UPSERT mutation when creating a custom category', async () => {
      const category = await createCategory(
        {
          name: 'صيانة دورية',
          type: 'expense',
          icon: 'wrench',
          color: '#F59E0B'
        },
        testDb
      );

      const mutations = await testDb.offline_mutation_queue.toArray();
      expect(mutations).toHaveLength(1);
      const m = mutations[0];
      expect(m.entity_type).toBe('category');
      expect(m.entity_id).toBe(category.id);
      expect(m.action).toBe('UPSERT');
      expect(m.client_base_version).toBe(0);
      expect(JSON.parse(m.payload).name).toBe('صيانة دورية');
    });

    it('automatically queues an UPSERT mutation with bumped version on updateCategory', async () => {
      const cat = await createCategory({ name: 'وقود', type: 'expense' }, testDb);
      await clearMutationQueue({ database: testDb });

      await updateCategory(cat.id, { name: 'بنزين ومحروقات' }, testDb);

      const mutations = await testDb.offline_mutation_queue.toArray();
      expect(mutations).toHaveLength(1);
      expect(mutations[0].action).toBe('UPSERT');
      expect(mutations[0].client_base_version).toBe(1);
      expect(JSON.parse(mutations[0].payload).name).toBe('بنزين ومحروقات');
    });

    it('automatically queues a DELETE mutation on softDeleteCategory', async () => {
      const cat = await createCategory({ name: 'اشتراكات', type: 'expense' }, testDb);
      await clearMutationQueue({ database: testDb });

      await deleteCategory(cat.id, testDb);

      const mutations = await testDb.offline_mutation_queue.toArray();
      expect(mutations).toHaveLength(1);
      expect(mutations[0].action).toBe('DELETE');
      expect(mutations[0].client_base_version).toBe(1);
      expect(JSON.parse(mutations[0].payload).deleted_at).toBeDefined();
    });
  });
});
