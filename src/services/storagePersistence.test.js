import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatBytesArabic,
  isStoragePersistenceSupported,
  isStoragePersisted,
  requestStoragePersistence,
  getStorageEstimate,
  initStoragePersistence,
  isQuotaExceededError,
  getQuotaExceededMessage
} from './storagePersistence.js';

describe('Storage Persistence Service (F020 / FR-23)', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('1. formatBytesArabic', () => {
    it('returns "0 بايت" for invalid, non-number, or negative values', () => {
      expect(formatBytesArabic(0)).toBe('0 بايت');
      expect(formatBytesArabic(-100)).toBe('0 بايت');
      expect(formatBytesArabic(null)).toBe('0 بايت');
      expect(formatBytesArabic(undefined)).toBe('0 بايت');
      expect(formatBytesArabic('abc')).toBe('0 بايت');
      expect(formatBytesArabic(NaN)).toBe('0 بايت');
      expect(formatBytesArabic(Infinity)).toBe('0 بايت');
    });

    it('formats bytes under 1 KB correctly', () => {
      expect(formatBytesArabic(500)).toBe('500 بايت');
      expect(formatBytesArabic(1023)).toBe('1023 بايت');
    });

    it('formats kilobytes correctly', () => {
      expect(formatBytesArabic(1024)).toBe('1.0 كيلوبايت');
      expect(formatBytesArabic(1536)).toBe('1.5 كيلوبايت');
      expect(formatBytesArabic(500 * 1024)).toBe('500.0 كيلوبايت');
    });

    it('formats megabytes correctly', () => {
      expect(formatBytesArabic(1024 * 1024)).toBe('1.0 ميجابايت');
      expect(formatBytesArabic(2.5 * 1024 * 1024)).toBe('2.5 ميجابايت');
      expect(formatBytesArabic(750 * 1024 * 1024)).toBe('750.0 ميجابايت');
    });

    it('formats gigabytes correctly', () => {
      expect(formatBytesArabic(1024 * 1024 * 1024)).toBe('1.0 جيجابايت');
      expect(formatBytesArabic(50.4 * 1024 * 1024 * 1024)).toBe('50.4 جيجابايت');
    });
  });

  describe('2. isStoragePersistenceSupported', () => {
    it('returns true when navigator.storage has persist and persisted functions', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn(),
            persisted: vi.fn(),
          },
        },
        configurable: true,
        writable: true,
      });

      expect(isStoragePersistenceSupported()).toBe(true);
    });

    it('returns false when navigator.storage is undefined or missing functions', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(isStoragePersistenceSupported()).toBe(false);

      Object.defineProperty(globalThis, 'navigator', {
        value: { storage: {} },
        configurable: true,
        writable: true,
      });
      expect(isStoragePersistenceSupported()).toBe(false);
    });
  });

  describe('3. isStoragePersisted', () => {
    it('returns true when navigator.storage.persisted resolves to true', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn(),
            persisted: vi.fn().mockResolvedValue(true),
          },
        },
        configurable: true,
        writable: true,
      });

      const persisted = await isStoragePersisted();
      expect(persisted).toBe(true);
    });

    it('returns false when navigator.storage.persisted resolves to false', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn(),
            persisted: vi.fn().mockResolvedValue(false),
          },
        },
        configurable: true,
        writable: true,
      });

      const persisted = await isStoragePersisted();
      expect(persisted).toBe(false);
    });

    it('returns false gracefully when navigator.storage.persisted rejects', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn(),
            persisted: vi.fn().mockRejectedValue(new Error('Permission denied')),
          },
        },
        configurable: true,
        writable: true,
      });

      const persisted = await isStoragePersisted();
      expect(persisted).toBe(false);
    });

    it('returns false when unsupported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await isStoragePersisted()).toBe(false);
    });
  });

  describe('4. requestStoragePersistence', () => {
    it('returns true when persistent storage is granted by browser', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn().mockResolvedValue(true),
            persisted: vi.fn(),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await requestStoragePersistence();
      expect(result).toBe(true);
    });

    it('returns false when persistent storage is rejected by browser', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn().mockResolvedValue(false),
            persisted: vi.fn(),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await requestStoragePersistence();
      expect(result).toBe(false);
    });

    it('returns false gracefully when persist rejects', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn().mockRejectedValue(new Error('DOMException')),
            persisted: vi.fn(),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await requestStoragePersistence();
      expect(result).toBe(false);
    });

    it('returns false when unsupported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await requestStoragePersistence()).toBe(false);
    });
  });

  describe('5. getStorageEstimate', () => {
    it('returns estimated quota, usage, and formatted text', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            estimate: vi.fn().mockResolvedValue({
              quota: 10 * 1024 * 1024 * 1024, // 10 GB
              usage: 2.5 * 1024 * 1024 * 1024, // 2.5 GB
            }),
          },
        },
        configurable: true,
        writable: true,
      });

      const estimate = await getStorageEstimate();
      expect(estimate).not.toBeNull();
      expect(estimate.percentage).toBe(25);
      expect(estimate.formattedQuota).toBe('10.0 جيجابايت');
      expect(estimate.formattedUsage).toBe('2.5 جيجابايت');
    });

    it('clamps percentage between 0 and 100', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            estimate: vi.fn().mockResolvedValue({
              quota: 1000,
              usage: 2000,
            }),
          },
        },
        configurable: true,
        writable: true,
      });

      const estimate = await getStorageEstimate();
      expect(estimate.percentage).toBe(100);
    });

    it('handles zero quota without divide-by-zero errors', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            estimate: vi.fn().mockResolvedValue({
              quota: 0,
              usage: 0,
            }),
          },
        },
        configurable: true,
        writable: true,
      });

      const estimate = await getStorageEstimate();
      expect(estimate.percentage).toBe(0);
      expect(estimate.formattedQuota).toBe('0 بايت');
      expect(estimate.formattedUsage).toBe('0 بايت');
    });

    it('returns null when estimate throws or is not supported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            estimate: vi.fn().mockRejectedValue(new Error('Quota estimate error')),
          },
        },
        configurable: true,
        writable: true,
      });

      expect(await getStorageEstimate()).toBeNull();

      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await getStorageEstimate()).toBeNull();
    });
  });

  describe('6. initStoragePersistence', () => {
    it('returns { persisted: true, requested: false } if already persisted', async () => {
      const persistSpy = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: persistSpy,
            persisted: vi.fn().mockResolvedValue(true),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await initStoragePersistence();
      expect(result).toEqual({ persisted: true, requested: false });
      expect(persistSpy).not.toHaveBeenCalled();
    });

    it('requests persistence if not persisted and returns granted status', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: {
            persist: vi.fn().mockResolvedValue(true),
            persisted: vi.fn().mockResolvedValue(false),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await initStoragePersistence();
      expect(result).toEqual({ persisted: true, requested: true });
    });

    it('returns { persisted: false, requested: false } when unsupported', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      const result = await initStoragePersistence();
      expect(result).toEqual({ persisted: false, requested: false });
    });
  });

  describe('7. Quota Error Detection & Guidance', () => {
    it('detects QuotaExceededError by name and DOMException codes', () => {
      expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
      expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
      expect(isQuotaExceededError({ code: 22 })).toBe(true);
      expect(isQuotaExceededError({ code: 1014 })).toBe(true);
      expect(isQuotaExceededError(new Error('Generic failure'))).toBe(false);
      expect(isQuotaExceededError(null)).toBe(false);
      expect(isQuotaExceededError(undefined)).toBe(false);
    });

    it('provides clear Arabic guidance message upon quota exhaustion', () => {
      const msg = getQuotaExceededMessage();
      expect(msg).toContain('نفدت مساحة التخزين');
      expect(msg).toContain('JSON');
    });
  });
});
