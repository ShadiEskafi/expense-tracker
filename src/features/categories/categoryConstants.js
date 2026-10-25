/**
 * Category Management Constants
 * Curated color palette and icon options strictly matching
 * design-system/colors.md and design-system/tokens.css
 */

export const CATEGORY_COLOR_PALETTE = Object.freeze([
  { label: 'برتقالي مشرق', hex: '#F97316' },
  { label: 'أخضر زمردي', hex: '#10B981' },
  { label: 'أزرق سماوي', hex: '#0284C7' },
  { label: 'نيلي هادئ', hex: '#6366F1' },
  { label: 'أخضر مزرق (تيل)', hex: '#14B8A6' },
  { label: 'بنفسجي زاهي', hex: '#8B5CF6' },
  { label: 'عنبري دافئ', hex: '#F59E0B' },
  { label: 'أزرق ملكي', hex: '#2563EB' },
  { label: 'وردي لطيف', hex: '#EC4899' },
  { label: 'قرمزي متزن', hex: '#E11D48' },
  { label: 'أزرق فيروزي', hex: '#06B6D4' },
  { label: 'رمادي صخري', hex: '#64748B' },
  { label: 'أخضر ليموني', hex: '#84CC16' },
  { label: 'فوشيا مبهج', hex: '#D946EF' },
  { label: 'أرجواني عميق', hex: '#9333EA' },
  { label: 'أخضر مالي غامق', hex: '#059669' }
]);

export const CATEGORY_ICON_OPTIONS = Object.freeze([
  { id: 'utensils', label: 'طعام ومطاعم' },
  { id: 'shopping-cart', label: 'بقالة ومشتريات' },
  { id: 'car', label: 'مواصلات ومركبات' },
  { id: 'home', label: 'سكن وفواتير' },
  { id: 'heart-pulse', label: 'صحة وعناية' },
  { id: 'shopping-bag', label: 'تسوق وملابس' },
  { id: 'film', label: 'ترفيه وسينما' },
  { id: 'graduation-cap', label: 'تعليم ودورات' },
  { id: 'sparkles', label: 'جمال وتجميل' },
  { id: 'banknote', label: 'راتب ونقد' },
  { id: 'briefcase', label: 'عمل ومشاريع' },
  { id: 'trending-up', label: 'أرباح وتجارة' },
  { id: 'line-chart', label: 'استثمارات وعوائد' },
  { id: 'gift', label: 'هدايا ومكافآت' },
  { id: 'coins', label: 'عملات ومصادر أخرى' },
  { id: 'tag', label: 'وسم عام' },
  { id: 'wallet', label: 'محفظة ومدخرات' },
  { id: 'more-horizontal', label: 'متنوعات' }
]);

/**
 * Converts 6-char hex color to rgba string
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function hexToRgba(hex, alpha = 0.15) {
  if (!hex || typeof hex !== 'string') {
    return `rgba(100, 116, 139, ${alpha})`;
  }
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) {
    return hex;
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
