# دليل النظام التصميمي — تطبيق إدارة المصاريف (Design System v1.0)

> **الحالة**: **معتمد ومجمّد (Frozen v1.0)**  
> **اللغة والاتجاه الأساسي**: **العربية أولاً (Arabic-first) | من اليمين إلى اليسار (RTL)**  
> **المرجع التقني والوظيفي**: مستند إلى [project-summary.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/project-summary.md) و [figma-prompt.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/figma-prompt.md).

---

## 1. نظرة عامة (Overview)

هذا المجلد هو **المصدر الوحيد للحقيقة (Single Source of Truth)** لجميع قرارات تجربة وواجهة المستخدم (UI/UX) لتطبيق إدارة المصاريف الشخصية. يُلزم هذا الدليل أي مطور أو نظام برمجي بتطبيق المعايير والأنماط الموثقة هنا دون اجتهادات عشوائية، لضمان واجهة سريعة، هادئة، دقيقة، ومبنية خصيصاً للمستخدم العربي.

التطبيق يعمل بفلسفة **المحلي أولاً (Local-First)** بدعم كامل للعمل بدون إنترنت (Offline)، ومزامنة سحابية اختيارية عبر Supabase، مع تقديم تجربة استخدام فائقة السرعة تتيح تسجيل المصروف في أقل من 5 ثوانٍ (**Quick Add**).

---

## 2. أهداف التصميم (Design Objectives)

1. **السرعة القصوى في الإدخال**: تقليل عدد النقرات والخطوات اللازمة لتسجيل المصروف اليومي لأدنى حد ممكن.
2. **الوضوح المالي القاطع**: الفصل التام بين الأموال السائلة المتاحة، التزامات بطاقات الائتمان، وصافي المركز المالي، وتجنب خلط الديون بالأصول.
3. **تصميم عربي أصيل (RTL-Native)**: واجهة مصممة ومبنية من اليمين لليسار في كافة أبعادها ومكوناتها، وليس مجرد قلب شكلي لواجهة إنجليزية.
4. **تخفيف العبء الذهني (Cognitive Load)**: واجهة هادئة، خالية من الزخارف غير الوظيفية، مريحة للعين أثناء الاستخدام اليومي المتكرر.
5. **التجاوب الذكي**: تجربة هاتف محمول مريحة لاستخدام الإبهام بيد واحدة، وتجربة سطح مكتب تستغل الشاشات العريضة لتسهيل مراجعة الحسابات والتقارير.
6. **شفافية الاتصال والمزامنة**: إيضاح حالة حفظ البيانات محلياً وحالة الاتصال والمزامنة السحابية بشكل بديهي دون إزعاج.

---

## 3. خريطة ملفات النظام التصميمي (Directory Structure)

يحتوي مجلد `design-system/` على الوثائق التخصصية التالية:

| الملف | الوصف ومحتوى الوثيقة |
|---|---|
| [README.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/README.md) | بوابة النظام التصميمي، الفلسفة العامة، وقواعد الحوكمة |
| [design-principles.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/design-principles.md) | المبادئ التوجيهية لاتخاذ قرارات التصميم والتفاعل |
| [visual-direction.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/visual-direction.md) | الهوية البصرية، أسلوب الواجهة، واللغة التعبيرية للمنتج |
| [design-tokens.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/design-tokens.md) | متغيرات التصميم (Tokens) الجاهزة للتحويل إلى CSS Variables |
| [typography.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/typography.md) | قواعد الخطوط العربية، الأوزان، الأحجام، وتنسيق الأرقام والعملات |
| [colors.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/colors.md) | لوحة الألوان الدلالية (الوضع الفاتح والداكن)، وحالات العمليات المالية |
| [spacing-layout.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/spacing-layout.md) | نظام المسافات (8pt Grid)، هوامش الشاشات، وإيقاع المحاذاة |
| [responsive-system.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/responsive-system.md) | سلوك الشاشات ونقاط التوقف والتكيف بين الموبايل وسطح المكتب |
| [rtl-guidelines.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/rtl-guidelines.md) | معايير وتحديات اتجاه اليمين-إلى-اليسار (الأيقونات، الأرقام، العملات) |
| [navigation.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/navigation.md) | هيكلية التنقل (شريط التنقل السفلي للهاتف، والقائمة الجانبية للابتوب) |
| [components.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/components.md) | مواصفات المكونات البرمجية القابلة لإعادة الاستخدام وحالاتها |
| [forms.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/forms.md) | نماذج الإدخال، تدفق التسجيل السريع (Quick Add)، والتحقق من الأخطاء |
| [data-visualization.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/data-visualization.md) | الرسوم البيانية، مخططات التدفق، وعرض المؤشرات المالية |
| [states-feedback.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/states-feedback.md) | حالات النظام (الفراغ، التحميل، الأخطاء، الاتصال، المزامنة، الأمان) |
| [accessibility.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/accessibility.md) | معايير إتاحة الاستخدام (WCAG 2.1 AA)، لوحة المفاتيح، والتباين |
| [screens.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/screens.md) | مواصفات تفصيلية لكل شاشة وواجهة في التطبيق |
| [user-flows.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/user-flows.md) | تدفقات المستخدم الرئيسية خطوة بخطوة من البداية للنهاية |
| [content-guidelines.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/content-guidelines.md) | دليل الكتابة وتجربة المحتوى العربي وقاموس المصطلحات المعتمدة |
| [interaction-guidelines.md](file:///f:/SHADI/2-Programming/Expense%20Tracker%20App/expense-tracker/design-system/interaction-guidelines.md) | قواعد التفاعل، أوقات الحركة (Motion)، واختصارات لوحة المفاتيح |

---

## 4. القواعد الملزمة للمطورين (Governance & Freezing Rules)

1. **الالتزام بالـ Tokens**: يمنع منعاً باتاً كتابة قيم ألوان ثابتة (Hardcoded Hex/RGB) أو مسافات عشوائية بالبكسل داخل ملفات المكونات؛ يجب استخدام متغيرات CSS المعرفة في `design-tokens.md`.
2. **أصالة اتجاه RTL**: عند إضافة أي عنصر جديد، يجب اختباره والتأكد من اتجاهه الطبيعي في العربية (محاذاة النصوص، هوامش البداية والنهاية `inline-start` / `inline-end`، واتجاه الأسهم).
3. **عدم فرض حركات تجميلية**: الحركة (Motion) في التطبيق وظيفية بحتة، تستخدم لتوضيح ظهور النوافذ وتأكيد الإجراءات، وتلتزم بأوقات استجابة سريعة (150ms - 250ms) وتدعم `prefers-reduced-motion`.
4. **تعديل النظام التصميمي أولاً**: في حال ظهور حاجة فعلية لتعديل نمط أو إضافة مكون، يتم تحديث وثيقة التصميم ذات العلاقة أولاً، ثم تطبيق التعديل برمجياً، لمنع حدوث أي فجوة بين التوثيق والواجهات الفعلية.
