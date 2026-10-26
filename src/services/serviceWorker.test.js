import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isServiceWorkerSupported,
  registerServiceWorker,
  unregisterServiceWorker,
  getServiceWorkerRegistration
} from './serviceWorker.js';

describe('Service Worker Client Manager (F020)', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('1. isServiceWorkerSupported', () => {
    it('returns true when navigator.serviceWorker exists', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {},
        },
        configurable: true,
        writable: true,
      });

      expect(isServiceWorkerSupported()).toBe(true);
    });

    it('returns false when navigator.serviceWorker is undefined', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      expect(isServiceWorkerSupported()).toBe(false);
    });
  });

  describe('2. registerServiceWorker', () => {
    it('returns unsupported status if serviceWorker is absent', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      const res = await registerServiceWorker();
      expect(res).toEqual({ success: false, reason: 'unsupported' });
    });

    it('registers with default parameters (/sw.js, scope: /)', async () => {
      const mockRegister = vi.fn().mockResolvedValue({
        scope: '/',
        installing: null,
      });

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: mockRegister,
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await registerServiceWorker();
      expect(res.success).toBe(true);
      expect(mockRegister).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    it('registers with custom swUrl and scope', async () => {
      const mockRegister = vi.fn().mockResolvedValue({
        scope: '/app/',
        installing: null,
      });

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: mockRegister,
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await registerServiceWorker({ swUrl: '/custom-sw.js', scope: '/app/' });
      expect(res.success).toBe(true);
      expect(mockRegister).toHaveBeenCalledWith('/custom-sw.js', { scope: '/app/' });
    });

    it('triggers onUpdate callback when new worker installs with existing controller', async () => {
      const onUpdate = vi.fn();
      let capturedOnUpdateFound = null;

      const mockWorker = {
        state: 'installing',
        onstatechange: null,
      };

      const mockRegistration = {
        scope: '/',
        get installing() {
          return mockWorker;
        },
        set onupdatefound(fn) {
          capturedOnUpdateFound = fn;
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: vi.fn().mockResolvedValue(mockRegistration),
            controller: { state: 'activated' }, // existing controller
          },
        },
        configurable: true,
        writable: true,
      });

      await registerServiceWorker({ onUpdate });

      expect(capturedOnUpdateFound).toBeTypeOf('function');
      capturedOnUpdateFound();

      // Transition to installed
      mockWorker.state = 'installed';
      mockWorker.onstatechange();

      expect(onUpdate).toHaveBeenCalledWith(mockRegistration);
    });

    it('triggers onSuccess callback on first install (no controller)', async () => {
      const onSuccess = vi.fn();
      let capturedOnUpdateFound = null;

      const mockWorker = {
        state: 'installing',
        onstatechange: null,
      };

      const mockRegistration = {
        scope: '/',
        get installing() {
          return mockWorker;
        },
        set onupdatefound(fn) {
          capturedOnUpdateFound = fn;
        },
      };

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: vi.fn().mockResolvedValue(mockRegistration),
            controller: null, // first install
          },
        },
        configurable: true,
        writable: true,
      });

      await registerServiceWorker({ onSuccess });

      expect(capturedOnUpdateFound).toBeTypeOf('function');
      capturedOnUpdateFound();

      // Transition to installed
      mockWorker.state = 'installed';
      mockWorker.onstatechange();

      expect(onSuccess).toHaveBeenCalledWith(mockRegistration);
    });

    it('handles registration failure gracefully', async () => {
      const error = new Error('Script evaluation failed');
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            register: vi.fn().mockRejectedValue(error),
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await registerServiceWorker();
      expect(res.success).toBe(false);
      expect(res.error).toBe(error);
    });
  });

  describe('3. unregisterServiceWorker', () => {
    it('unregisters all registrations and returns true', async () => {
      const unreg1 = vi.fn().mockResolvedValue(true);
      const unreg2 = vi.fn().mockResolvedValue(true);

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistrations: vi.fn().mockResolvedValue([
              { unregister: unreg1 },
              { unregister: unreg2 },
            ]),
          },
        },
        configurable: true,
        writable: true,
      });

      const result = await unregisterServiceWorker();
      expect(result).toBe(true);
      expect(unreg1).toHaveBeenCalled();
      expect(unreg2).toHaveBeenCalled();
    });

    it('returns false when unsupported or when unregistration fails', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await unregisterServiceWorker()).toBe(false);

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistrations: vi.fn().mockRejectedValue(new Error('Security error')),
          },
        },
        configurable: true,
        writable: true,
      });
      expect(await unregisterServiceWorker()).toBe(false);
    });
  });

  describe('4. getServiceWorkerRegistration', () => {
    it('returns active registration for given scope', async () => {
      const mockReg = { scope: '/test/' };
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(mockReg),
          },
        },
        configurable: true,
        writable: true,
      });

      const reg = await getServiceWorkerRegistration('/test/');
      expect(reg).toBe(mockReg);
    });

    it('returns null when unsupported or not registered', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });
      expect(await getServiceWorkerRegistration()).toBeNull();

      Object.defineProperty(globalThis, 'navigator', {
        value: {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(undefined),
          },
        },
        configurable: true,
        writable: true,
      });
      expect(await getServiceWorkerRegistration()).toBeNull();
    });
  });
});
