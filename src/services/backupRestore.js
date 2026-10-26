/**
 * @module backupRestore
 * @description خدمة النسخ الاحتياطي والاستعادة الذرية (F016)
 *
 * تنفّذ خط أنابيب النسخ الاحتياطي بصيغة JSON والاستعادة الذرية المكوّن من 6 خطوات:
 * 1. التحقق من بنية الملف وإصدار المخطط
 * 2. معاينة البيانات الوصفية للنسخة الاحتياطية
 * 3. تأكيد صريح من المستخدم (طبقة واجهة المستخدم)
 * 4. إنشاء لقطة أمان تلقائية قبل الاستعادة
 * 5. تنفيذ ذري داخل معاملة Dexie واحدة
 * 6. استعادة لقطة الأمان في حال حدوث خطأ
 */

import { db } from '../db/db.js';

// ─── الثوابت ────────────────────────────────────────────────────────────────

/** إصدار مخطط ملف النسخ الاحتياطي */
export const BACKUP_SCHEMA_VERSION = 1;

/** الجداول الأساسية المشمولة في التصدير (بدون جداول المزامنة المؤقتة) */
export const BACKUP_TABLES = ['accounts', 'categories', 'transactions', 'settings'];

/** جميع الجداول المشمولة في لقطة الأمان (تشمل جداول المزامنة المؤقتة) */
const SNAPSHOT_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'settings',
  'offline_mutation_queue',
  'conflict_audit_log',
];

// ─── أصناف الأخطاء ─────────────────────────────────────────────────────────

/**
 * خطأ التحقق من بنية ملف النسخ الاحتياطي
 */
export class BackupValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

/**
 * خطأ أثناء عملية الاستعادة
 */
export class BackupRestoreError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'BackupRestoreError';
  }
}

// ─── دوال مساعدة ────────────────────────────────────────────────────────────

/**
 * يقرأ جميع السجلات من الجداول المحددة
 * @param {import('../db/db.js').ExpenseDatabase} database - مثيل قاعدة البيانات
 * @param {string[]} tableNames - أسماء الجداول المراد قراءتها
 * @returns {Promise<Record<string, any[]>>} كائن يحتوي على بيانات كل جدول
 */
async function readAllTables(database, tableNames) {
  /** @type {Record<string, any[]>} */
  const result = {};
  for (const name of tableNames) {
    result[name] = await database[name].toArray();
  }
  return result;
}

/**
 * يستخرج العملة الأساسية من مصفوفة الإعدادات
 * @param {Array<{key: string, value: any}>} settingsArray - سجلات جدول الإعدادات
 * @returns {string|null} العملة الأساسية أو null إذا لم تكن معرّفة
 */
function extractBaseCurrency(settingsArray) {
  const entry = settingsArray.find((s) => s.key === 'base_currency');
  return entry ? entry.value : null;
}

// ─── الدوال الرئيسية ────────────────────────────────────────────────────────

/**
 * ينشئ نسخة احتياطية كاملة لجميع البيانات الأساسية
 *
 * يقرأ جميع السجلات (بما فيها المحذوفة حذفاً ناعماً) من الجداول الأساسية
 * ويعيد كائناً قابلاً للتسلسل كـ JSON.
 *
 * @param {import('../db/db.js').ExpenseDatabase} [database=db] - مثيل قاعدة البيانات
 * @returns {Promise<object>} كائن النسخة الاحتياطية
 */
export async function createBackup(database = db) {
  const data = await readAllTables(database, BACKUP_TABLES);

  const baseCurrency = extractBaseCurrency(data.settings);

  return {
    schema_version: BACKUP_SCHEMA_VERSION,
    app_name: 'ExpenseTrackerApp',
    created_at: new Date().toISOString(),
    metadata: {
      account_count: data.accounts.length,
      category_count: data.categories.length,
      transaction_count: data.transactions.length,
      base_currency: baseCurrency,
    },
    data,
  };
}

/**
 * ينشئ نسخة احتياطية ويطلق تنزيلها كملف JSON في المتصفح
 *
 * يستخدم تقنية Blob + URL.createObjectURL + نقرة وهمية لتحفيز التنزيل.
 *
 * @param {import('../db/db.js').ExpenseDatabase} [database=db] - مثيل قاعدة البيانات
 * @returns {Promise<{filename: string, size: number, metadata: object}>} معلومات التنزيل
 */
export async function downloadBackup(database = db) {
  const backup = await createBackup(database);
  const jsonString = JSON.stringify(backup, null, 2);

  // تحديد اسم الملف بصيغة: expense-tracker-backup-YYYY-MM-DD.json
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `expense-tracker-backup-${dateStr}.json`;

  // إنشاء Blob وتحفيز التنزيل عبر رابط مؤقت
  const blob = new Blob([jsonString], { type: 'application/json' });

  const isBrowser =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function';

  if (isBrowser && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();

    // تنظيف: إزالة العنصر وتحرير الرابط المؤقت
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return {
    filename,
    size: blob.size,
    metadata: backup.metadata,
  };
}

/**
 * يتحقق من صحة بنية ملف النسخة الاحتياطية
 *
 * يتأكد من:
 * - أنّ البيانات كائن (وليست null أو مصفوفة)
 * - وجود خاصية `schema_version` تساوي الإصدار المتوقع
 * - وجود خاصية `data` ككائن يحتوي على المصفوفات الأربع الأساسية
 *
 * @param {any} data - البيانات المُحلّلة من ملف JSON
 * @returns {{ valid: true, metadata: object }} نتيجة التحقق الناجح
 * @throws {BackupValidationError} عند فشل التحقق
 */
export function validateBackupFile(data) {
  // التحقق من أنّ البيانات كائن صالح
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح: يجب أن يكون كائن JSON');
  }

  // التحقق من وجود إصدار المخطط
  if (data.schema_version === undefined || data.schema_version === null) {
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح: خاصية schema_version مفقودة');
  }

  // التحقق من تطابق إصدار المخطط
  if (data.schema_version !== BACKUP_SCHEMA_VERSION) {
    throw new BackupValidationError(
      `إصدار مخطط النسخة الاحتياطية غير متوافق: المتوقع ${BACKUP_SCHEMA_VERSION}، الموجود ${data.schema_version}`
    );
  }

  // التحقق من وجود كائن data
  if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) {
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح: خاصية data مفقودة أو غير صالحة');
  }

  // التحقق من وجود المصفوفات الأساسية الأربع
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(data.data[table])) {
      throw new BackupValidationError(
        `ملف النسخة الاحتياطية غير صالح: الجدول "${table}" مفقود أو ليس مصفوفة`
      );
    }
  }

  // بناء البيانات الوصفية من الملف أو حسابها من البيانات
  const metadata = data.metadata || {
    account_count: data.data.accounts.length,
    category_count: data.data.categories.length,
    transaction_count: data.data.transactions.length,
    base_currency: extractBaseCurrency(data.data.settings),
  };

  return { valid: true, metadata };
}

/**
 * يقرأ ملف النسخة الاحتياطية ويحلّله ويتحقق من صحته
 *
 * يأخذ كائن File من متصفح الملفات ويعالجه بالكامل.
 *
 * @param {File} file - كائن File من عنصر input[type="file"]
 * @returns {Promise<{metadata: object, data: object}>} البيانات الوصفية والبيانات المُتحقّق منها
 * @throws {BackupValidationError} عند فشل القراءة أو التحليل أو التحقق
 */
export async function parseBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch (error) {
    throw new BackupValidationError(`فشل قراءة الملف: ${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new BackupValidationError(`فشل تحليل JSON: ${error.message}`);
  }

  // التحقق من البنية (يرمي BackupValidationError عند الفشل)
  const { metadata } = validateBackupFile(parsed);

  return { metadata, data: parsed.data };
}

/**
 * يستخرج ملخص البيانات الوصفية لعرضه في معاينة الاستعادة
 *
 * @param {object} data - كائن النسخة الاحتياطية الكامل (أو البيانات المُحلّلة)
 * @returns {{ created_at: string, base_currency: string|null, account_count: number, category_count: number, transaction_count: number }}
 */
export function previewBackupMetadata(data) {
  return {
    created_at: data.created_at || null,
    base_currency: data.metadata?.base_currency ?? extractBaseCurrency(data.data?.settings || []),
    account_count: data.metadata?.account_count ?? data.data?.accounts?.length ?? 0,
    category_count: data.metadata?.category_count ?? data.data?.categories?.length ?? 0,
    transaction_count: data.metadata?.transaction_count ?? data.data?.transactions?.length ?? 0,
  };
}

/**
 * ينشئ لقطة أمان في الذاكرة لجميع الجداول (أساسية + مزامنة)
 *
 * تُستخدم كنقطة استرجاع تلقائية قبل عملية الاستعادة.
 * تشمل جداول المزامنة المؤقتة (offline_mutation_queue, conflict_audit_log) للحفاظ الكامل على الحالة.
 *
 * @param {import('../db/db.js').ExpenseDatabase} [database=db] - مثيل قاعدة البيانات
 * @returns {Promise<object>} كائن اللقطة بنفس بنية النسخة الاحتياطية مع جداول إضافية
 */
export async function createSafetySnapshot(database = db) {
  const data = await readAllTables(database, SNAPSHOT_TABLES);

  const baseCurrency = extractBaseCurrency(data.settings);

  return {
    schema_version: BACKUP_SCHEMA_VERSION,
    app_name: 'ExpenseTrackerApp',
    created_at: new Date().toISOString(),
    metadata: {
      account_count: data.accounts.length,
      category_count: data.categories.length,
      transaction_count: data.transactions.length,
      base_currency: baseCurrency,
    },
    data,
  };
}

/**
 * يستعيد البيانات من لقطة أمان بشكل ذري
 *
 * يُستخدم للتراجع عن عملية استعادة فاشلة.
 * يمسح جميع جداول اللقطة ويعيد إدخال بياناتها ضمن معاملة واحدة.
 *
 * @param {object} snapshot - كائن لقطة الأمان
 * @param {import('../db/db.js').ExpenseDatabase} [database=db] - مثيل قاعدة البيانات
 * @returns {Promise<void>}
 * @throws {BackupRestoreError} عند فشل الاستعادة من اللقطة
 */
export async function restoreFromSafetySnapshot(snapshot, database = db) {
  try {
    const tableNames = Object.keys(snapshot.data);
    const dexieTables = tableNames.map((name) => database[name]);

    await database.transaction('rw', dexieTables, async () => {
      for (const name of tableNames) {
        await database[name].clear();
      }
      for (const name of tableNames) {
        if (snapshot.data[name].length > 0) {
          await database[name].bulkAdd(snapshot.data[name]);
        }
      }
    });
  } catch (error) {
    throw new BackupRestoreError(
      `فشل الاستعادة من لقطة الأمان: ${error.message}`
    );
  }
}

/**
 * ينفّذ الاستعادة الذرية من ملف نسخ احتياطي
 *
 * خط الأنابيب الكامل:
 * 1. التحقق من صحة بنية البيانات
 * 2. إنشاء لقطة أمان تلقائية
 * 3. تنفيذ الاستعادة ذرياً (مسح + إدخال جماعي) داخل معاملة Dexie
 * 4. في حال فشل الخطوة 3، استعادة لقطة الأمان تلقائياً
 *
 * @param {object} data - كائن النسخة الاحتياطية الكامل (بعد التحليل)
 * @param {import('../db/db.js').ExpenseDatabase} [database=db] - مثيل قاعدة البيانات
 * @returns {Promise<{success: true, metadata: object, safety_snapshot: object}>} نتيجة الاستعادة الناجحة
 * @throws {BackupRestoreError} عند فشل الاستعادة (بعد محاولة التراجع)
 */
export async function restoreFromBackup(data, database = db) {
  // الخطوة 1: التحقق من صحة البيانات
  let metadata;
  try {
    ({ metadata } = validateBackupFile(data));
  } catch (error) {
    throw new BackupRestoreError(`فشل التحقق قبل الاستعادة: ${error.message}`);
  }

  // الخطوة 2: إنشاء لقطة أمان تلقائية
  let safetySnapshot;
  try {
    safetySnapshot = await createSafetySnapshot(database);
  } catch (error) {
    throw new BackupRestoreError(`فشل إنشاء لقطة الأمان: ${error.message}`);
  }

  // الخطوة 3: تنفيذ الاستعادة ذرياً
  try {
    const dexieTables = BACKUP_TABLES.map((name) => database[name]);

    await database.transaction('rw', dexieTables, async () => {
      // مسح جميع الجداول الأساسية
      for (const name of BACKUP_TABLES) {
        await database[name].clear();
      }
      // إدخال جميع السجلات من النسخة الاحتياطية
      for (const name of BACKUP_TABLES) {
        if (data.data[name].length > 0) {
          await database[name].bulkAdd(data.data[name]);
        }
      }
    });
  } catch (restoreError) {
    // الخطوة 4: محاولة التراجع عبر لقطة الأمان
    try {
      await restoreFromSafetySnapshot(safetySnapshot, database);
    } catch (rollbackError) {
      throw new BackupRestoreError(
        `فشل الاستعادة وفشل التراجع أيضاً. خطأ الاستعادة: ${restoreError.message}. خطأ التراجع: ${rollbackError.message}`
      );
    }
    throw new BackupRestoreError(
      `فشل الاستعادة وتم التراجع بنجاح إلى الحالة السابقة: ${restoreError.message}`
    );
  }

  return { success: true, metadata, safety_snapshot: safetySnapshot };
}
