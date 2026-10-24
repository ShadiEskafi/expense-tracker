# متغيرات التصميم — Design Tokens

> **الهدف**: تعريف المتغيرات القياسية (Design Tokens) القابلة للترجمة مباشرة إلى متغيرات CSS (`:root` و `[data-theme="dark"]`).

---

## 1. رموز الألوان (Color Tokens)

### أ. ألوان السطح والخلفيات (Surface & Background)
```css
/* الوضع الفاتح (الافتراضي) */
:root {
  --color-bg-app: #F8FAFC;            /* خلفية الصفحة العامة */
  --color-bg-surface: #FFFFFF;        /* سطح البطاقات والحاويات */
  --color-bg-surface-elevated: #FFFFFF; /* سطح النوافذ واللوحات المنبثقة */
  --color-bg-surface-subtle: #F1F5F9;  /* خلفية الحقول والأزرار الثانوية */
  --color-bg-surface-active: #E2E8F0;  /* حالة التحديد أو الضغط */

  /* النصوص والرموز */
  --color-text-primary: #0F172A;      /* نصوص رئيسية (عناوين، أرقام) - كحلي داكن */
  --color-text-secondary: #475569;    /* نصوص فرعية وتوضيحات - رمادي متزن */
  --color-text-muted: #94A3B8;        /* نصوص غير نشطة أو نصوص تلميحية (Placeholder) */
  --color-text-inverse: #FFFFFF;      /* نصوص على خلفيات داكنة */

  /* الحدود والفواصل */
  --color-border-subtle: #E2E8F0;     /* حدود البطاقات وحقول الإدخال */
  --color-border-strong: #CBD5E1;     /* حدود التركيز أو الفواصل النشطة */
  --color-divider: #F1F5F9;           /* فواصل الجداول والقوائم */

  /* ألوان العمليات المالية الأساسية */
  --color-income: #059669;            /* دخل - زمردي عميق */
  --color-income-subtle: #ECFDF5;     /* خلفية خفيفة لمؤشرات الدخل */
  --color-expense: #E11D48;           /* مصروف - وردي قرمزي */
  --color-expense-subtle: #FFF1F2;    /* خلفية خفيفة لمؤشرات المصروف */
  --color-transfer: #6366F1;          /* تحويل داخلي - بنفسجي نيلي */
  --color-transfer-subtle: #EEF2FF;   /* خلفية خفيفة لمؤشرات التحويل */
  --color-liability: #D97706;         /* ديون والتزامات البطاقات - كهرماني */
  --color-liability-subtle: #FFFBEB;  /* خلفية خفيفة لمؤشرات الالتزام */

  /* حالات النظام والاتصال */
  --color-sync-synced: #10B981;       /* متزامن - أخضر */
  --color-sync-pending: #F59E0B;      /* تعديلات قيد الانتظار - برتقالي */
  --color-sync-syncing: #3B82F6;      /* جاري المزامنة - أزرق */
  --color-sync-failed: #EF4444;       /* فشل المزامنة - أحمر تحذيري */
  --color-sync-offline: #64748B;      /* غير متصل بالإنترنت - رمادي ناعم */

  /* ألوان التفاعل والتأكيد */
  --color-brand-primary: #0F172A;     /* لون الهوية الأساسي (كحلي عميق) */
  --color-brand-primary-hover: #1E293B;
  --color-focus-ring: #0284C7;        /* إطار التركيز للوحة المفاتيح */
}

/* الوضع الداكن */
[data-theme="dark"] {
  --color-bg-app: #0B0F19;            /* خلفية داكنة باردة */
  --color-bg-surface: #161F30;        /* سطح بطاقات داكن */
  --color-bg-surface-elevated: #1E293B; /* سطح منبثق مرتفع */
  --color-bg-surface-subtle: #1E293B;  /* خلفية الحقول الداكنة */
  --color-bg-surface-active: #334155;

  /* النصوص والرموز */
  --color-text-primary: #F8FAFC;      /* نصوص رئيسية ناصعة متباينة */
  --color-text-secondary: #94A3B8;    /* رمادي فاتح مريح للقراءة */
  --color-text-muted: #64748B;
  --color-text-inverse: #0F172A;

  /* الحدود */
  --color-border-subtle: rgba(255, 255, 255, 0.08);
  --color-border-strong: rgba(255, 255, 255, 0.16);
  --color-divider: rgba(255, 255, 255, 0.05);

  /* ألوان العمليات المالية في الوضع الداكن */
  --color-income: #10B981;
  --color-income-subtle: rgba(16, 185, 129, 0.12);
  --color-expense: #FB7185;
  --color-expense-subtle: rgba(251, 113, 133, 0.12);
  --color-transfer: #818CF8;
  --color-transfer-subtle: rgba(129, 140, 248, 0.12);
  --color-liability: #FBBF24;
  --color-liability-subtle: rgba(251, 191, 36, 0.12);

  /* حالات النظام */
  --color-sync-synced: #34D399;
  --color-sync-pending: #FBBF24;
  --color-sync-syncing: #60A5FA;
  --color-sync-failed: #F87171;
  --color-sync-offline: #94A3B8;

  --color-brand-primary: #38BDF8;     /* لون زر رئيسي مشرق في الداكن */
  --color-brand-primary-hover: #0EA5E9;
  --color-focus-ring: #38BDF8;
}
```

---

## 2. مقياس المسافات والشبكة (Spacing Scale)

مبني على إيقاع قياسي بمضاعفات 4pt و 8pt:

```css
:root {
  --space-1: 4px;     /* تباعدات دقيقة جداً (بين أيقونة ونص مرافق) */
  --space-2: 8px;     /* مسافة دقيقة (بين شارات التصنيف وحواف البطاقة) */
  --space-3: 12px;    /* مسافة داخلية مدمجة للحقول المكتنزة */
  --space-4: 16px;    /* التباعد القياسي الأساسي (هوامش البطاقات والعناصر) */
  --space-5: 20px;    /* تباعد مريح بين أقسام النموذج */
  --space-6: 24px;    /* هوامش الشاشة على الموبايل وفواصل الأقسام الكبيرة */
  --space-8: 32px;    /* مسافة بين كتل لوحة التحكم على الديسكتوب */
  --space-10: 40px;   /* فواصل المقاطع الكبرى */
  --space-12: 48px;   /* مسافات التنفس العلوية */
  --space-16: 64px;
}
```

---

## 3. مقياس تدوير الحواف (Border Radius)

```css
:root {
  --radius-xs: 4px;     /* شارات مصغرة وعلامات الحالة */
  --radius-sm: 8px;     /* أزرار فرعية، حقول إدخال مصغرة */
  --radius-md: 12px;    /* أزرار رئيسية، حقول إدخال أساسية */
  --radius-lg: 16px;    /* بطاقات الحسابات والمعاملات */
  --radius-xl: 20px;    /* لوحات سفلية ونوافذ منبثقة */
  --radius-2xl: 24px;   /* الحاويات الكبرى */
  --radius-full: 9999px; /* شارات دائرية، أزرار عائمة دائرية (FAB) */
}
```

---

## 4. مقياس الظلال والارتفاع (Elevation & Shadows)

```css
:root {
  --shadow-none: none;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.06), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
  --shadow-modal: 0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06);
}

[data-theme="dark"] {
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
  --shadow-modal: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
}
```

---

## 5. طبقات العمق (Z-Index Layers)

```css
:root {
  --z-base: 0;
  --z-sticky-header: 10;
  --z-bottom-nav: 20;
  --z-drawer-backdrop: 30;
  --z-drawer-sheet: 35;
  --z-modal-backdrop: 40;
  --z-modal-content: 45;
  --z-toast: 50;
  --z-tooltip: 60;
}
```

---

## 6. نقاط التوقف التجاوبية (Breakpoints)

```css
/* متوافقة مع Tailwind CSS وتصميم الشاشات */
--breakpoint-sm: 640px;   /* هواتف عريضة */
--breakpoint-md: 768px;   /* بداية أجهزة التابلت والقائمة الجانبية للديسكتوب */
--breakpoint-lg: 1024px;  /* أجهزة اللابتوب والشاشات المتوسطة */
--breakpoint-xl: 1280px;  /* شاشات سطح المكتب القياسية */
--breakpoint-2xl: 1440px; /* شاشات سطح المكتب العريضة */
```

---

## 7. أبعاد عناصر التفاعل (Hit Targets & Sizing)

```css
:root {
  --size-touch-min: 44px;      /* أدنى مساحة لمس موصى بها للهاتف (WCAG AA) */
  --size-btn-height-lg: 52px;  /* أزرار تأكيد النماذج وزر Quick Add الرئيسي */
  --size-btn-height-md: 44px;  /* الأزرار القياسية */
  --size-btn-height-sm: 36px;  /* الأزرار المدمجة داخل القوائم */
  --size-input-height: 48px;   /* ارتفاع حقول الإدخال */
  --size-amount-display: 40px; /* ارتفاع الخط لحقل إدخال المبلغ الرئيسي */
  --size-icon-sm: 16px;
  --size-icon-md: 20px;
  --size-icon-lg: 24px;
  --size-icon-category: 28px;
}
```

---

## 8. أوقات ومنحنيات الحركة (Motion Tokens)

```css
:root {
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);  /* منحنى ارتدادي لطيف مريح للعين */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);

  --duration-instant: 100ms;   /* تفاعلات الضغط والتبديل */
  --duration-fast: 150ms;      /* إغلاق النوافذ واللوحات */
  --duration-normal: 220ms;    /* فتح اللوحات السفلية وانتقالات الصفحات */
  --duration-slow: 300ms;      /* رسوم بيانية وتوسيع أقسام التفاصيل */
}
```
