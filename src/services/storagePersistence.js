/**
 * Storage Persistence Service (F020 / FR-23)
 * Manages browser persistent storage quota via navigator.storage.persist()
 * and provides quota estimates and safe error handling.
 *
 * Single Source of Truth: project-summary.md (Section 21: Local Storage Reliability & Persistent Storage API)
 */

/**
 * Format bytes into Arabic human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytesArabic(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 بايت';
  }

  const KILOBYTE = 1024;
  const MEGABYTE = 1024 * 1024;
  const GIGABYTE = 1024 * 1024 * 1024;

  if (bytes < KILOBYTE) {
    return `${Math.round(bytes)} بايت`;
  }
  if (bytes < MEGABYTE) {
    return `${(bytes / KILOBYTE).toFixed(1)} كيلوبايت`;
  }
  if (bytes < GIGABYTE) {
    return `${(bytes / MEGABYTE).toFixed(1)} ميجابايت`;
  }
  return `${(bytes / GIGABYTE).toFixed(1)} جيجابايت`;
}

/**
 * Checks if the Persistent Storage API is supported in current environment.
 * @returns {boolean}
 */
export function isStoragePersistenceSupported() {
  return typeof navigator !== 'undefined' &&
    Boolean(
      navigator.storage &&
      typeof navigator.storage.persist === 'function' &&
      typeof navigator.storage.persisted === 'function'
    );
}

/**
 * Checks if current storage is already marked as persistent (immune from automatic eviction).
 * @returns {Promise<boolean>}
 */
export async function isStoragePersisted() {
  if (!isStoragePersistenceSupported()) {
    return false;
  }
  try {
    return await navigator.storage.persisted();
  } catch (err) {
    console.warn('[StoragePersistence] Error checking persisted status:', err);
    return false;
  }
}

/**
 * Requests the browser to grant persistent storage to prevent automatic cache clearing.
 * @returns {Promise<boolean>} True if persistent storage granted, false otherwise.
 */
export async function requestStoragePersistence() {
  if (!isStoragePersistenceSupported()) {
    return false;
  }
  try {
    const isGranted = await navigator.storage.persist();
    if (isGranted) {
      console.info('[StoragePersistence] Persistent storage permission granted.');
    } else {
      console.info('[StoragePersistence] Persistent storage permission denied or deferred by browser.');
    }
    return Boolean(isGranted);
  } catch (err) {
    console.warn('[StoragePersistence] Error requesting persistence:', err);
    return false;
  }
}

/**
 * Obtains storage quota and usage estimates.
 * @returns {Promise<{
 *   quota: number,
 *   usage: number,
 *   percentage: number,
 *   formattedQuota: string,
 *   formattedUsage: string
 * } | null>}
 */
export async function getStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = typeof estimate.quota === 'number' ? estimate.quota : 0;
    const usage = typeof estimate.usage === 'number' ? estimate.usage : 0;
    const percentage = quota > 0 ? Math.min(100, Math.max(0, Math.round((usage / quota) * 100))) : 0;

    return {
      quota,
      usage,
      percentage,
      formattedQuota: formatBytesArabic(quota),
      formattedUsage: formatBytesArabic(usage),
    };
  } catch (err) {
    console.warn('[StoragePersistence] Error getting storage estimate:', err);
    return null;
  }
}

/**
 * Automatically initializes persistent storage on application startup.
 * Non-blocking, fails gracefully.
 * @returns {Promise<{ persisted: boolean, requested: boolean }>}
 */
export async function initStoragePersistence() {
  if (!isStoragePersistenceSupported()) {
    return { persisted: false, requested: false };
  }

  try {
    const alreadyPersisted = await isStoragePersisted();
    if (alreadyPersisted) {
      return { persisted: true, requested: false };
    }

    const granted = await requestStoragePersistence();
    return { persisted: granted, requested: true };
  } catch (err) {
    console.warn('[StoragePersistence] Initialization error:', err);
    return { persisted: false, requested: false };
  }
}

/**
 * Determines whether an error corresponds to browser storage exhaustion (QuotaExceededError).
 * @param {any} error
 * @returns {boolean}
 */
export function isQuotaExceededError(error) {
  if (!error) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}

/**
 * Returns user-friendly Arabic guidance message when quota is exhausted.
 * @returns {string}
 */
export function getQuotaExceededMessage() {
  return 'نفدت مساحة التخزين المتاحة في المتصفح. لحماية سجلاتك المالية، احرص على تصدير نسخة احتياطية بصيغة JSON فوراً.';
}
