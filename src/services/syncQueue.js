import { db } from '../db/db.js';
import { reconcileAccountBalance } from './account.js';

/**
 * Mutation status constants
 */
export const MUTATION_STATUS = Object.freeze({
  PENDING: 'pending',
  SYNCING: 'syncing',
  FAILED: 'failed'
});

/**
 * Mutation action types
 */
export const MUTATION_ACTIONS = Object.freeze({
  UPSERT: 'UPSERT',
  DELETE: 'DELETE'
});

/**
 * Allowed entity types for synchronization
 */
export const ENTITY_TYPES = Object.freeze({
  ACCOUNT: 'account',
  CATEGORY: 'category',
  TRANSACTION: 'transaction'
});

/**
 * High-level synchronization states matching Design System tokens and SyncStatusPill
 */
export const SYNC_STATUS = Object.freeze({
  SYNCED: 'synced',
  PENDING: 'pending',
  SYNCING: 'syncing',
  FAILED: 'failed',
  OFFLINE: 'offline'
});

/**
 * Maximum allowed automatic retry count before flagging permanent failure
 */
export const MAX_MUTATION_RETRIES = 5;

/**
 * Default Arabic conflict resolution message format
 */
export const DEFAULT_CONFLICT_ARABIC_MESSAGE =
  'تم حل تعارض المزامنة: تم تعديل السجل على جهاز آخر. تم حفظ نسختك المحلية في سجل تدقيق التعارضات واعتماد النسخة الرسمية.';

/**
 * Custom error thrown when mutation validation fails
 */
export class SyncQueueValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'SyncQueueValidationError';
    this.code = 'SYNC_QUEUE_VALIDATION_ERROR';
    this.field = field;
  }
}

/**
 * Custom error thrown when optimistic concurrency conflict is detected
 */
export class SyncConflictError extends Error {
  constructor(message, { entityType, entityId, clientBaseVersion, serverVersion }) {
    super(message);
    this.name = 'SyncConflictError';
    this.code = 'OCC_CONFLICT_DETECTED';
    this.entityType = entityType;
    this.entityId = entityId;
    this.clientBaseVersion = clientBaseVersion;
    this.serverVersion = serverVersion;
  }
}

/**
 * RFC4122 v4 UUID generator with fallback
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Event emitter for queue and concurrency state updates
 */
const syncListeners = new Set();

/**
 * Subscribes a callback to synchronization and concurrency events
 * @param {Function} listener
 * @returns {Function} unsubscribe function
 */
export function subscribeToSyncEvents(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('Listener must be a function');
  }
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

/**
 * Dispatches an event to all registered sync listeners
 * @param {object} event
 */
export function emitSyncEvent(event) {
  for (const listener of syncListeners) {
    try {
      listener(event);
    } catch (err) {
      console.error('[SyncQueue] Error in sync event listener:', err);
    }
  }
}

/**
 * Clears all registered event listeners (useful for test teardown)
 */
export function clearSyncListeners() {
  syncListeners.clear();
}

/**
 * Validates and serializes a mutation payload
 * @param {object|string} payload
 * @returns {string} JSON-serialized payload
 */
export function serializePayload(payload) {
  if (payload === undefined || payload === null) {
    throw new SyncQueueValidationError('حمولة التغيير (payload) مطلوبة', 'payload');
  }
  if (typeof payload === 'string') {
    try {
      JSON.parse(payload);
      return payload;
    } catch {
      throw new SyncQueueValidationError('حمولة التغيير يجب أن تكون كائناً صالحاً أو نص JSON سليم', 'payload');
    }
  }
  if (typeof payload === 'object') {
    try {
      return JSON.stringify(payload);
    } catch (e) {
      throw new SyncQueueValidationError(`فشل في تحويل الحمولة إلى JSON: ${e.message}`, 'payload');
    }
  }
  throw new SyncQueueValidationError('نوع حمولة التغيير غير مدعوم', 'payload');
}

/**
 * Parses a mutation payload into a plain JS object
 * @param {string|object} payload
 * @returns {object}
 */
export function parsePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Enqueues an offline CRUD mutation sequentially into offline_mutation_queue
 *
 * @param {object} params
 * @param {string} params.entity_type - 'account' | 'category' | 'transaction'
 * @param {string} params.entity_id - UUID of target entity
 * @param {string} [params.action='UPSERT'] - 'UPSERT' | 'DELETE'
 * @param {number} [params.client_base_version=0] - sync_version at mutation time
 * @param {object|string} params.payload - complete serialized snapshot of entity
 * @param {string} [params.status='pending'] - initial status
 * @param {string} [params.client_timestamp] - ISO 8601 UTC timestamp
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<object>} The queued mutation record
 */
export async function enqueueMutation({
  entity_type,
  entity_id,
  action = MUTATION_ACTIONS.UPSERT,
  client_base_version = 0,
  payload,
  status = MUTATION_STATUS.PENDING,
  client_timestamp,
  database = db
}) {
  // 1. Validate entity_type
  const validTypes = Object.values(ENTITY_TYPES);
  if (!entity_type || !validTypes.includes(entity_type)) {
    throw new SyncQueueValidationError(
      `نوع الكيان غير صالح: "${entity_type}". يجب أن يكون أحد: ${validTypes.join(', ')}`,
      'entity_type'
    );
  }

  // 2. Validate action
  const validActions = Object.values(MUTATION_ACTIONS);
  if (!action || !validActions.includes(action)) {
    throw new SyncQueueValidationError(
      `إجراء التغيير غير صالح: "${action}". يجب أن يكون أحد: ${validActions.join(', ')}`,
      'action'
    );
  }

  // 3. Validate entity_id
  if (!entity_id || typeof entity_id !== 'string' || !entity_id.trim()) {
    throw new SyncQueueValidationError('معرف الكيان مطلوب ويجب أن يكون نصاً غير فارغ', 'entity_id');
  }

  // 4. Validate client_base_version
  const numVersion = Number(client_base_version);
  if (Number.isNaN(numVersion) || numVersion < 0 || !Number.isInteger(numVersion)) {
    throw new SyncQueueValidationError(
      `إصدار العميل الأساسي (${client_base_version}) يجب أن يكون عدداً صحيحاً موجباً أو صفراً`,
      'client_base_version'
    );
  }

  // 5. Validate and serialize payload
  const serializedPayload = serializePayload(payload);

  // 6. Construct mutation record
  const now = client_timestamp || new Date().toISOString();
  const mutationRecord = {
    id: generateUUID(),
    entity_type,
    entity_id: entity_id.trim(),
    action,
    client_base_version: numVersion,
    payload: serializedPayload,
    client_timestamp: now,
    retry_count: 0,
    status
  };

  // 7. Save to Dexie table
  await database.offline_mutation_queue.add(mutationRecord);

  // 8. Emit event
  emitSyncEvent({
    type: 'ENQUEUED',
    mutation: {
      ...mutationRecord,
      parsedPayload: parsePayload(serializedPayload)
    }
  });

  return mutationRecord;
}

/**
 * Retrieves pending and failed mutations in strict FIFO sequence
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {number} [options.limit] - maximum items to return
 * @param {string} [options.entityType] - filter by specific entity type
 * @param {string[]} [options.statuses=['pending', 'failed']] - statuses to retrieve
 * @returns {Promise<Array<object>>} List of mutations in chronological FIFO order
 */
export async function getPendingMutations({
  database = db,
  limit = null,
  entityType = null,
  statuses = [MUTATION_STATUS.PENDING, MUTATION_STATUS.FAILED]
} = {}) {
  let mutations = await database.offline_mutation_queue
    .toCollection()
    .toArray();

  // Filter by status
  if (statuses && statuses.length > 0) {
    const statusSet = new Set(statuses);
    mutations = mutations.filter((m) => statusSet.has(m.status));
  }

  // Filter by entityType if provided
  if (entityType) {
    mutations = mutations.filter((m) => m.entity_type === entityType);
  }

  // Strict FIFO sequence: sort by client_timestamp ascending
  mutations.sort((a, b) => {
    const timeA = new Date(a.client_timestamp || 0).getTime();
    const timeB = new Date(b.client_timestamp || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.id || '').localeCompare(b.id || '');
  });

  if (typeof limit === 'number' && limit > 0) {
    return mutations.slice(0, limit);
  }

  return mutations;
}

/**
 * Retrieves the single next mutation to process in FIFO sequence
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {string} [options.entityType]
 * @returns {Promise<object|null>} Next mutation or null if queue is empty
 */
export async function getNextMutation({ database = db, entityType = null } = {}) {
  const pending = await getPendingMutations({
    database,
    limit: 1,
    entityType,
    statuses: [MUTATION_STATUS.PENDING]
  });
  return pending.length > 0 ? pending[0] : null;
}

/**
 * Peeks into the mutation queue, returning items with pre-parsed payloads
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {number} [options.limit=50]
 * @returns {Promise<Array<object>>}
 */
export async function peekMutationQueue({ database = db, limit = 50 } = {}) {
  const mutations = await getPendingMutations({
    database,
    limit,
    statuses: [MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING, MUTATION_STATUS.FAILED]
  });
  return mutations.map((m) => ({
    ...m,
    parsedPayload: parsePayload(m.payload)
  }));
}

/**
 * Marks a mutation as actively syncing
 *
 * @param {string} mutationId
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<object>} Updated mutation record
 */
export async function markMutationSyncing(mutationId, { database = db } = {}) {
  if (!mutationId) throw new Error('معرف التغيير مطلوب');

  const mutation = await database.offline_mutation_queue.get(mutationId);
  if (!mutation) {
    throw new Error(`التغيير "${mutationId}" غير موجود في قائمة الانتظار`);
  }

  mutation.status = MUTATION_STATUS.SYNCING;
  mutation.syncing_started_at = new Date().toISOString();

  await database.offline_mutation_queue.put(mutation);

  emitSyncEvent({
    type: 'SYNCING',
    mutationId
  });

  return mutation;
}

/**
 * Marks a mutation as failed, incrementing retry count and recording error info
 *
 * @param {string} mutationId
 * @param {string|Error} error
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {number} [options.maxRetries=MAX_MUTATION_RETRIES]
 * @returns {Promise<object>} Updated mutation record
 */
export async function markMutationFailed(mutationId, error = null, {
  database = db,
  maxRetries = MAX_MUTATION_RETRIES
} = {}) {
  if (!mutationId) throw new Error('معرف التغيير مطلوب');

  const mutation = await database.offline_mutation_queue.get(mutationId);
  if (!mutation) {
    throw new Error(`التغيير "${mutationId}" غير موجود في قائمة الانتظار`);
  }

  const errorMessage = typeof error === 'string'
    ? error
    : (error && error.message ? error.message : 'فشل غير معروف في المزامنة');

  mutation.status = MUTATION_STATUS.FAILED;
  mutation.retry_count = (mutation.retry_count || 0) + 1;
  mutation.last_error = errorMessage;
  mutation.last_attempt_at = new Date().toISOString();
  mutation.is_permanently_failed = mutation.retry_count >= maxRetries;

  await database.offline_mutation_queue.put(mutation);

  emitSyncEvent({
    type: 'FAILED',
    mutationId,
    error: errorMessage,
    retryCount: mutation.retry_count,
    isPermanentlyFailed: mutation.is_permanently_failed
  });

  return mutation;
}

/**
 * Dequeues a mutation upon successful processing
 *
 * @param {string} mutationId
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<{ dequeued: boolean, id: string }>}
 */
export async function dequeueMutation(mutationId, { database = db } = {}) {
  if (!mutationId) throw new Error('معرف التغيير مطلوب للحذف من القائمة');

  await database.offline_mutation_queue.delete(mutationId);

  emitSyncEvent({
    type: 'DEQUEUED',
    mutationId
  });

  return { dequeued: true, id: mutationId };
}

/**
 * Removes all queued mutations for a given entity
 *
 * @param {string} entityId
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<number>} Number of removed mutations
 */
export async function removeMutationsForEntity(entityId, { database = db } = {}) {
  if (!entityId) throw new Error('معرف الكيان مطلوب');

  const mutations = await database.offline_mutation_queue
    .where('entity_id')
    .equals(entityId)
    .toArray();

  if (mutations.length > 0) {
    const ids = mutations.map((m) => m.id);
    await database.offline_mutation_queue.bulkDelete(ids);
    for (const id of ids) {
      emitSyncEvent({ type: 'DEQUEUED', mutationId: id });
    }
  }

  return mutations.length;
}

/**
 * Requeues all failed mutations back to 'pending' state
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {boolean} [options.resetRetryCount=false]
 * @returns {Promise<number>} Number of requeued mutations
 */
export async function requeueFailedMutations({
  database = db,
  resetRetryCount = false
} = {}) {
  const failed = await database.offline_mutation_queue
    .where('status')
    .equals(MUTATION_STATUS.FAILED)
    .toArray();

  if (failed.length === 0) return 0;

  const now = new Date().toISOString();
  for (const m of failed) {
    m.status = MUTATION_STATUS.PENDING;
    m.requeued_at = now;
    if (resetRetryCount) {
      m.retry_count = 0;
      m.is_permanently_failed = false;
    }
    await database.offline_mutation_queue.put(m);
  }

  emitSyncEvent({
    type: 'REQUEUED',
    count: failed.length
  });

  return failed.length;
}

/**
 * Clears all mutations from the offline mutation queue
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<void>}
 */
export async function clearMutationQueue({ database = db } = {}) {
  await database.offline_mutation_queue.clear();
  emitSyncEvent({ type: 'QUEUE_CLEARED' });
}

/**
 * Computes mutation queue metrics for UI status pills and health indicators
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<object>} Metrics object
 */
export async function getQueueMetrics({ database = db } = {}) {
  const allMutations = await database.offline_mutation_queue.toArray();

  let pending = 0;
  let syncing = 0;
  let failed = 0;
  let oldestTimestamp = null;
  const byEntityType = {
    [ENTITY_TYPES.ACCOUNT]: 0,
    [ENTITY_TYPES.CATEGORY]: 0,
    [ENTITY_TYPES.TRANSACTION]: 0
  };

  for (const m of allMutations) {
    if (m.status === MUTATION_STATUS.PENDING) pending++;
    else if (m.status === MUTATION_STATUS.SYNCING) syncing++;
    else if (m.status === MUTATION_STATUS.FAILED) failed++;

    if (m.entity_type && byEntityType[m.entity_type] !== undefined) {
      byEntityType[m.entity_type]++;
    }

    if (m.client_timestamp) {
      if (!oldestTimestamp || new Date(m.client_timestamp) < new Date(oldestTimestamp)) {
        oldestTimestamp = m.client_timestamp;
      }
    }
  }

  const total = allMutations.length;
  const hasPending = pending > 0 || failed > 0 || syncing > 0;
  const isSynced = total === 0;

  return {
    total,
    pending,
    syncing,
    failed,
    hasPending,
    isSynced,
    oldestTimestamp,
    byEntityType
  };
}

/**
 * Computes matching SyncStatusPill status token
 *
 * @param {object} [params]
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @param {boolean} [params.isOnline=true]
 * @returns {Promise<string>} One of: 'synced' | 'pending' | 'syncing' | 'failed' | 'offline'
 */
export async function computeSyncPillStatus({ database = db, isOnline = true } = {}) {
  if (!isOnline) {
    return SYNC_STATUS.OFFLINE;
  }

  const metrics = await getQueueMetrics({ database });
  if (metrics.failed > 0) return SYNC_STATUS.FAILED;
  if (metrics.syncing > 0) return SYNC_STATUS.SYNCING;
  if (metrics.pending > 0) return SYNC_STATUS.PENDING;
  return SYNC_STATUS.SYNCED;
}

/**
 * Evaluates Optimistic Concurrency Control (OCC) against a server record
 *
 * @param {object} params
 * @param {object} params.mutation - Queued mutation
 * @param {object|null} params.serverRecord - Canonical record from server, or null if entity does not exist yet
 * @returns {{ conflict: boolean, clientBaseVersion: number, serverVersion: number, reason?: string, message?: string }}
 */
export function evaluateOCC({ mutation, serverRecord }) {
  if (!mutation) {
    throw new Error('الكائن mutation مطلوب لتقييم OCC');
  }

  const clientBaseVersion = typeof mutation.client_base_version === 'number'
    ? mutation.client_base_version
    : 0;

  // If server does not have the record yet (e.g., initial creation)
  if (!serverRecord) {
    return {
      conflict: false,
      clientBaseVersion,
      serverVersion: 0
    };
  }

  const serverVersion = typeof serverRecord.sync_version === 'number'
    ? serverRecord.sync_version
    : 1;

  // Concurrency check: does server version match client base version?
  if (serverVersion === clientBaseVersion) {
    return {
      conflict: false,
      clientBaseVersion,
      serverVersion
    };
  }

  // Version mismatch: another device modified this entity in the interim
  return {
    conflict: true,
    clientBaseVersion,
    serverVersion,
    reason: 'VERSION_MISMATCH',
    message: `تعارض تزامن: إصدار الخادم (${serverVersion}) لا يطابق إصدار العميل الأساسي (${clientBaseVersion})`
  };
}

/**
 * Resolves an OCC conflict according to ADR-005 and Frozen Specification Section 18:
 * 1. Overwritten local change is NEVER silently dropped.
 * 2. Local change is archived to conflict_audit_log table in IndexedDB.
 * 3. Server's canonical record is applied to local IndexedDB.
 * 4. Account balances are reconciled if the entity is a transaction.
 * 5. Mutation is dequeued from offline_mutation_queue.
 * 6. User conflict alert event is emitted.
 *
 * @param {object} params
 * @param {object} params.mutation - Conflicting mutation
 * @param {object} params.serverCanonicalRecord - Remote canonical entity
 * @param {string} [params.resolutionNote] - Optional custom resolution note
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<{ status: string, auditEntry: object, canonicalRecord: object, warningMessage: string }>}
 */
export async function resolveConflictAndArchive({
  mutation,
  serverCanonicalRecord,
  resolutionNote = '',
  database = db
}) {
  if (!mutation) throw new Error('معامل mutation مطلوب لحل التعارض');
  if (!serverCanonicalRecord) throw new Error('سجل الخادم الرسمي serverCanonicalRecord مطلوب لحل التعارض');

  const clientPayload = parsePayload(mutation.payload);
  const now = new Date().toISOString();

  // 1. Construct Conflict Audit Entry
  const auditEntry = {
    id: generateUUID(),
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    client_payload: clientPayload,
    server_payload: serverCanonicalRecord,
    resolved_at: now,
    resolution_note: resolutionNote ||
      `تعارض في ${mutation.entity_type}: النسخة المحلية (إصدار ${mutation.client_base_version}) تعارضت مع الخادم (إصدار ${serverCanonicalRecord.sync_version}). تم حفظ النسخة المحلية في سجل التدقيق واعتماد النسخة الرسمية.`
  };

  // 2. Perform atomic storage update
  await database.transaction(
    'rw',
    [
      database.conflict_audit_log,
      database.offline_mutation_queue,
      database[mutation.entity_type === 'transaction' ? 'transactions' : mutation.entity_type === 'account' ? 'accounts' : 'categories'],
      ...(mutation.entity_type === 'transaction' ? [database.accounts] : [])
    ],
    async () => {
      // A. Archive conflicting local edit into conflict_audit_log
      await database.conflict_audit_log.add(auditEntry);

      // B. Apply canonical server record to local entity table
      if (mutation.entity_type === ENTITY_TYPES.TRANSACTION) {
        await database.transactions.put(serverCanonicalRecord);
      } else if (mutation.entity_type === ENTITY_TYPES.ACCOUNT) {
        await database.accounts.put(serverCanonicalRecord);
      } else if (mutation.entity_type === ENTITY_TYPES.CATEGORY) {
        await database.categories.put(serverCanonicalRecord);
      }

      // C. Purge the mutation from offline_mutation_queue
      await database.offline_mutation_queue.delete(mutation.id);
    }
  );

  // 3. If entity was a transaction, reconcile affected account balances
  if (mutation.entity_type === ENTITY_TYPES.TRANSACTION && database.accounts) {
    const affectedAccountIds = new Set();
    if (serverCanonicalRecord.account_id) affectedAccountIds.add(serverCanonicalRecord.account_id);
    if (serverCanonicalRecord.destination_account_id) affectedAccountIds.add(serverCanonicalRecord.destination_account_id);
    if (clientPayload && clientPayload.account_id) affectedAccountIds.add(clientPayload.account_id);
    if (clientPayload && clientPayload.destination_account_id) affectedAccountIds.add(clientPayload.destination_account_id);

    for (const accId of affectedAccountIds) {
      try {
        await reconcileAccountBalance(accId, database);
      } catch (err) {
        console.warn(`[SyncQueue] Error reconciling account balance for ${accId}:`, err);
      }
    }
  }

  // 4. Emit conflict resolved event with warning message
  const warningMessage = DEFAULT_CONFLICT_ARABIC_MESSAGE;
  emitSyncEvent({
    type: 'CONFLICT_RESOLVED',
    auditEntry,
    canonicalRecord: serverCanonicalRecord,
    warningMessage
  });

  return {
    status: 'conflict_resolved',
    auditEntry,
    canonicalRecord: serverCanonicalRecord,
    warningMessage
  };
}

/**
 * Dispatches a server sync response for a given mutation:
 * - If no conflict: updates local sync_version and removes mutation from queue.
 * - If conflict: triggers OCC conflict resolution & archives local change.
 *
 * @param {object} params
 * @param {object} params.mutation - Queued mutation
 * @param {object} params.syncResponse - Response from server/RPC
 * @param {boolean} params.syncResponse.success - Whether server accepted write
 * @param {boolean} [params.syncResponse.conflict=false] - Whether conflict was detected
 * @param {object} [params.syncResponse.serverRecord] - Canonical or updated record from server
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<object>} Outcome summary
 */
export async function applySyncResult({
  mutation,
  syncResponse,
  database = db
}) {
  if (!mutation) throw new Error('معامل mutation مطلوب');
  if (!syncResponse) throw new Error('معامل syncResponse مطلوب');

  // Case B: Concurrency Conflict Detected
  if (syncResponse.conflict) {
    const resolution = await resolveConflictAndArchive({
      mutation,
      serverCanonicalRecord: syncResponse.serverRecord,
      database
    });
    return resolution;
  }

  // Case A: No Conflict - Write Accepted
  if (syncResponse.success) {
    const serverRecord = syncResponse.serverRecord;
    const newVersion = serverRecord && typeof serverRecord.sync_version === 'number'
      ? serverRecord.sync_version
      : (mutation.client_base_version || 0) + 1;

    // Update local entity sync_version and updated_at
    const table = database[
      mutation.entity_type === 'transaction'
        ? 'transactions'
        : mutation.entity_type === 'account'
        ? 'accounts'
        : 'categories'
    ];

    if (table) {
      const existing = await table.get(mutation.entity_id);
      if (existing) {
        existing.sync_version = newVersion;
        if (serverRecord && serverRecord.updated_at) {
          existing.updated_at = serverRecord.updated_at;
        }
        await table.put(existing);
      }
    }

    // Dequeue mutation
    await dequeueMutation(mutation.id, { database });

    emitSyncEvent({
      type: 'SYNCED',
      mutationId: mutation.id,
      entityType: mutation.entity_type,
      entityId: mutation.entity_id,
      newSyncVersion: newVersion
    });

    return {
      status: 'synced',
      mutationId: mutation.id,
      newSyncVersion: newVersion
    };
  }

  // Failed sync without conflict (network error or server validation error)
  const errorMessage = syncResponse.error || 'فشلت المزامنة على الخادم';
  await markMutationFailed(mutation.id, errorMessage, { database });

  return {
    status: 'failed',
    mutationId: mutation.id,
    error: errorMessage
  };
}

/**
 * Retrieves logged conflicts from conflict_audit_log
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {string} [options.entityType]
 * @param {number} [options.limit=50]
 * @returns {Promise<Array<object>>} Conflict records ordered by resolved_at descending
 */
export async function getConflictAuditLogs({
  database = db,
  entityType = null,
  limit = 50
} = {}) {
  let logs = await database.conflict_audit_log.toArray();

  if (entityType) {
    logs = logs.filter((log) => log.entity_type === entityType);
  }

  logs.sort((a, b) => {
    const timeA = new Date(a.resolved_at || 0).getTime();
    const timeB = new Date(b.resolved_at || 0).getTime();
    return timeB - timeA;
  });

  if (typeof limit === 'number' && limit > 0) {
    return logs.slice(0, limit);
  }

  return logs;
}

/**
 * Retrieves a single conflict audit log entry by ID
 *
 * @param {string} id
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<object|null>}
 */
export async function getConflictAuditLogById(id, { database = db } = {}) {
  if (!id) return null;
  return (await database.conflict_audit_log.get(id)) || null;
}

/**
 * Clears all entries from conflict_audit_log
 *
 * @param {object} [options]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @returns {Promise<void>}
 */
export async function clearConflictAuditLogs({ database = db } = {}) {
  await database.conflict_audit_log.clear();
}
