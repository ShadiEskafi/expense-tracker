import { formatAmountNumber } from './dashboardUtils.js';
import {
  WalletIcon,
  AccountsIcon,
  CreditCardIcon,
  ChevronLeftIcon,
  PlusIcon
} from '../common/Icons.jsx';

/**
 * Returns user-friendly Arabic label and icon for each account type.
 */
function getAccountTypeMeta(type) {
  switch (type) {
    case 'cash':
      return { label: 'نقدية (كاش)', icon: WalletIcon };
    case 'bank':
      return { label: 'حساب بنكي', icon: AccountsIcon };
    case 'credit_card':
      return { label: 'بطاقة ائتمان', icon: CreditCardIcon };
    case 'savings':
      return { label: 'حساب توفير', icon: AccountsIcon };
    default:
      return { label: 'محفظة مالية', icon: WalletIcon };
  }
}

/**
 * Account Balance Cards Widget
 * Horizontal-scrollable on mobile, flexible grid on desktop.
 * Displays ledger-backed balances, account types, and credit card liability badges.
 *
 * References:
 * - design-system/screens.md § 1
 * - skills: /impeccable, /ui-ux-pro-max, /make-interfaces-feel-better
 */
export function AccountBalanceCards({
  accounts = [],
  currency = 'SAR',
  onNavigateAccounts,
  onOpenQuickAdd
}) {
  return (
    <section className="dashboard-section account-balances-section" aria-label="أرصدة المحافظ والحسابات">
      <div className="section-header">
        <div className="section-title-wrap">
          <h2 className="section-title text-h2">المحافظ والحسابات</h2>
          <span className="section-counter text-caption">
            {accounts.length} {accounts.length === 1 ? 'حساب نشط' : 'حسابات نشطة'}
          </span>
        </div>
        {onNavigateAccounts && (
          <button
            type="button"
            className="section-action-link text-caption"
            onClick={onNavigateAccounts}
            aria-label="عرض كافة الحسابات والمحافظ"
          >
            <span>إدارة الحسابات</span>
            <ChevronLeftIcon size={16} />
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="account-empty-state surface-card" data-testid="accounts-empty-state">
          <WalletIcon size={32} className="empty-icon" />
          <h3 className="text-h3">لا توجد حسابات مضافة حتى الآن</h3>
          <p className="text-caption">أضف حساباتك البنكية ونقدية المحفظة لتتبع تدفقاتك المالية بدقة.</p>
          {onOpenQuickAdd && (
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenQuickAdd}
            >
              <PlusIcon size={16} />
              <span>إضافة أول عملية</span>
            </button>
          )}
        </div>
      ) : (
        <div className="accounts-scroll-track" role="list">
          {accounts.map((acc) => {
            const meta = getAccountTypeMeta(acc.type);
            const Icon = meta.icon;
            const isCreditCard = acc.type === 'credit_card';
            const balance = acc.balance ?? 0;
            const isNegative = balance < 0;

            return (
              <div
                key={acc.id}
                role="listitem"
                className={`account-card ${isCreditCard ? 'is-liability-card' : ''}`}
                tabIndex={0}
                onClick={onNavigateAccounts}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateAccounts?.();
                  }
                }}
                data-testid={`account-card-${acc.id}`}
              >
                <div className="account-card-top">
                  <div className={`account-icon-badge ${isCreditCard ? 'liability' : ''}`}>
                    <Icon size={18} />
                  </div>
                  <div className="account-type-tag text-micro">
                    {meta.label}
                  </div>
                </div>

                <div className="account-card-body">
                  <span className="account-name-text text-body" title={acc.name}>
                    {acc.name}
                  </span>

                  <div className="account-balance-row">
                    <span
                      className={`account-balance-amount text-h2 financial-num ${
                        isCreditCard
                          ? (isNegative ? 'color-liability' : 'color-income')
                          : (isNegative ? 'color-expense' : '')
                      }`}
                    >
                      {formatAmountNumber(Math.abs(balance), acc.currency || currency)}
                    </span>
                    <span className="account-balance-currency text-caption">
                      {acc.currency || currency}
                    </span>
                  </div>
                </div>

                <div className="account-card-footer">
                  {isCreditCard ? (
                    isNegative ? (
                      <span className="liability-pill alert text-micro">
                        مستحق السداد
                      </span>
                    ) : (
                      <span className="liability-pill settled text-micro">
                        لا توجد مستحقات
                      </span>
                    )
                  ) : (
                    <span className="account-status-subtle text-caption">
                      رصيد متاح
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
