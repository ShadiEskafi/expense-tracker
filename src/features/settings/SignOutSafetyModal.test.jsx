import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SignOutSafetyModal } from './SignOutSafetyModal.jsx';

const actions = {
  onSync: vi.fn(),
  onBackup: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn()
};

describe('F019 sign-out dialog', () => {
  it('offers recovery actions and withholds confirmation while changes are unsynced', () => {
    const html = renderToString(<SignOutSafetyModal isOpen pendingCount={3} isProcessing={false}
      errorMessage={null} infoMessage={null} {...actions} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('المزامنة الآن');
    expect(html).toContain('تنزيل نسخة احتياطية JSON');
    expect(html).toContain('إلغاء الخروج والعودة للتطبيق');
    expect(html).not.toContain('تأكيد تسجيل الخروج</span>');
  });

  it('shows an explicit privacy confirmation once the queue is clean', () => {
    const html = renderToString(<SignOutSafetyModal isOpen pendingCount={0} isProcessing={false}
      errorMessage={null} infoMessage={null} {...actions} />);

    expect(html).toContain('تأكيد تسجيل الخروج');
    expect(html).toContain('ستبقى بيانات الضيف المحلية محفوظة');
    expect(html).not.toContain('تنزيل نسخة احتياطية JSON');
  });
});
