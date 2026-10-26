import { useState, useRef, useEffect } from 'react';
import {
  CloseIcon,
  CloudSyncIcon,
  CloudCheckIcon,
  CloudAlertIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  ShieldCheckIcon
} from '../../components/common/Icons.jsx';
import { signInWithEmail, signUpWithEmail } from '../../services/cloudSync.js';
import { db } from '../../db/db.js';
import './SupabaseAuthModal.css';

/**
 * SupabaseAuthModal (F018 + UX Polish)
 *
 * Implements mobile-native cloud authentication and initial guest data merge modal:
 * - Mobile bottom sheet with drag handle, safe area support, and dvh sizing
 * - High-contrast segmented control (Sign In / Register) with 44px+ touch targets
 * - Clear visual hierarchy: Title -> Segmented Tabs -> Form Fields -> Primary Action -> Secondary Action -> Data Safety Note
 * - Non-destructive validation preserving user inputs
 * - Password visibility toggle (Eye / EyeOff)
 * - Accessible dialog conforming to design-system/accessibility.md
 * - RTL typography and layout with LTR email/password inputs
 */
export function SupabaseAuthModal({
  isOpen,
  onClose,
  database = db,
  onAuthSuccess
}) {
  if (!isOpen) return null;

  return (
    <SupabaseAuthDialog
      onClose={onClose}
      database={database}
      onAuthSuccess={onAuthSuccess}
    />
  );
}

function SupabaseAuthDialog({
  onClose,
  database = db,
  onAuthSuccess
}) {
  const [activeTab, setActiveTab] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  const emailInputRef = useRef(null);

  // Auto-focus email input on tab switch
  useEffect(() => {
    emailInputRef.current?.focus();
  }, [activeTab]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('يرجى إدخال بريد إلكتروني صالح.');
      return;
    }
    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور.');
      return;
    }
    if (activeTab === 'signup' && password.length < 6) {
      setErrorMessage('كلمة المرور يجب أن لا تقل عن 6 أحرف.');
      return;
    }

    setIsSubmitting(true);

    try {
      let result;
      if (activeTab === 'signin') {
        result = await signInWithEmail({
          email: trimmedEmail,
          password,
          database
        });
      } else {
        result = await signUpWithEmail({
          email: trimmedEmail,
          password,
          database
        });
      }

      setSuccessInfo(result);
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess(result);
      }

      // Auto close after brief success acknowledgment
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMessage(err.message || 'حدث خطأ أثناء الاتصال بالخادم السحابي.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop auth-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Mobile Sheet Drag Handle */}
        <div className="sheet-drag-handle" aria-hidden="true" />

        {/* 1. Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-title-wrap">
            <div className="auth-icon-badge" aria-hidden="true">
              <CloudSyncIcon size={22} />
            </div>
            <div className="auth-title-texts">
              <h2 id="auth-modal-title" className="auth-modal-heading">
                {activeTab === 'signin' ? 'تسجيل الدخول إلى حسابك السحابي' : 'إنشاء حساب سحابي جديد'}
              </h2>
              <p className="auth-modal-subheading">
                {activeTab === 'signin'
                  ? 'سجّل دخولك لمزامنة بياناتك مع السحابة'
                  : 'أنشئ حسابك لحفظ ومزامنة نفقاتك بأمان'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn auth-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="إغلاق النافذة"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* 2. Mode Switch (Segmented Control) */}
        <div className="auth-segmented-control" role="tablist" aria-label="أنماط المصادقة">
          <button
            type="button"
            role="tab"
            id="auth-tab-signin"
            aria-selected={activeTab === 'signin'}
            aria-controls="auth-form-panel"
            className={`auth-segmented-tab ${activeTab === 'signin' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('signin');
              setErrorMessage(null);
            }}
            disabled={isSubmitting}
          >
            <UserIcon size={16} />
            <span>تسجيل الدخول</span>
          </button>
          <button
            type="button"
            role="tab"
            id="auth-tab-signup"
            aria-selected={activeTab === 'signup'}
            aria-controls="auth-form-panel"
            className={`auth-segmented-tab ${activeTab === 'signup' ? 'is-active' : ''}`}
            onClick={() => {
              setActiveTab('signup');
              setErrorMessage(null);
            }}
            disabled={isSubmitting}
          >
            <CloudCheckIcon size={16} />
            <span>حساب جديد</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="auth-alert auth-alert-error" role="alert">
            <CloudAlertIcon size={18} className="auth-alert-icon" />
            <span className="auth-alert-text">{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successInfo && (
          <div className="auth-alert auth-alert-success" role="status">
            <CloudCheckIcon size={18} className="auth-alert-icon" />
            <span className="auth-alert-text">
              تم {activeTab === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب'} ودمج بياناتك بنجاح!
            </span>
          </div>
        )}

        {/* 3. Authentication Form */}
        <form
          id="auth-form-panel"
          role="tabpanel"
          aria-labelledby={activeTab === 'signin' ? 'auth-tab-signin' : 'auth-tab-signup'}
          onSubmit={handleSubmit}
          className="auth-form"
          noValidate
        >
          {/* Email Field */}
          <div className="auth-field-group">
            <label htmlFor="auth-email-input" className="auth-field-label">
              البريد الإلكتروني
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-email-input"
                ref={emailInputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck="false"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className="auth-input text-ltr"
                disabled={isSubmitting || !!successInfo}
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="auth-field-group">
            <label htmlFor="auth-password-input" className="auth-field-label">
              كلمة المرور
            </label>
            <div className="auth-input-wrapper auth-password-wrapper">
              <input
                id="auth-password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                className="auth-input auth-password-input text-ltr font-mono"
                disabled={isSubmitting || !!successInfo}
                required
              />
              <button
                type="button"
                className="auth-password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting || !!successInfo}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                tabIndex={0}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {activeTab === 'signup' && (
              <span className="auth-field-helper">يجب أن تحتوي على 6 أحرف على الأقل</span>
            )}
          </div>

          {/* 4. Action Buttons (Primary on top, Secondary below) */}
          <div className="auth-actions-group">
            <button
              type="submit"
              className="auth-btn-primary"
              disabled={isSubmitting || !!successInfo}
            >
              {isSubmitting ? (
                <>
                  <CloudSyncIcon size={18} className="sync-icon-spinning" />
                  <span>جارٍ المعالجة والمزامنة...</span>
                </>
              ) : activeTab === 'signin' ? (
                <>
                  <UserIcon size={18} />
                  <span>تسجيل الدخول</span>
                </>
              ) : (
                <>
                  <CloudCheckIcon size={18} />
                  <span>إنشاء الحساب والمزامنة</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="auth-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء ومتابعة كضيف
            </button>
          </div>
        </form>

        {/* 5. Informational Security & Local Data Safety Note (below actions) */}
        <div className="auth-data-safety-note" role="note">
          <ShieldCheckIcon size={18} className="safety-note-icon" />
          <p className="safety-note-text">
            <strong>ضمان سلامة البيانات:</strong> لن تفقد أي معاملات أو حسابات مسجلة محلياً؛ سيتم دمجها بأمان وتشفيرها في حسابك السحابي دون أي تكرار أو فقدان.
          </p>
        </div>
      </div>
    </div>
  );
}
