/**
 * Service Worker Client Manager (F020)
 * Handles registration, updates, and lifecycle coordination for offline PWA support.
 */

/**
 * Checks whether Service Workers are supported in the current browser runtime.
 * @returns {boolean}
 */
export function isServiceWorkerSupported() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator && 'serviceWorker' in navigator && navigator.serviceWorker)
  );
}

/**
 * Registers the Service Worker for offline App Shell caching.
 * @param {Object} [options]
 * @param {string} [options.swUrl='/sw.js']
 * @param {string} [options.scope='/']
 * @param {Function} [options.onUpdate]
 * @param {Function} [options.onSuccess]
 * @returns {Promise<{ success: boolean, registration?: ServiceWorkerRegistration, reason?: string, error?: Error }>}
 */
export async function registerServiceWorker(options = {}) {
  const {
    swUrl = '/sw.js',
    scope = '/',
    onUpdate,
    onSuccess,
  } = options;

  if (!isServiceWorkerSupported()) {
    return { success: false, reason: 'unsupported' };
  }

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope });

    // Handle updates when a new service worker version is detected
    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content is available; please refresh.
            console.info('[PWA] New application version is available.');
            if (typeof onUpdate === 'function') {
              onUpdate(registration);
            }
          } else {
            // Content is cached for offline use.
            console.info('[PWA] Content is cached for offline use.');
            if (typeof onSuccess === 'function') {
              onSuccess(registration);
            }
          }
        }
      };
    };

    return { success: true, registration };
  } catch (error) {
    console.warn('[PWA] Service Worker registration failed:', error);
    return { success: false, error };
  }
}

/**
 * Unregisters all active Service Worker registrations.
 * @returns {Promise<boolean>}
 */
export async function unregisterServiceWorker() {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.all(
      registrations.map((reg) => reg.unregister())
    );
    return results.every(Boolean);
  } catch (err) {
    console.warn('[PWA] Failed to unregister service workers:', err);
    return false;
  }
}

/**
 * Retrieves the current Service Worker registration if active.
 * @param {string} [scope='/']
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
export async function getServiceWorkerRegistration(scope = '/') {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(scope);
    return registration || null;
  } catch (err) {
    console.warn('[PWA] Error getting registration:', err);
    return null;
  }
}
