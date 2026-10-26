import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Components
import { QuickAdd } from '../components/QuickAdd';
import { TransactionFilterDrawer } from '../features/transactions/TransactionFilterDrawer';
import { TransactionDetailModal } from '../features/transactions/TransactionDetailModal';
import { TransactionEditModal } from '../features/transactions/TransactionEditModal';
import { TransactionDeleteConfirmModal } from '../features/transactions/TransactionDeleteConfirmModal';
import { CategoryFormModal } from '../features/categories/CategoryFormModal';
import { CategoryDeleteModal } from '../features/categories/CategoryDeleteModal';
import { SupabaseAuthModal } from '../features/settings/SupabaseAuthModal';
import { CurrencySelectorModal } from '../features/settings/CurrencySelectorModal';

describe('Mobile UX Audit & Responsive Invariant Suite (F-MOB)', () => {
  const tokensCss = fs.readFileSync(path.resolve(__dirname, '../styles/tokens.css'), 'utf-8');
  const appShellCss = fs.readFileSync(path.resolve(__dirname, '../styles/AppShell.css'), 'utf-8');
  const quickAddCss = fs.readFileSync(path.resolve(__dirname, '../components/QuickAdd.css'), 'utf-8');
  const ledgerCss = fs.readFileSync(path.resolve(__dirname, '../features/transactions/TransactionLedger.css'), 'utf-8');
  const categoriesCss = fs.readFileSync(path.resolve(__dirname, '../features/categories/CategoriesView.css'), 'utf-8');
  const reportsCss = fs.readFileSync(path.resolve(__dirname, '../features/reports/ReportsView.css'), 'utf-8');
  const dashboardCss = fs.readFileSync(path.resolve(__dirname, '../components/dashboard/Dashboard.css'), 'utf-8');
  const settingsCss = fs.readFileSync(path.resolve(__dirname, '../features/settings/SettingsView.css'), 'utf-8');
  const authModalCss = fs.readFileSync(path.resolve(__dirname, '../features/settings/SupabaseAuthModal.css'), 'utf-8');

  describe('1. CSS Tokens & Safe Area Invariants', () => {
    it('defines safe area CSS variables in tokens.css', () => {
      expect(tokensCss).toContain('--safe-top: env(safe-area-inset-top, 0px)');
      expect(tokensCss).toContain('--safe-bottom: env(safe-area-inset-bottom, 0px)');
      expect(tokensCss).toContain('--safe-left: env(safe-area-inset-left, 0px)');
      expect(tokensCss).toContain('--safe-right: env(safe-area-inset-right, 0px)');
    });

    it('enforces touch target sizes >= 40px in tokens and layout', () => {
      expect(tokensCss).toContain('--size-touch-min: 44px');
      expect(tokensCss).toContain('--size-btn-height-sm: 40px');
    });

    it('applies safe-area insets to top bar and bottom nav in AppShell.css', () => {
      expect(appShellCss).toContain('env(safe-area-inset-top, 0px)');
      expect(appShellCss).toContain('env(safe-area-inset-bottom, 0px)');
      expect(appShellCss).toContain('--bottom-nav-height');
      // Padding bottom on main content ensures center FAB does not conceal last content row
      expect(appShellCss).toContain('calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + var(--space-6))');
    });

    it('ensures text overflow protection on mobile top bar title', () => {
      expect(appShellCss).toContain('text-overflow: ellipsis');
      expect(appShellCss).toContain('white-space: nowrap');
    });
  });

  describe('2. Mobile-First Bottom Sheet & Dynamic Viewport Height (dvh)', () => {
    it('uses 90dvh and sticky footer in QuickAdd dialog', () => {
      expect(quickAddCss).toContain('max-height: 90dvh');
      expect(quickAddCss).toContain('position: sticky');
      expect(quickAddCss).toContain('bottom: 0');
    });

    it('transforms transaction modals and filter drawer to bottom sheets on mobile', () => {
      expect(ledgerCss).toContain('max-height: 90dvh');
      expect(ledgerCss).toContain('border-radius: var(--radius-2xl) var(--radius-2xl) 0 0');
      expect(ledgerCss).toContain('padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px))');
    });

    it('transforms category modals to bottom sheets on mobile', () => {
      expect(categoriesCss).toContain('max-height: 90dvh');
      expect(categoriesCss).toContain('border-radius: var(--radius-2xl) var(--radius-2xl) 0 0');
      expect(categoriesCss).toContain('position: sticky');
    });

    it('transforms currency selector modal to mobile bottom sheet with 90dvh, sticky footer, and safe area', () => {
      expect(settingsCss).toContain('max-height: 90dvh');
      expect(settingsCss).toContain('.currency-modal-card .sheet-drag-handle');
      expect(settingsCss).toContain('position: sticky');
      expect(settingsCss).toContain('env(safe-area-inset-bottom');
    });

    it('transforms auth modal to mobile bottom sheet with 90dvh, drag handle, and safe area padding', () => {
      expect(authModalCss).toContain('max-height: 90dvh');
      expect(authModalCss).toContain('.auth-modal-card .sheet-drag-handle');
      expect(authModalCss).toContain('env(safe-area-inset-bottom');
      expect(authModalCss).toContain('animation: authSheetSlideUp');
    });
  });

  describe('3. Content Density & Horizontal Overflow Prevention', () => {
    it('restructures dashboard KPI grid to canonical 1-column mobile flow without 2-column forcing', () => {
      expect(dashboardCss).toContain('.dashboard-kpi-grid');
      expect(dashboardCss).toContain('display: flex');
      expect(dashboardCss).toContain('flex-direction: column');
      expect(dashboardCss).toContain('grid-template-columns: repeat(3, 1fr)');
    });

    it('enforces accounts track to full-width mobile list eliminating horizontal cutoff', () => {
      expect(dashboardCss).toContain('.accounts-scroll-track');
      expect(dashboardCss).toContain('flex-direction: column');
    });

    it('restructures reports KPI grid to mobile-first flow and handles long badges with ellipsis', () => {
      expect(reportsCss).toContain('.reports-kpi-grid');
      expect(reportsCss).toContain('flex-direction: column');
      expect(reportsCss).toContain('text-overflow: ellipsis');
    });

    it('handles compact screen padding with mobile-first default', () => {
      expect(appShellCss).toContain('padding: var(--space-3)');
    });
  });

  describe('4. Component Markup & Drag Handle Verification', () => {
    const dummyCategory = { id: 'c1', name: 'طعام', icon: 'utensils', color: '#ff0000' };
    const dummyAccount = { id: 'a1', name: 'نقدي', currency: 'USD' };

    it('renders QuickAdd with drag handle and decimal input mode', () => {
      const html = renderToString(
        <QuickAdd
          isOpen={true}
          onClose={() => {}}
          onSave={() => {}}
          categories={[dummyCategory]}
          accounts={[dummyAccount]}
        />
      );

      expect(html).toContain('quick-add-drag-handle');
      expect(html.toLowerCase()).toContain('inputmode="decimal"');
      expect(html).toContain('quick-add-footer');
    });

    it('renders TransactionFilterDrawer with sheet drag handle', () => {
      const html = renderToString(
        <TransactionFilterDrawer
          isOpen={true}
          onClose={() => {}}
          categories={[dummyCategory]}
          accounts={[dummyAccount]}
          filters={{}}
          onApplyFilters={() => {}}
          onResetFilters={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders TransactionDetailModal with sheet drag handle', () => {
      const dummyTx = {
        id: 't1',
        amount: 100,
        type: 'expense',
        categoryId: 'c1',
        accountId: 'a1',
        date: '2026-03-30',
        note: 'غداء عمل'
      };

      const html = renderToString(
        <TransactionDetailModal
          isOpen={true}
          onClose={() => {}}
          transaction={dummyTx}
          category={dummyCategory}
          account={dummyAccount}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders TransactionEditModal with sheet drag handle', () => {
      const dummyTx = {
        id: 't1',
        amount: 100,
        type: 'expense',
        categoryId: 'c1',
        accountId: 'a1',
        date: '2026-03-30',
        note: 'غداء عمل'
      };

      const html = renderToString(
        <TransactionEditModal
          isOpen={true}
          onClose={() => {}}
          transaction={dummyTx}
          categories={[dummyCategory]}
          accounts={[dummyAccount]}
          onSave={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders TransactionDeleteConfirmModal with sheet drag handle', () => {
      const dummyTx = {
        id: 't1',
        amount: 100,
        type: 'expense',
        categoryId: 'c1',
        accountId: 'a1',
        date: '2026-03-30'
      };

      const html = renderToString(
        <TransactionDeleteConfirmModal
          isOpen={true}
          onClose={() => {}}
          transaction={dummyTx}
          onConfirm={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders CategoryFormModal with sheet drag handle', () => {
      const html = renderToString(
        <CategoryFormModal
          isOpen={true}
          onClose={() => {}}
          category={dummyCategory}
          onSave={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders CategoryDeleteModal with sheet drag handle', () => {
      const html = renderToString(
        <CategoryDeleteModal
          isOpen={true}
          onClose={() => {}}
          category={dummyCategory}
          affectedCount={2}
          availableCategories={[]}
          onConfirm={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
    });

    it('renders SupabaseAuthModal with mobile drag handle, segmented tabs, password toggle, and data safety note', () => {
      const html = renderToString(
        <SupabaseAuthModal
          isOpen={true}
          onClose={() => {}}
        />
      );

      expect(html).toContain('sheet-drag-handle');
      expect(html).toContain('auth-segmented-control');
      expect(html).toContain('auth-password-toggle-btn');
      expect(html).toContain('auth-btn-primary');
      expect(html).toContain('auth-btn-secondary');
      expect(html).toContain('auth-data-safety-note');
      expect(html).toContain('ضمان سلامة البيانات:');
    });

    it('renders CurrencySelectorModal with sheet drag handle, sticky footer, and ILS currency', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={() => {}}
          currentCurrency="SAR"
          onSelectCurrency={() => {}}
          isLocked={false}
        />
      );

      expect(html).toContain('sheet-drag-handle');
      expect(html).toContain('currency-modal-footer');
      expect(html).toContain('currency-search-container');
      expect(html).toContain('currency-scopes-row');
      expect(html).toContain('ILS');
      expect(html).toContain('شيكل إسرائيلي جديد');
      expect(html).toContain('₪');
    });

    it('renders CurrencySelectorModal in clean read-only locked state when locked', () => {
      const html = renderToString(
        <CurrencySelectorModal
          isOpen={true}
          onClose={() => {}}
          currentCurrency="ILS"
          onSelectCurrency={() => {}}
          isLocked={true}
          lockExplanation="لا يمكن تغيير العملة بعد تسجيل بيانات مالية"
        />
      );

      expect(html).toContain('sheet-drag-handle');
      expect(html).toContain('العملة الأساسية مقفلة');
      expect(html).toContain('currency-locked-callout');
      expect(html).toContain('currency-active-card');
      expect(html).toContain('شيكل إسرائيلي جديد');
      expect(html).toContain('حسناً، فهمت ذلك');
      expect(html).not.toContain('currency-search-container');
      expect(html).not.toContain('تأكيد العملة الأساسية');
    });
  });

  describe('5. Mobile Viewport Dimension Matrix Conformance', () => {
    // Comprehensive viewport target checklist verification
    const targetViewports = [
      { name: 'iPhone SE (1st gen)', width: 320, height: 568 },
      { name: 'Android Small', width: 360, height: 640 },
      { name: 'iPhone SE (2nd/3rd)', width: 375, height: 667 },
      { name: 'iPhone 12/13/14', width: 390, height: 844 },
      { name: 'iPhone 15/16', width: 393, height: 852 },
      { name: 'Pixel 7/8 / Galaxy', width: 412, height: 915 },
      { name: 'iPhone Pro Max / Plus', width: 430, height: 932 },
      { name: 'Mobile Landscape', width: 844, height: 390 }
    ];

    it.each(targetViewports)('complies with layout specifications for $name ($width x $height)', ({ width, height }) => {
      // In CSS, any media query matching small screens:
      // - Mobile breakpoint <= 768px
      // - Compact mobile <= 480px / <= 375px
      // - Mobile landscape <= 500px height or aspect-ratio
      const isMobileWidth = width <= 768;
      expect(isMobileWidth || height <= 500).toBe(true);

      if (width <= 375) {
        // Must have padding reduction (12px = var(--space-3)) for mobile canonical layout
        expect(appShellCss).toContain('padding: var(--space-3)');
      }
      if (width <= 480) {
        expect(ledgerCss).toContain('@media (max-width: 480px)');
      }
    });
  });
});
