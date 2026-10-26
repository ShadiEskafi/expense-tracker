import { db } from '../db/db.js';
import { getPendingMutations, MUTATION_STATUS, parsePayload } from './syncQueue.js';

const UNSYNCED_STATUSES = [
  MUTATION_STATUS.PENDING,
  MUTATION_STATUS.FAILED,
  MUTATION_STATUS.SYNCING
];

export class SignOutBlockedError extends Error {
  constructor(pendingCount) {
    super(`لديك ${pendingCount} تعديلات غير متزامنة على هذا الجهاز. تسجيل الخروج الآن سيؤدي إلى فقدانها.`);
    this.name = 'SignOutBlockedError';
    this.code = 'SIGN_OUT_BLOCKED_UNSYNCED_MUTATIONS';
    this.pendingCount = pendingCount;
  }
}

/** Include in-flight and failed work, not only mutations waiting to start. */
export async function inspectSignOutSafety(database = db) {
  const mutations = await getPendingMutations({ database, statuses: UNSYNCED_STATUSES });
  return { pendingCount: mutations.length, canSignOut: mutations.length === 0 };
}

/** Remove only this account's cached records and related sync metadata. */
export async function purgeLocalCloudCache(database = db, userId) {
  if (!userId) throw new TypeError('معرّف الحساب مطلوب لمسح بياناته المحلية.');

  await database.transaction('rw', [
    database.accounts,
    database.categories,
    database.transactions,
    database.offline_mutation_queue,
    database.conflict_audit_log,
    database.settings
  ], async () => {
    const { pendingCount } = await inspectSignOutSafety(database);
    if (pendingCount > 0) throw new SignOutBlockedError(pendingCount);

    const [accounts, categories, transactions, queued, conflicts] = await Promise.all([
      database.accounts.where('user_id').equals(userId).toArray(),
      database.categories.where('user_id').equals(userId).toArray(),
      database.transactions.where('user_id').equals(userId).toArray(),
      database.offline_mutation_queue.toArray(),
      database.conflict_audit_log.toArray()
    ]);
    const ownedIds = new Set([...accounts, ...categories, ...transactions].map((row) => row.id));
    const belongsToUser = (record) => record?.user_id === userId;

    await Promise.all([
      database.accounts.bulkDelete(accounts.map((row) => row.id)),
      database.categories.bulkDelete(categories.map((row) => row.id)),
      database.transactions.bulkDelete(transactions.map((row) => row.id)),
      database.offline_mutation_queue.bulkDelete(queued
        .filter((row) => ownedIds.has(row.entity_id) || belongsToUser(parsePayload(row.payload)))
        .map((row) => row.id)),
      database.conflict_audit_log.bulkDelete(conflicts
        .filter((row) => ownedIds.has(row.entity_id) || belongsToUser(row.client_payload) || belongsToUser(row.server_payload))
        .map((row) => row.id)),
      database.settings.delete('last_cloud_sync_timestamp')
    ]);
  });
}
