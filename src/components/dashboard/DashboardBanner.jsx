import { PlusIcon } from '../common/Icons.jsx';

/**
 * Dashboard Welcome & Quick Action Banner
 *
 * References:
 * - project-summary.md § 23 (FTUX & Quick Add Target)
 * - design-system/screens.md § 1
 */
export function DashboardBanner({ onOpenQuickAdd }) {
  return (
    <section className="dashboard-banner-card" aria-label="لافتة الإجراء السريع والترحيب">
      <div className="banner-content">
        <h2 className="banner-title text-h3">جاهز لإدارة مصاريفك بكل ثقة؟</h2>
        <p className="banner-desc text-body">
          تطبيق مَصاريفي يعمل بكامل طاقته محلياً على جهازك دون الحاجة لإنترنت. يمكنك تسجيل أول مصروف بضغطة زر واحدة ومتابعة نمو أموالك بأمان تام.
        </p>
      </div>
      {onOpenQuickAdd && (
        <button
          type="button"
          className="btn-primary banner-action-btn"
          onClick={onOpenQuickAdd}
          data-testid="banner-quick-add-btn"
        >
          <PlusIcon size={18} />
          <span>تسجيل معاملة سريعة</span>
        </button>
      )}
    </section>
  );
}
