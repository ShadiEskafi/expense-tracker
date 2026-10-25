import { CategoryIcon, EditIcon, TrashIcon } from '../../components/common/Icons';
import { hexToRgba } from './categoryConstants';

/**
 * CategoryCard — Displays a single category with icon, color badge,
 * usage count, and edit/delete actions.
 * Adheres to /impeccable, /make-interfaces-feel-better, and /ui-ux-pro-max.
 */
export function CategoryCard({
  category,
  transactionCount = 0,
  onEdit,
  onDelete
}) {
  const isDefault = Boolean(category.is_default);
  const badgeBg = hexToRgba(category.color, 0.14);

  return (
    <article
      className="category-card"
      data-testid={`category-card-${category.id}`}
      style={{
        '--cat-accent-color': category.color,
        '--cat-badge-bg': badgeBg
      }}
    >
      <div className="category-card-header">
        <div
          className="category-card-icon-wrap"
          style={{
            backgroundColor: badgeBg,
            color: category.color
          }}
          aria-hidden="true"
        >
          <CategoryIcon name={category.icon} size={22} />
        </div>

        <div className="category-card-badges">
          {isDefault ? (
            <span className="cat-pill cat-pill-default" title="تصنيف معتمد من النظام">
              افتراضي
            </span>
          ) : (
            <span className="cat-pill cat-pill-custom" title="تصنيف مخصص من قبلك">
              مخصص
            </span>
          )}
        </div>
      </div>

      <div className="category-card-body">
        <h4 className="category-card-title" title={category.name}>
          {category.name}
        </h4>
        <p className="category-card-meta">
          <span className="tabular-num font-semibold">{transactionCount}</span>{' '}
          {transactionCount === 1 ? 'معاملة مسجلة' : 'معاملات مسجلة'}
        </p>
      </div>

      <div className="category-card-actions">
        <button
          type="button"
          className="cat-action-btn cat-action-edit"
          onClick={() => onEdit(category)}
          aria-label={`تعديل تصنيف ${category.name}`}
          title="تعديل الاسم أو اللون أو الأيقونة"
        >
          <EditIcon size={15} />
          <span>تعديل</span>
        </button>

        <button
          type="button"
          className="cat-action-btn cat-action-delete"
          onClick={() => onDelete(category)}
          aria-label={`حذف تصنيف ${category.name}`}
          title="حذف التصنيف مع حماية المعاملات"
        >
          <TrashIcon size={15} />
          <span>حذف</span>
        </button>
      </div>
    </article>
  );
}
