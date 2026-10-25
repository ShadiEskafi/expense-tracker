import {
  AccountsIcon,
  TransactionsIcon,
  ReportsIcon,
  CategoriesIcon,
  PlusIcon,
} from '../common/Icons';

/**
 * Hub Views Previews for AppShell
 * Authentically styled according to design-system/screens.md
 */

export function DashboardView({ onOpenQuickAdd }) {
  return (
    <div className="hub-view dashboard-view">
      {/* 1. Net Position Hero / Summary Cards */}
      <section className="metrics-summary-grid" aria-label="ملخص المركز المالي">
        <div className="metric-card metric-card-primary">
          <span className="metric-card-label text-caption">صافي المركز المالي</span>
          <div className="metric-card-amount">
            <span className="amount-value text-display financial-num">14,250.00</span>
            <span className="amount-currency text-body">ر.س</span>
          </div>
          <span className="metric-card-sub text-caption">الأصول المتاحة مطروحاً منها الالتزامات</span>
        </div>

        <div className="metric-card">
          <span className="metric-card-label text-caption">الأموال السائلة المتاحة</span>
          <div className="metric-card-amount text-h2 color-income">
            <span className="amount-value financial-num">17,500.00</span>
            <span className="amount-currency text-caption">ر.س</span>
          </div>
          <span className="metric-card-sub text-caption">كاش الحسابات الجارية والمحافظ</span>
        </div>

        <div className="metric-card">
          <span className="metric-card-label text-caption">التزامات البطاقات الائتمانية</span>
          <div className="metric-card-amount text-h2 color-liability">
            <span className="amount-value financial-num">3,250.00</span>
            <span className="amount-currency text-caption">ر.س</span>
          </div>
          <span className="metric-card-sub text-caption">مستحق السداد (ديون قصيرة الأجل)</span>
        </div>
      </section>

      {/* 2. Quick Actions & FTUX Welcome Banner */}
      <section className="dashboard-banner-card">
        <div className="banner-content">
          <h3 className="banner-title text-h3">جاهز لإدارة مصاريفك بكل ثقة؟</h3>
          <p className="banner-desc text-body">
            تطبيق مَصاريفي يعمل بكامل طاقته محلياً دون الحاجة لإنترنت. يمكنك تسجيل أول مصروف بضغطة زر واحدة.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary banner-action-btn"
          onClick={onOpenQuickAdd}
        >
          <PlusIcon size={18} />
          <span>تسجيل معاملة سريعة</span>
        </button>
      </section>

      {/* 3. Section Grid: Recent Transactions & Wallets */}
      <div className="dashboard-grid-two-col">
        <div className="surface-card">
          <div className="surface-card-header">
            <h4 className="text-h3">المحافظ والحسابات</h4>
            <span className="text-caption">3 حسابات نشطة</span>
          </div>
          <div className="accounts-preview-list">
            <div className="account-row-item">
              <div className="account-icon-box">
                <AccountsIcon size={18} />
              </div>
              <div className="account-info">
                <span className="account-name text-body">الحساب الجاري الرئيسي</span>
                <span className="account-type text-caption">مصرف الراجحي</span>
              </div>
              <div className="account-balance text-h3 financial-num">
                12,500.00 <span className="text-caption">ر.س</span>
              </div>
            </div>

            <div className="account-row-item">
              <div className="account-icon-box">
                <AccountsIcon size={18} />
              </div>
              <div className="account-info">
                <span className="account-name text-body">نقدية المحفظة (كاش)</span>
                <span className="account-type text-caption">أموال نقدية</span>
              </div>
              <div className="account-balance text-h3 financial-num">
                5,000.00 <span className="text-caption">ر.س</span>
              </div>
            </div>

            <div className="account-row-item is-liability">
              <div className="account-icon-box">
                <AccountsIcon size={18} />
              </div>
              <div className="account-info">
                <span className="account-name text-body">بطاقة فيزا الائتمانية</span>
                <span className="liability-badge text-micro">مستحق السداد</span>
              </div>
              <div className="account-balance text-h3 color-liability financial-num">
                - 3,250.00 <span className="text-caption">ر.س</span>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card">
          <div className="surface-card-header">
            <h4 className="text-h3">آخر المعاملات المسجلة</h4>
            <span className="text-caption">سجل اليوم</span>
          </div>
          <div className="transactions-preview-list">
            <div className="tx-row-item">
              <div className="tx-badge-dot expense" />
              <div className="tx-info">
                <span className="tx-title text-body">مشتريات بقالة وسوبرماركت</span>
                <span className="tx-meta text-caption">الحساب الجاري • طعام ومؤونة</span>
              </div>
              <div className="tx-amount color-expense text-body financial-num">
                - 145.00 <span className="text-caption">ر.س</span>
              </div>
            </div>

            <div className="tx-row-item">
              <div className="tx-badge-dot income" />
              <div className="tx-info">
                <span className="tx-title text-body">راتب شهري أساسي</span>
                <span className="tx-meta text-caption">الحساب الجاري • الراتب والمهنة</span>
              </div>
              <div className="tx-amount color-income text-body financial-num">
                + 15,000.00 <span className="text-caption">ر.س</span>
              </div>
            </div>

            <div className="tx-row-item">
              <div className="tx-badge-dot transfer" />
              <div className="tx-info">
                <span className="tx-title text-body">سداد بطاقة الائتمان</span>
                <span className="tx-meta text-caption">من الجاري إلى فيزا الائتمانية</span>
              </div>
              <div className="tx-amount color-transfer text-body financial-num">
                ↔ 1,000.00 <span className="text-caption">ر.س</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TransactionsView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">سجل المعاملات المالي</h3>
            <span className="text-caption">استعراض، تصفية، وبحث كامل في السجل التاريخي لكافة العمليات</span>
          </div>
          <div className="tx-filter-chips">
            <button type="button" className="chip active">الكل</button>
            <button type="button" className="chip">مصاريف</button>
            <button type="button" className="chip">دخل</button>
            <button type="button" className="chip">تحويلات</button>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <TransactionsIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">سجل المعاملات جاهز</h4>
          <p className="text-caption">سيتم تفعيل التصفية الشاملة وتصدير CSV في ميزات F011 و F015.</p>
        </div>
      </div>
    </div>
  );
}

export function AccountsView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">المحافظ والحسابات المالية</h3>
            <span className="text-caption">إدارة الحسابات البنكية، النقدية، وبطاقات الائتمان</span>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <AccountsIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">إدارة الحسابات نشطة</h4>
          <p className="text-caption">أرصدتك مدعومة بنظام دفتر الأستاذ (Ledger-backed) المنفذ في F004.</p>
        </div>
      </div>
    </div>
  );
}

export function ReportsView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">التقارير والتحليلات البيانية</h3>
            <span className="text-caption">تحليل الإنفاق، التوزيع حسب التصنيف، وأعلى المصاريف</span>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <ReportsIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">قسم التحليلات والرسوم البيانية</h4>
          <p className="text-caption">سيتم ربط المخططات الإحصائية في ميزتي F010 و F012.</p>
        </div>
      </div>
    </div>
  );
}

export function CategoriesView() {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">إدارة التصنيفات</h3>
            <span className="text-caption">تصنيفات المصاريف والدخل المحددة مسبقاً وتخصيصها</span>
          </div>
        </div>
        <div className="empty-placeholder-card">
          <CategoriesIcon size={36} className="placeholder-icon" />
          <h4 className="text-h3">التصنيفات المعتمدة محملة</h4>
          <p className="text-caption">16 تصنيفاً قياسياً معرّفة بدقة في F003، مع إمكانية التخصيص في F013.</p>
        </div>
      </div>
    </div>
  );
}

export function SettingsView({ theme, onToggleTheme }) {
  return (
    <div className="hub-view">
      <div className="surface-card">
        <div className="surface-card-header">
          <div>
            <h3 className="text-h2">الإعدادات والبيانات</h3>
            <span className="text-caption">تخصيص المظهر، قفل العملة، المزامنة، والنسخ الاحتياطي</span>
          </div>
        </div>
        <div className="settings-options-list">
          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">مظهر التطبيق</span>
              <span className="text-caption">التبديل بين الوضع الفاتح والداكن</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? 'الوضع الداكن (نشط)' : 'الوضع الفاتح (نشط)'}
            </button>
          </div>

          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">العملة الأساسية المقفلة</span>
              <span className="text-caption">ريال سعودي (SAR - ر.س) • محسوبة بوحدات الماينور الصحيحة</span>
            </div>
            <span className="status-badge-locked text-caption">مقفل لحماية البيانات</span>
          </div>

          <div className="settings-row-item">
            <div className="settings-row-info">
              <span className="text-body font-semibold">التخزين والمزامنة</span>
              <span className="text-caption">تخزين محلي أولاً (IndexedDB / Dexie.js) • وضع الضيف الآمن</span>
            </div>
            <span className="status-badge-active text-caption">محلي نشط</span>
          </div>
        </div>
      </div>
    </div>
  );
}
