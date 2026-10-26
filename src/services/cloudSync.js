import { createClient } from '@supabase/supabase-js';
import { db } from '../db/db.js';
import {
  enqueueMutation,
  getPendingMutations,
  markMutationSyncing,
  markMutationFailed,
  applySyncResult,
  parsePayload,
  computeSyncPillStatus,
  MUTATION_ACTIONS,
  MUTATION_STATUS,
  ENTITY_TYPES
} from './syncQueue.js';
import { reconcileAccountBalance } from './account.js';
import {
  inspectSignOutSafety,
  purgeLocalCloudCache,
  SignOutBlockedError
} from './signOutSafety.js';

export { SignOutBlockedError } from './signOutSafety.js';

/**
 * Storage key for last cloud synchronization timestamp
 */
export const SETTING_KEY_LAST_SYNC = 'last_cloud_sync_timestamp';

/**
 * Active Supabase client singleton instance
 */
let supabaseClientInstance = null;

/**
 * Auth state subscribers
 */
const authSubscribers = new Set();

/**
 * Custom error thrown when Supabase operation or authentication fails
 */
export class CloudSyncError extends Error {
  constructor(message, originalError = null, code = 'CLOUD_SYNC_ERROR') {
    super(message);
    this.name = 'CloudSyncError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Retrieves the current configured Supabase client instance.
 * If not initialized, attempts to instantiate from Vite environment variables.
 *
 * @param {object} [customClient] - Optional override client (useful for mocks/tests)
 * @returns {object|null} The Supabase client, or null if configuration is absent
 */
export function getSupabaseClient(customClient = null) {
  if (customClient) {
    return customClient;
  }

  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }

  const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
  const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

  if (supabaseUrl && supabaseAnonKey) {
    try {
      supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return supabaseClientInstance;
    } catch (err) {
      console.warn('[CloudSync] Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return null;
}

/**
 * Sets the active Supabase client instance (for testing or runtime override)
 * @param {object|null} client
 */
export function setSupabaseClient(client) {
  supabaseClientInstance = client;
}

/**
 * Resets the client singleton (useful for test teardown)
 */
export function resetSupabaseClient() {
  supabaseClientInstance = null;
  authSubscribers.clear();
}

/**
 * Subscribes a listener to authentication state transitions
 * @param {Function} callback
 * @returns {Function} unsubscribe function
 */
export function subscribeToAuthChanges(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('Callback must be a function');
  }
  authSubscribers.add(callback);
  return () => {
    authSubscribers.delete(callback);
  };
}

/**
 * Emits an auth event to all registered listeners
 * @param {object} event
 */
function emitAuthChange(event) {
  for (const subscriber of authSubscribers) {
    try {
      subscriber(event);
    } catch (err) {
      console.error('[CloudSync] Error in auth subscriber:', err);
    }
  }
}

/**
 * Retrieves the currently authenticated user, or null if in Guest Mode
 *
 * @param {object} [client] - Optional Supabase client
 * @returns {Promise<object|null>} User object with id and email, or null
 */
export async function getCurrentUser(client = null) {
  const sb = getSupabaseClient(client);
  if (!sb || !sb.auth) {
    return null;
  }

  try {
    const { data, error } = await sb.auth.getUser();
    if (error || !data || !data.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Checks if the application is currently running in Guest Mode (unauthenticated)
 *
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function isGuestMode(client = null) {
  const user = await getCurrentUser(client);
  return user === null;
}

/**
 * Retrieves the active Supabase auth session
 *
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function getAuthSession(client = null) {
  const sb = getSupabaseClient(client);
  if (!sb || !sb.auth) return null;

  try {
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  } catch {
    return null;
  }
}

/**
 * Signs up a new user with email and password via Supabase Auth,
 * and triggers initial data merge of local guest records.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {object} [params.client]
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<{ user: object, session: object, mergeSummary: object }>}
 */
export async function signUpWithEmail({
  email,
  password,
  client = null,
  database = db
}) {
  const sb = getSupabaseClient(client);
  if (!sb || !sb.auth) {
    throw new CloudSyncError('خدمة المصادقة السحابية غير مهيأة. يرجى التحقق من إعدادات Supabase.');
  }

  if (await getCurrentUser(sb)) {
    throw new CloudSyncError('سجّل الخروج بأمان من الحساب الحالي قبل إنشاء حساب آخر.');
  }

  if (!email || !email.includes('@')) {
    throw new CloudSyncError('يرجى إدخال بريد إلكتروني صالح.');
  }
  if (!password || password.length < 6) {
    throw new CloudSyncError('كلمة المرور يجب أن لا تقل عن 6 أحرف.');
  }

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) {
    throw new CloudSyncError(error.message || 'فشل في إنشاء الحساب السحابي.', error);
  }

  const user = data.user;
  let mergeSummary = null;

  if (user) {
    // Merge local guest data into the newly created account
    mergeSummary = await mergeGuestDataOnLogin({
      userId: user.id,
      client: sb,
      database
    });

    emitAuthChange({
      type: 'SIGNED_IN',
      user,
      session: data.session,
      isNewUser: true,
      mergeSummary
    });
  }

  return {
    user,
    session: data.session,
    mergeSummary
  };
}

/**
 * Signs in an existing user with email and password via Supabase Auth,
 * and executes initial data merge for any local records.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {object} [params.client]
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<{ user: object, session: object, mergeSummary: object }>}
 */
export async function signInWithEmail({
  email,
  password,
  client = null,
  database = db
}) {
  const sb = getSupabaseClient(client);
  if (!sb || !sb.auth) {
    throw new CloudSyncError('خدمة المصادقة السحابية غير مهيأة.');
  }

  if (await getCurrentUser(sb)) {
    throw new CloudSyncError('سجّل الخروج بأمان من الحساب الحالي قبل الدخول إلى حساب آخر.');
  }

  if (!email || !email.includes('@')) {
    throw new CloudSyncError('يرجى إدخال بريد إلكتروني صالح.');
  }
  if (!password) {
    throw new CloudSyncError('يرجى إدخال كلمة المرور.');
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    throw new CloudSyncError(error.message || 'بيانات الاعتماد غير صحيحة.', error);
  }

  const user = data.user;
  let mergeSummary = null;

  if (user) {
    // Merge guest data (if any) and synchronize cloud state
    mergeSummary = await mergeGuestDataOnLogin({
      userId: user.id,
      client: sb,
      database
    });

    emitAuthChange({
      type: 'SIGNED_IN',
      user,
      session: data.session,
      isNewUser: false,
      mergeSummary
    });
  }

  return {
    user,
    session: data.session,
    mergeSummary
  };
}

/**
 * Signs out the currently authenticated user.
 * Validates that there are no un-synced offline mutations and purges this account's local cache.
 *
 * @param {object} [params]
 * @param {object} [params.client]
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<{ success: boolean }>}
 */
export async function signOutUser({
  client = null,
  database = db
} = {}) {
  const sb = getSupabaseClient(client);
  if (!sb?.auth) {
    throw new CloudSyncError('خدمة المصادقة السحابية غير مهيأة. لا يمكن تأكيد تسجيل الخروج.');
  }
  const user = await getCurrentUser(sb);
  if (!user?.id) throw new CloudSyncError('تعذر التحقق من الحساب الحالي.');

  const { pendingCount } = await inspectSignOutSafety(database);
  if (pendingCount > 0) throw new SignOutBlockedError(pendingCount);

  const { error } = await sb.auth.signOut();
  if (error) {
    throw new CloudSyncError(error.message || 'تعذر تسجيل الخروج من الحساب السحابي.', error);
  }

  await purgeLocalCloudCache(database, user.id);

  emitAuthChange({
    type: 'SIGNED_OUT',
    user: null,
    session: null
  });

  return { success: true };
}

/**
 * Retrieves the recorded last sync timestamp from database settings
 *
 * @param {import('../db/db.js').ExpenseDatabase} [database=db]
 * @returns {Promise<string|null>} ISO 8601 UTC timestamp or null
 */
export async function getLastSyncTimestamp(database = db) {
  if (!database || !database.settings) return null;
  const setting = await database.settings.get(SETTING_KEY_LAST_SYNC);
  return setting?.value || null;
}

/**
 * Stores the last sync timestamp in database settings
 *
 * @param {string} timestamp - ISO 8601 UTC timestamp
 * @param {import('../db/db.js').ExpenseDatabase} [database=db]
 */
export async function setLastSyncTimestamp(timestamp, database = db) {
  if (!database || !database.settings) return;
  await database.settings.put({
    key: SETTING_KEY_LAST_SYNC,
    value: timestamp,
    updated_at: new Date().toISOString()
  });
}

/**
 * Formats a sync timestamp into natural Arabic text
 *
 * @param {string|null} timestamp
 * @returns {string} Arabic formatted status (e.g., 'الآن', 'منذ 5 دقائق', 'غير متزامن بعد')
 */
export function formatLastSyncTimeArabic(timestamp) {
  if (!timestamp) return 'غير متزامن بعد';
  try {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    if (diffMs < 0 || diffMs < 60000) return 'الآن';
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) {
      return `منذ ${diffMinutes} ${diffMinutes === 1 ? 'دقيقة' : diffMinutes === 2 ? 'دقيقتين' : 'دقائق'}`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `منذ ${diffHours} ${diffHours === 1 ? 'ساعة' : diffHours === 2 ? 'ساعتين' : 'ساعات'}`;
    }
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short'
    });
  } catch {
    return 'غير متزامن';
  }
}

/**
 * Initial Data Merge Engine (First-Time Login & Guest Migration)
 * Follows ADR-006, Section 19 of Frozen Specification, and Section 8 of sync-architecture.md:
 * 1. Preserves all local guest accounts, transactions, and categories.
 * 2. Deterministic Category Deduplication: matches pre-seeded categories by system 'slug'.
 *    Re-maps local transactions referencing guest slug categories to the cloud category ID.
 * 3. Account Independence: never blindly merges accounts by name; keeps guest accounts distinct.
 * 4. Stamped with authenticated user_id and queued for upload via offline_mutation_queue.
 * 5. Pulls remote updates and updates last_sync_timestamp.
 *
 * @param {object} params
 * @param {string} params.userId - Authenticated user UUID
 * @param {object} [params.client] - Supabase client
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @returns {Promise<object>} Merge summary
 */
export async function mergeGuestDataOnLogin({
  userId,
  client = null,
  database = db
}) {
  if (!userId) {
    throw new CloudSyncError('معرف المستخدم userId مطلوب لإجراء دمج البيانات الأولية.');
  }

  const sb = getSupabaseClient(client);

  // 1. Load local guest data (where user_id is null or guest)
  const localCategories = await database.categories.toArray();
  const guestCategories = localCategories.filter((c) => !c.user_id || c.user_id === null);

  const localAccounts = await database.accounts.toArray();
  const guestAccounts = localAccounts.filter((a) => !a.user_id || a.user_id === null);

  const localTransactions = await database.transactions.toArray();
  const guestTransactions = localTransactions.filter((t) => !t.user_id || t.user_id === null);

  // 2. Fetch remote categories and accounts from Supabase (if available)
  let remoteCategories = [];
  let remoteAccounts = [];

  if (sb) {
    try {
      const catRes = await sb
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`);
      if (catRes.data) {
        remoteCategories = catRes.data;
      }
    } catch (e) {
      console.warn('[CloudSync] Could not fetch remote categories during merge:', e);
    }

    try {
      const accRes = await sb
        .from('accounts')
        .select('*')
        .eq('user_id', userId);
      if (accRes.data) {
        remoteAccounts = accRes.data;
      }
    } catch (e) {
      console.warn('[CloudSync] Could not fetch remote accounts during merge:', e);
    }
  }

  // 3. Category Deduplication by Slug (ADR-006)
  // Map remote categories by slug for fast lookup
  const remoteCategoryBySlug = new Map();
  for (const remoteCat of remoteCategories) {
    if (remoteCat.slug) {
      remoteCategoryBySlug.set(remoteCat.slug, remoteCat);
    }
  }

  const categoryRemap = new Map(); // guestCatId -> remoteCatId
  const categoriesToQueue = [];
  const categoriesToDeleteLocal = [];
  let deduplicatedCategoriesCount = 0;

  for (const guestCat of guestCategories) {
    if (guestCat.slug && remoteCategoryBySlug.has(guestCat.slug)) {
      // Collision on system default slug: deduplicate!
      const remoteCanonicalCat = remoteCategoryBySlug.get(guestCat.slug);
      categoryRemap.set(guestCat.id, remoteCanonicalCat.id);
      categoriesToDeleteLocal.push(guestCat.id);
      deduplicatedCategoriesCount++;

      // Ensure canonical remote category is present in local IndexedDB
      await database.categories.put({
        ...remoteCanonicalCat,
        user_id: userId
      });
    } else {
      // Custom category or default not present remotely: assign user_id and retain
      const updatedCat = {
        ...guestCat,
        user_id: userId,
        updated_at: new Date().toISOString(),
        sync_version: guestCat.sync_version || 1
      };
      await database.categories.put(updatedCat);
      categoriesToQueue.push(updatedCat);
    }
  }

  // Delete redundant local duplicate guest categories
  if (categoriesToDeleteLocal.length > 0) {
    await database.categories.bulkDelete(categoriesToDeleteLocal);
  }

  // 4. Account Independence (Section 19.3)
  // Remote account names for collision check
  const remoteAccountNames = new Set(remoteAccounts.map((a) => a.name));
  const accountsToQueue = [];

  for (const guestAcc of guestAccounts) {
    let finalName = guestAcc.name;
    // If name collides and remote account exists, maintain account independence by distinguishing
    if (remoteAccountNames.has(guestAcc.name)) {
      finalName = `${guestAcc.name} (محلي)`;
    }

    const updatedAcc = {
      ...guestAcc,
      name: finalName,
      user_id: userId,
      updated_at: new Date().toISOString(),
      sync_version: guestAcc.sync_version || 1
    };

    await database.accounts.put(updatedAcc);
    accountsToQueue.push(updatedAcc);
  }

  // 5. Transaction Relationship Integrity & Category Reassignment
  const transactionsToQueue = [];

  for (const guestTx of guestTransactions) {
    let targetCategoryId = guestTx.category_id;
    if (targetCategoryId && categoryRemap.has(targetCategoryId)) {
      // Re-map to canonical deduplicated cloud category ID
      targetCategoryId = categoryRemap.get(targetCategoryId);
    }

    const updatedTx = {
      ...guestTx,
      category_id: targetCategoryId,
      user_id: userId,
      updated_at: new Date().toISOString(),
      sync_version: guestTx.sync_version || 1
    };

    await database.transactions.put(updatedTx);
    transactionsToQueue.push(updatedTx);
  }

  // Reconcile account balances to ensure integrity
  for (const acc of accountsToQueue) {
    try {
      await reconcileAccountBalance(acc.id, database);
    } catch (e) {
      console.warn(`[CloudSync] Balance reconciliation warning during merge for account ${acc.id}:`, e);
    }
  }

  // 6. Enqueue all merged entities into offline_mutation_queue
  for (const cat of categoriesToQueue) {
    await enqueueMutation({
      entity_type: ENTITY_TYPES.CATEGORY,
      entity_id: cat.id,
      action: MUTATION_ACTIONS.UPSERT,
      client_base_version: 0,
      payload: cat,
      database
    });
  }

  for (const acc of accountsToQueue) {
    await enqueueMutation({
      entity_type: ENTITY_TYPES.ACCOUNT,
      entity_id: acc.id,
      action: MUTATION_ACTIONS.UPSERT,
      client_base_version: 0,
      payload: acc,
      database
    });
  }

  for (const tx of transactionsToQueue) {
    await enqueueMutation({
      entity_type: ENTITY_TYPES.TRANSACTION,
      entity_id: tx.id,
      action: MUTATION_ACTIONS.UPSERT,
      client_base_version: 0,
      payload: tx,
      database
    });
  }

  // 7. Perform initial push and pull if online client is active
  let syncResult = null;
  if (sb) {
    try {
      syncResult = await syncWithCloud({
        client: sb,
        database,
        userId
      });
    } catch (err) {
      console.warn('[CloudSync] Background sync deferred after initial merge:', err);
    }
  }

  return {
    success: true,
    userId,
    deduplicatedCategoriesCount,
    mergedCategoriesCount: categoriesToQueue.length,
    mergedAccountsCount: accountsToQueue.length,
    mergedTransactionsCount: transactionsToQueue.length,
    syncResult
  };
}

/**
 * Pushes pending mutations from offline_mutation_queue to Supabase.
 * Executes OCC check and processes server results or archives conflicts.
 *
 * @param {object} params
 * @param {object} [params.client] - Supabase client
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @param {string} [params.userId]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ pushedCount: number, conflictsCount: number, failedCount: number }>}
 */
export async function pushPendingMutations({
  client = null,
  database = db,
  userId = null,
  limit = 50
} = {}) {
  const sb = getSupabaseClient(client);
  if (!sb) {
    return { pushedCount: 0, conflictsCount: 0, failedCount: 0, offline: true };
  }

  const mutations = await getPendingMutations({
    database,
    limit,
    statuses: [MUTATION_STATUS.PENDING, MUTATION_STATUS.FAILED]
  });

  if (mutations.length === 0) {
    return { pushedCount: 0, conflictsCount: 0, failedCount: 0 };
  }

  let pushedCount = 0;
  let conflictsCount = 0;
  let failedCount = 0;

  for (const mutation of mutations) {
    try {
      await markMutationSyncing(mutation.id, { database });

      const payload = parsePayload(mutation.payload);
      if (userId && !payload.user_id) {
        payload.user_id = userId;
      }

      // Check if Supabase RPC function 'sync_mutation' is defined
      let syncResponse = null;

      try {
        if (typeof sb.rpc === 'function') {
          const rpcRes = await sb.rpc('sync_mutation', {
            p_mutation_id: mutation.id,
            p_entity_type: mutation.entity_type,
            p_entity_id: mutation.entity_id,
            p_action: mutation.action,
            p_client_base_version: mutation.client_base_version,
            p_payload: payload
          });

          if (!rpcRes.error && rpcRes.data) {
            syncResponse = rpcRes.data;
          }
        }
      } catch {
        // Fallback to direct table OCC query below
      }

      // Direct Table OCC Fallback if RPC was not executed or not available
      if (!syncResponse) {
        const tableMap = {
          account: 'accounts',
          category: 'categories',
          transaction: 'transactions'
        };
        const tableName = tableMap[mutation.entity_type];

        // 1. Fetch remote canonical record to evaluate OCC
        const { data: serverRecord, error: selectErr } = await sb
          .from(tableName)
          .select('*')
          .eq('id', mutation.entity_id)
          .maybeSingle();

        if (selectErr) {
          throw selectErr;
        }

        const serverVersion = serverRecord ? (serverRecord.sync_version || 1) : 0;
        const clientBaseVersion = mutation.client_base_version || 0;

        // OCC Check: Does server version match client base version?
        // Note: For brand-new records, serverRecord is null and clientBaseVersion is 0 (or match).
        const hasConflict = serverRecord !== null && serverVersion !== clientBaseVersion;

        if (hasConflict) {
          syncResponse = {
            success: false,
            conflict: true,
            serverRecord
          };
        } else {
          // No conflict: commit write to Supabase
          const newVersion = serverVersion + 1;
          const now = new Date().toISOString();

          let writeRes;
          if (mutation.action === MUTATION_ACTIONS.DELETE) {
            const query = sb
              .from(tableName)
              .update({
                deleted_at: now,
                updated_at: now,
                sync_version: newVersion
              })
              .eq('id', mutation.entity_id);

            writeRes = typeof query.select === 'function'
              ? await query.select().single()
              : await query;
          } else {
            // Upsert
            const remoteSnapshot = {
              ...payload,
              updated_at: now,
              sync_version: newVersion
            };
            const query = sb.from(tableName).upsert(remoteSnapshot);
            writeRes = typeof query.select === 'function'
              ? await query.select().single()
              : await query;
          }

          if (writeRes.error) {
            throw writeRes.error;
          }

          syncResponse = {
            success: true,
            conflict: false,
            serverRecord: writeRes.data
          };
        }
      }

      // Apply the sync response through syncQueue engine
      const result = await applySyncResult({
        mutation,
        syncResponse,
        database
      });

      if (result.status === 'synced') {
        pushedCount++;
      } else if (result.status === 'conflict_resolved') {
        conflictsCount++;
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
      await markMutationFailed(mutation.id, err.message || 'فشل في إرسال التغيير إلى الخادم', { database });
    }
  }

  return {
    pushedCount,
    conflictsCount,
    failedCount
  };
}

/**
 * Pulls remote updates from Supabase updated since lastSyncTimestamp,
 * applying changes into local IndexedDB and reconciling balances.
 *
 * @param {object} params
 * @param {object} [params.client] - Supabase client
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @param {string} [params.userId]
 * @param {string} [params.sinceTimestamp]
 * @returns {Promise<{ accountsCount: number, categoriesCount: number, transactionsCount: number, newSyncTimestamp: string }>}
 */
export async function pullRemoteUpdates({
  client = null,
  database = db,
  userId = null,
  sinceTimestamp = null
} = {}) {
  const sb = getSupabaseClient(client);
  if (!sb) {
    return { accountsCount: 0, categoriesCount: 0, transactionsCount: 0, offline: true };
  }

  const effectiveUserId = userId || (await getCurrentUser(sb))?.id;
  const lastTimestamp = sinceTimestamp || (await getLastSyncTimestamp(database));
  const newSyncTimestamp = new Date().toISOString();

  // Helper to construct query
  const buildQuery = (tableName, userCondition = true) => {
    let query = sb.from(tableName).select('*');
    if (userCondition && effectiveUserId) {
      if (tableName === 'categories') {
        query = query.or(`user_id.eq.${effectiveUserId},is_default.eq.true`);
      } else {
        query = query.eq('user_id', effectiveUserId);
      }
    }
    if (lastTimestamp) {
      query = query.gt('updated_at', lastTimestamp);
    }
    return query;
  };

  const [accRes, catRes, txRes] = await Promise.all([
    buildQuery('accounts').then((r) => r.data || []),
    buildQuery('categories').then((r) => r.data || []),
    buildQuery('transactions').then((r) => r.data || [])
  ]);

  // Read currently pending mutation entity_ids to avoid overwriting un-pushed local edits
  const pendingMutations = await getPendingMutations({
    database,
    statuses: [MUTATION_STATUS.PENDING, MUTATION_STATUS.SYNCING]
  });
  const pendingEntityIds = new Set(pendingMutations.map((m) => m.entity_id));

  // 1. Apply pulled categories
  let categoriesCount = 0;
  for (const cat of catRes) {
    if (!pendingEntityIds.has(cat.id)) {
      await database.categories.put(cat);
      categoriesCount++;
    }
  }

  // 2. Apply pulled accounts
  let accountsCount = 0;
  for (const acc of accRes) {
    if (!pendingEntityIds.has(acc.id)) {
      await database.accounts.put(acc);
      accountsCount++;
    }
  }

  // 3. Apply pulled transactions
  let transactionsCount = 0;
  const accountsToReconcile = new Set();

  for (const tx of txRes) {
    if (!pendingEntityIds.has(tx.id)) {
      await database.transactions.put(tx);
      transactionsCount++;
      if (tx.account_id) accountsToReconcile.add(tx.account_id);
      if (tx.destination_account_id) accountsToReconcile.add(tx.destination_account_id);
    }
  }

  // Reconcile account balances for affected accounts
  for (const accId of accountsToReconcile) {
    try {
      await reconcileAccountBalance(accId, database);
    } catch (e) {
      console.warn(`[CloudSync] Balance reconciliation warning during pull for ${accId}:`, e);
    }
  }

  // Update last sync timestamp in database
  await setLastSyncTimestamp(newSyncTimestamp, database);

  return {
    accountsCount,
    categoriesCount,
    transactionsCount,
    newSyncTimestamp
  };
}

/**
 * Performs a complete two-way synchronization cycle:
 * 1. Pushes pending offline mutations to Supabase.
 * 2. Pulls remote updates from Supabase.
 * 3. Evaluates and returns sync health status.
 *
 * @param {object} [params]
 * @param {object} [params.client]
 * @param {import('../db/db.js').ExpenseDatabase} [params.database=db]
 * @param {string} [params.userId]
 * @returns {Promise<object>} Complete sync outcome summary
 */
export async function syncWithCloud({
  client = null,
  database = db,
  userId = null
} = {}) {
  const sb = getSupabaseClient(client);
  if (!sb) {
    return {
      success: false,
      isOnline: false,
      status: 'offline',
      message: 'الخدمة السحابية غير متصلة.'
    };
  }

  const effectiveUserId = userId || (await getCurrentUser(sb))?.id;

  // 1. Push Phase
  const pushSummary = await pushPendingMutations({
    client: sb,
    database,
    userId: effectiveUserId
  });

  // 2. Pull Phase
  const pullSummary = await pullRemoteUpdates({
    client: sb,
    database,
    userId: effectiveUserId
  });

  // 3. Compute sync pill token
  const pillStatus = await computeSyncPillStatus({ database, isOnline: true });
  const lastSyncTimestamp = await getLastSyncTimestamp(database);

  return {
    success: true,
    pillStatus,
    lastSyncTimestamp,
    lastSyncTextArabic: formatLastSyncTimeArabic(lastSyncTimestamp),
    push: pushSummary,
    pull: pullSummary
  };
}
