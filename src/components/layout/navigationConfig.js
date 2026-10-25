/**
 * Central Navigation Configuration
 * Single Source of Truth for App Shell Navigation
 * Ref: design-system/navigation.md
 */

export const NAV_HUBS = [
  {
    id: 'dashboard',
    label: 'الرئيسية',
    shortLabel: 'الرئيسية',
    iconName: 'DashboardIcon',
    inMobileBottomNav: true,
    mobileOrder: 1,
  },
  {
    id: 'transactions',
    label: 'المعاملات',
    shortLabel: 'المعاملات',
    iconName: 'TransactionsIcon',
    inMobileBottomNav: true,
    mobileOrder: 2,
  },
  {
    id: 'accounts',
    label: 'المحافظ والحسابات',
    shortLabel: 'المحافظ',
    iconName: 'AccountsIcon',
    inMobileBottomNav: true,
    mobileOrder: 3,
  },
  {
    id: 'reports',
    label: 'التقارير والتحليلات',
    shortLabel: 'التقارير',
    iconName: 'ReportsIcon',
    inMobileBottomNav: true,
    mobileOrder: 4,
  },
  {
    id: 'categories',
    label: 'التصنيفات',
    shortLabel: 'التصنيفات',
    iconName: 'CategoriesIcon',
    inMobileBottomNav: false,
    mobileOrder: 5,
  },
  {
    id: 'settings',
    label: 'الإعدادات والبيانات',
    shortLabel: 'الإعدادات',
    iconName: 'SettingsIcon',
    inMobileBottomNav: false,
    mobileOrder: 6,
  },
];

export const MOBILE_BOTTOM_TABS = NAV_HUBS.filter((hub) => hub.inMobileBottomNav).sort(
  (a, b) => a.mobileOrder - b.mobileOrder
);
