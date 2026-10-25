import { describe, it, expect } from 'vitest';
import { NAV_HUBS, MOBILE_BOTTOM_TABS } from './navigationConfig';
import * as Icons from '../common/Icons';

describe('F008: Arabic-First & RTL Design System Layout Shell', () => {
  describe('1. Navigation Hubs & Architecture Specification', () => {
    it('defines exactly 6 primary hubs matching design-system/navigation.md', () => {
      expect(NAV_HUBS).toHaveLength(6);
      const hubIds = NAV_HUBS.map((h) => h.id);
      expect(hubIds).toEqual([
        'dashboard',
        'transactions',
        'accounts',
        'reports',
        'categories',
        'settings',
      ]);
    });

    it('provides authentic Arabic labels and short labels for every hub', () => {
      NAV_HUBS.forEach((hub) => {
        expect(hub.label).toBeTruthy();
        expect(typeof hub.label).toBe('string');
        expect(hub.shortLabel).toBeTruthy();
        expect(typeof hub.shortLabel).toBe('string');
      });

      expect(NAV_HUBS.find((h) => h.id === 'dashboard').label).toBe('الرئيسية');
      expect(NAV_HUBS.find((h) => h.id === 'transactions').label).toBe('المعاملات');
      expect(NAV_HUBS.find((h) => h.id === 'accounts').label).toBe('المحافظ والحسابات');
      expect(NAV_HUBS.find((h) => h.id === 'reports').label).toBe('التقارير والتحليلات');
      expect(NAV_HUBS.find((h) => h.id === 'categories').label).toBe('التصنيفات');
      expect(NAV_HUBS.find((h) => h.id === 'settings').label).toBe('الإعدادات والبيانات');
    });

    it('filters exactly 4 tabs for mobile bottom navigation (excluding categories and settings)', () => {
      expect(MOBILE_BOTTOM_TABS).toHaveLength(4);
      const mobileIds = MOBILE_BOTTOM_TABS.map((t) => t.id);
      expect(mobileIds).toEqual(['dashboard', 'transactions', 'accounts', 'reports']);

      const categories = NAV_HUBS.find((h) => h.id === 'categories');
      const settings = NAV_HUBS.find((h) => h.id === 'settings');
      expect(categories.inMobileBottomNav).toBe(false);
      expect(settings.inMobileBottomNav).toBe(false);
    });

    it('maps every hub to an existing, valid icon component', () => {
      NAV_HUBS.forEach((hub) => {
        expect(Icons[hub.iconName]).toBeDefined();
        expect(typeof Icons[hub.iconName]).toBe('function');
      });
    });
  });

  describe('2. Design System Icons Integrity (Single Stroke & Vector Quality)', () => {
    it('exports all necessary core icons for the layout shell', () => {
      const requiredIcons = [
        'LogoIcon',
        'DashboardIcon',
        'TransactionsIcon',
        'AccountsIcon',
        'ReportsIcon',
        'CategoriesIcon',
        'SettingsIcon',
        'PlusIcon',
        'SearchIcon',
        'SunIcon',
        'MoonIcon',
        'CloudCheckIcon',
        'CloudSyncIcon',
        'CloudAlertIcon',
        'CloudOfflineIcon',
        'CloseIcon',
        'ChevronLeftIcon',
        'ChevronRightIcon',
      ];

      requiredIcons.forEach((iconName) => {
        expect(Icons[iconName]).toBeDefined();
        expect(typeof Icons[iconName]).toBe('function');
      });
    });

    it('renders valid SVG elements with cohesive stroke and RTL-aware props', () => {
      const element = Icons.LogoIcon({ size: 24 });
      expect(element.type).toBe('svg');
      expect(element.props.width).toBe(24);
      expect(element.props.height).toBe(24);
      expect(element.props.strokeWidth).toBe('1.75');
      expect(element.props['aria-hidden']).toBe('true');
    });
  });

  describe('3. Design Tokens & Styling Invariants', () => {
    it('verifies token naming convention and CSS file structure', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const tokensPath = path.resolve(dir, '../../styles/tokens.css');
      const tokensContent = fs.readFileSync(tokensPath, 'utf8');

      // Surface & theme colors
      expect(tokensContent).toContain('--color-bg-app: #F8FAFC;');
      expect(tokensContent).toContain('--color-bg-surface: #FFFFFF;');
      expect(tokensContent).toContain('[data-theme="dark"]');
      expect(tokensContent).toContain('--color-bg-app: #0B0F19;');

      // Financial semantic colors
      expect(tokensContent).toContain('--color-income: #059669;');
      expect(tokensContent).toContain('--color-expense: #E11D48;');
      expect(tokensContent).toContain('--color-transfer: #6366F1;');
      expect(tokensContent).toContain('--color-liability: #D97706;');

      // Sync state tokens
      expect(tokensContent).toContain('--color-sync-synced: #10B981;');
      expect(tokensContent).toContain('--color-sync-pending: #F59E0B;');
      expect(tokensContent).toContain('--color-sync-syncing: #3B82F6;');
      expect(tokensContent).toContain('--color-sync-failed: #EF4444;');
      expect(tokensContent).toContain('--color-sync-offline: #64748B;');

      // RTL layout dimensions
      expect(tokensContent).toContain('--sidebar-width: 260px;');
      expect(tokensContent).toContain('--header-height: 64px;');
      expect(tokensContent).toContain('--bottom-nav-height: 64px;');

      // Typography & Tabular numbers
      expect(tokensContent).toContain('font-variant-numeric: tabular-nums;');
      expect(tokensContent).toContain('direction: ltr;');
      expect(tokensContent).toContain('unicode-bidi: isolate;');
    });

    it('verifies AppShell CSS responsive rules and RTL orientation', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const shellPath = path.resolve(dir, '../../styles/AppShell.css');
      const shellContent = fs.readFileSync(shellPath, 'utf8');

      expect(shellContent).toContain('direction: rtl;');
      expect(shellContent).toContain('right: 0;');
      expect(shellContent).toContain('margin-right: var(--sidebar-width);');
      expect(shellContent).toContain('@media (max-width: 767px)');
      expect(shellContent).toContain('scale(0.96)');
    });

    it('verifies anti-FOUC inline script in index.html prevents dark mode refresh flash', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const htmlPath = path.resolve(dir, '../../../index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      // Must not have hardcoded light theme attribute on <html> element
      expect(htmlContent).not.toContain('<html lang="ar" dir="rtl" data-theme="light">');
      expect(htmlContent).toContain('<html lang="ar" dir="rtl">');

      // Must have synchronous theme resolver before DOM renders
      expect(htmlContent).toContain('expense_tracker_theme');
      expect(htmlContent).toContain('document.documentElement.setAttribute(\'data-theme\', theme)');
    });
  });
});
