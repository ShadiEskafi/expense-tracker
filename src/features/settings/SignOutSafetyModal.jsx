import { useEffect, useRef, useState } from 'react';
import { CloudAlertIcon, CloudSyncIcon, DownloadIcon, LogOutIcon, ShieldCheckIcon, CloseIcon } from '../../components/common/Icons.jsx';
import './SignOutSafetyModal.css';

export function SignOutSafetyModal({
  isOpen,
  pendingCount,
  isProcessing,
  errorMessage,
  infoMessage,
  onSync,
  onBackup,
  onConfirm,
  onClose
}) {
  const [rendered, setRendered] = useState(isOpen);
  const [phase, setPhase] = useState(isOpen ? 'is-open' : '');
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (!rendered) {
        previousFocusRef.current = document.activeElement;
        const mountFrame = requestAnimationFrame(() => setRendered(true));
        return () => cancelAnimationFrame(mountFrame);
      }
      const frame = requestAnimationFrame(() => setPhase('is-open'));
      return () => cancelAnimationFrame(frame);
    }
    if (!rendered) return undefined;
    const frame = requestAnimationFrame(() => setPhase('is-closing'));
    const closeMs = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--modal-close-dur')) || 150;
    const timer = setTimeout(() => {
      setRendered(false);
      setPhase('');
      previousFocusRef.current?.focus?.();
    }, closeMs);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [isOpen, rendered]);

  useEffect(() => {
    if (!rendered) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (isOpen) closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rendered, isOpen, isProcessing, onClose]);

  if (!rendered) return null;
  const isBlocked = pendingCount > 0;
  const countText = new Intl.NumberFormat('ar').format(pendingCount);

  return (
    <div className="signout-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isProcessing) onClose();
    }}>
      <section
        ref={dialogRef}
        className={`signout-dialog t-modal ${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-title"
        aria-describedby="signout-description"
        dir="rtl"
      >
        <span className="signout-sheet-handle" aria-hidden="true" />
        <header className="signout-header">
          <div className={`signout-icon ${isBlocked ? 'signout-icon-warning' : ''}`} aria-hidden="true">
            {isBlocked ? <CloudAlertIcon size={22} /> : <ShieldCheckIcon size={22} />}
          </div>
          <button ref={closeRef} type="button" className="signout-close" onClick={onClose}
            disabled={isProcessing} aria-label="إغلاق نافذة تسجيل الخروج">
            <CloseIcon size={20} />
          </button>
        </header>
        <div className="signout-copy">
          <h2 id="signout-title" className="text-h2">
            {isBlocked ? 'تنبيه أمان: لديك تعديلات لم تُزامن بعد!' : 'تأكيد تسجيل الخروج الآمن'}
          </h2>
          <p id="signout-description" className="text-body">
            {isBlocked
              ? `توجد ${countText} تعديلات على هذا الجهاز لم تُرفع إلى حسابك السحابي بعد. ستبقى بياناتك محفوظة هنا حتى تكتمل المزامنة. يمكنك تنزيل نسخة احتياطية قبل المحاولة مجدداً.`
              : 'سيتم حذف بيانات هذا الحساب السحابي من هذا المتصفح لحماية خصوصيتك. ستبقى بيانات الضيف المحلية محفوظة.'}
          </p>
        </div>
        {errorMessage && <p className="signout-feedback signout-error" role="alert">{errorMessage}</p>}
        {infoMessage && <p className="signout-feedback" role="status">{infoMessage}</p>}
        <footer className="signout-actions">
          {isBlocked ? (
            <>
              <button type="button" className="btn-primary signout-action" onClick={onSync} disabled={isProcessing}>
                <CloudSyncIcon size={18} />
                <span>{isProcessing ? 'جارٍ التنفيذ...' : 'المزامنة الآن'}</span>
              </button>
              <button type="button" className="btn-secondary signout-action" onClick={onBackup} disabled={isProcessing}>
                <DownloadIcon size={18} />
                <span>تنزيل نسخة احتياطية JSON</span>
              </button>
              <button type="button" className="signout-cancel" onClick={onClose} disabled={isProcessing}>إلغاء الخروج والعودة للتطبيق</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary signout-action" onClick={onConfirm} disabled={isProcessing}>
                <LogOutIcon size={18} />
                <span>{isProcessing ? 'جارٍ تسجيل الخروج...' : 'تأكيد تسجيل الخروج'}</span>
              </button>
              <button type="button" className="btn-secondary signout-action" onClick={onClose} disabled={isProcessing}>إلغاء</button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
