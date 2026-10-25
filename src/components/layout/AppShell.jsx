import { useState, useEffect, useCallback } from 'react';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopHeader } from './DesktopHeader';
import { MobileTopBar } from './MobileTopBar';
import { MobileBottomNav } from './MobileBottomNav';
import { QuickAdd } from '../QuickAdd';
import {
  DashboardView,
  TransactionsView,
  AccountsView,
  ReportsView,
  CategoriesView,
  SettingsView,
} from './HubViews';
import { NAV_HUBS } from './navigationConfig';

const THEME_STORAGE_KEY = 'expense_tracker_theme';

/**
 * AppShell — Top-Level Layout Shell
 * Arabic-First, RTL Direction, Responsive Navigation & Theme Engine
 * Ref: design-system/navigation.md & visual-direction.md
 */
export function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedText, setLastSyncedText] = useState('الآن');

  // Initialize theme from documentElement attribute (set synchronously by anti-FOUC script), localStorage, or system preference
  const [theme, setTheme] = useState(() => {
    try {
      if (typeof document !== 'undefined') {
        const current = document.documentElement.getAttribute('data-theme');
        if (current === 'dark' || current === 'light') return current;
      }
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // Fallback in environments without localStorage
    }
    return 'light';
  });

  // Apply theme to document element and meta theme-color
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0B0F19' : '#0F172A');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  // Ensure RTL direction on root
  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleOpenQuickAdd = useCallback(() => {
    setIsQuickAddOpen(true);
  }, []);

  const handleCloseQuickAdd = useCallback(() => {
    setIsQuickAddOpen(false);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setActiveTab('transactions');
  }, []);

  const handleTriggerManualSync = useCallback(() => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus('synced');
      setPendingCount(0);
      setLastSyncedText('الآن');
    }, 1200);
  }, []);

  // Global Keyboard Shortcuts (N for Quick Add, Ctrl+K or / for Search)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input or textarea
      const targetTag = e.target.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
        return;
      }

      // 'N' opens Quick Add
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsQuickAddOpen(true);
      }

      // 'Ctrl+K' or '/' opens Search
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || e.key === '/') {
        e.preventDefault();
        setActiveTab('transactions');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Active view router
  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onOpenQuickAdd={handleOpenQuickAdd} />;
      case 'transactions':
        return <TransactionsView />;
      case 'accounts':
        return <AccountsView />;
      case 'reports':
        return <ReportsView />;
      case 'categories':
        return <CategoriesView />;
      case 'settings':
        return <SettingsView theme={theme} onToggleTheme={handleToggleTheme} />;
      default:
        return <DashboardView onOpenQuickAdd={handleOpenQuickAdd} />;
    }
  };

  const currentHub = NAV_HUBS.find((h) => h.id === activeTab) || NAV_HUBS[0];

  return (
    <div className="app-shell-root">
      {/* 1. Desktop Sidebar (Right-aligned, fixed on screens >= 768px) */}
      <DesktopSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenQuickAdd={handleOpenQuickAdd}
        syncStatus={syncStatus}
        userModeText="وضع الضيف المحلي"
        lastSyncText={lastSyncedText}
      />

      {/* 2. Main Workspace Canvas */}
      <div className="app-shell-main">
        {/* Desktop Sticky Header (>= 768px) */}
        <DesktopHeader
          activeTab={activeTab}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenSearch={handleOpenSearch}
          syncStatus={syncStatus}
          pendingCount={pendingCount}
          lastSyncedText={lastSyncedText}
          onTriggerSync={handleTriggerManualSync}
        />

        {/* Mobile Sticky Top Bar (< 768px) */}
        <MobileTopBar
          title={currentHub.label}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenSettings={() => setActiveTab('settings')}
          syncStatus={syncStatus}
          pendingCount={pendingCount}
          lastSyncedText={lastSyncedText}
          onTriggerSync={handleTriggerManualSync}
        />

        {/* Dynamic Content Container */}
        <main className="app-shell-content-container" role="main">
          {renderActiveView()}
        </main>

        {/* Mobile Bottom Navigation Bar (< 768px) */}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onOpenQuickAdd={handleOpenQuickAdd}
        />
      </div>

      {/* 3. Quick Add Modal / Bottom Sheet Shell (F009) */}
      <QuickAdd
        isOpen={isQuickAddOpen}
        onClose={handleCloseQuickAdd}
      />
    </div>
  );
}

export default AppShell;
