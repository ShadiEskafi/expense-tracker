import { useState, useRef, useEffect } from 'react';
import {
  CloseIcon,
  CloudSyncIcon,
  CloudCheckIcon,
  CloudAlertIcon,
  UserIcon
} from '../../components/common/Icons.jsx';
import { signInWithEmail, signUpWithEmail } from '../../services/cloudSync.js';
import { db } from '../../db/db.js';
import './SupabaseAuthModal.css';

/**
 * SupabaseAuthModal (F018)
 *
 * Implements cloud authentication and initial guest data merge modal:
 * - Tabs for Sign In and Sign Up
 * - Informative Arabic explanation of guest data merge guarantee
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
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  const emailInputRef = useRef(null);

  // Auto-focus email input on open
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
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className="surface-card auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-title-wrap">
            <div className="auth-icon-badge" aria-hidden="true">
              <CloudSyncIcon size={22} className="text-brand-primary" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-h2">
                {activeTab === 'signin' ? 'تسجيل الدخول إلى حسابك السحابي' : 'إنشاء حساب سحابي جديد'}
              </h2>
              <span className="text-caption text-secondary">
                مزامنة فورية متعددة الأجهزة ونسخ احتياطي تلقائي
              </span>
            </div>
          </div>
          <button
            type="button"
            className="action-button-icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="إغلاق النافذة"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="auth-tabs" role="tablist" aria-label="أنماط المصادقة">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'signin'}
            className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('signin');
              setErrorMessage(null);
            }}
            disabled={isSubmitting}
          >
            <UserIcon size={16} />
            تسجيل الدخول
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'signup'}
            className={`auth-tab-btn ${activeTab === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('signup');
              setErrorMessage(null);
            }}
            disabled={isSubmitting}
          >
            <CloudCheckIcon size={16} />
            حساب جديد
          </button>
        </div>

        {/* Informational Merge Notice */}
        <div className="auth-merge-notice" role="note">
          <CloudCheckIcon size={18} className="notice-icon" />
          <p className="text-caption">
            <strong>ضمان سلامة البيانات:</strong> سيتم دمج كافة حساباتك ومصاريفك وفئاتك المسجلة محلياً على هذا الجهاز تلقائياً وبأمان في حسابك السحابي دون أي تكرار أو فقدان.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="auth-error-banner" role="alert">
            <CloudAlertIcon size={18} />
            <span className="text-body-sm">{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successInfo && (
          <div className="auth-success-banner" role="status">
            <CloudCheckIcon size={18} />
            <span className="text-body-sm">
              تم {activeTab === 'signin' ? 'تسجيل الدخول' : 'إنشاء الحساب'} ودمج بياناتك بنجاح!
            </span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field-group">
            <label htmlFor="auth-email-input" className="auth-label">
              البريد الإلكتروني
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-email-input"
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className="auth-input text-ltr"
                disabled={isSubmitting || !!successInfo}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-field-group">
            <label htmlFor="auth-password-input" className="auth-label">
              كلمة المرور
            </label>
            <div className="auth-input-wrapper">
              <input
                id="auth-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                className="auth-input text-ltr font-mono"
                disabled={isSubmitting || !!successInfo}
                required
                autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="auth-modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={isSubmitting || !!successInfo}
            >
              {isSubmitting ? (
                <>
                  <CloudSyncIcon size={18} className="sync-icon-spinning" />
                  جارٍ الدمج والمزامنة...
                </>
              ) : activeTab === 'signin' ? (
                <>
                  <UserIcon size={18} />
                  تسجيل الدخول
                </>
              ) : (
                <>
                  <CloudCheckIcon size={18} />
                  إنشاء الحساب والمزامنة
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
