/**
 * @file csvExport.js
 * @description High-Reliability UTF-8 BOM CSV Export Engine for Financial Transactions.
 *
 * Implements:
 * - RFC 4180 compliant CSV serialization (field escaping, quotes doubling, CRLF line endings).
 * - UTF-8 Byte Order Mark (\uFEFF) encoding for seamless Arabic rendering in Microsoft Excel,
 *   Apple Numbers, and Google Sheets without font corruption or mojibake.
 * - Anti-CSV Formula Injection sanitization for user-generated text fields.
 * - ISO 4217 integer minor units to major units decimal conversion.
 * - Full Arabic-first header mapping with optional English support.
 * - Single-record internal transfer formatting (source -> destination accounts).
 * - Automatic relation enrichment (Category and Account names) from database or lookup maps.
 * - Support for exporting all transactions or filtered subsets.
 *
 * @see project-summary.md § 22, 24, FR-15
 * @see design-system/screens.md § 2 (زر تصدير CSV)
 * @see design-system/user-flows.md § 10
 * @see ADR-002, ADR-004, ADR-011
 */

import { db } from '../db/db.js';
import { toMajorUnitsString, DEFAULT_CURRENCY_CODE } from './currency.js';
import { getBaseCurrency } from '../services/currencyLock.js';

/**
 * UTF-8 Byte Order Mark (BOM).
 * Required by Excel on Windows/macOS to recognize UTF-8 encoding for Arabic characters.
 */
export const UTF8_BOM = '\uFEFF';

/**
 * Standard CRLF line terminator for RFC 4180 CSV compliance.
 */
export const CRLF = '\r\n';

/**
 * Standard Arabic Column Definitions
 */
export const CSV_COLUMNS_AR = Object.freeze([
  { id: 'id', label: 'المعرف' },
  { id: 'date', label: 'التاريخ' },
  { id: 'type', label: 'نوع المعاملة' },
  { id: 'amount', label: 'المبلغ' },
  { id: 'currency', label: 'العملة' },
  { id: 'category', label: 'التصنيف' },
  { id: 'account', label: 'الحساب' },
  { id: 'destinationAccount', label: 'إلى حساب' },
  { id: 'paymentMethod', label: 'طريقة الدفع' },
  { id: 'notes', label: 'الملاحظات' },
  { id: 'tags', label: 'الوسوم' },
  { id: 'createdAt', label: 'تاريخ التسجيل' }
]);

/**
 * Standard English Column Definitions (Fallback / Alternative)
 */
export const CSV_COLUMNS_EN = Object.freeze([
  { id: 'id', label: 'Transaction ID' },
  { id: 'date', label: 'Date' },
  { id: 'type', label: 'Type' },
  { id: 'amount', label: 'Amount' },
  { id: 'currency', label: 'Currency' },
  { id: 'category', label: 'Category' },
  { id: 'account', label: 'Account' },
  { id: 'destinationAccount', label: 'Destination Account' },
  { id: 'paymentMethod', label: 'Payment Method' },
  { id: 'notes', label: 'Notes' },
  { id: 'tags', label: 'Tags' },
  { id: 'createdAt', label: 'Created At' }
]);

/**
 * Localized Transaction Type Labels
 */
export const TRANSACTION_TYPE_LABELS = Object.freeze({
  ar: {
    expense: 'مصروف',
    income: 'دخل',
    transfer: 'تحويل'
  },
  en: {
    expense: 'Expense',
    income: 'Income',
    transfer: 'Transfer'
  }
});

/**
 * Fallback category labels for transfers
 */
export const TRANSFER_CATEGORY_LABEL = {
  ar: 'تحويل مالي',
  en: 'Internal Transfer'
};

/**
 * Escapes a single CSV field value adhering to RFC 4180.
 * Also mitigates spreadsheet formula injection (CSV Injection) attacks
 * when user text starts with =, +, -, @, \t, or \r.
 *
 * @param {unknown} value - Raw field value.
 * @param {object} [options={}]
 * @param {boolean} [options.sanitizeFormulas=true] - Whether to prefix formula-trigger chars with a single quote.
 * @returns {string} Escaped and quoted CSV field.
 */
export function escapeCsvField(value, options = {}) {
  const { sanitizeFormulas = true } = options;

  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // CSV Formula Injection mitigation:
  // If text starts with =, +, -, @, \t, or \r, Excel and Google Sheets can execute formulas.
  // We prefix with a single quote (') unless it's a valid standard number (e.g. -12.50 or 50).
  if (sanitizeFormulas && str.length > 0) {
    const isFormulaPrefix = /^([=+\-@\t\r])/.test(str);
    const isStandardNumber = /^-?\d+(\.\d+)?$/.test(str.trim());

    if (isFormulaPrefix && !isStandardNumber) {
      str = `'${str}`;
    }
  }

  // RFC 4180 escaping:
  // If string contains comma, double quote, newline, carriage return, or leading/trailing whitespace
  const needsQuotes = /[",\r\n]/.test(str) || str.startsWith(' ') || str.endsWith(' ');

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serializes headers and tabular row data into a UTF-8 BOM CSV formatted string.
 *
 * @param {string[]} headers - Array of header title strings.
 * @param {Array<Array<unknown>>} rows - 2D array of row cells.
 * @param {object} [options={}]
 * @param {boolean} [options.withBom=true] - Whether to prepend UTF-8 Byte Order Mark (\uFEFF).
 * @param {boolean} [options.sanitizeFormulas=true] - Whether to sanitize spreadsheet formulas.
 * @returns {string} Complete serialized CSV string.
 */
export function generateCsv(headers, rows, options = {}) {
  const { withBom = true, sanitizeFormulas = true } = options;

  const headerLine = headers.map((h) => escapeCsvField(h, { sanitizeFormulas: false })).join(',');
  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvField(cell, { sanitizeFormulas })).join(',')
  );

  const lines = [headerLine, ...dataLines];
  const content = lines.join(CRLF);

  return withBom ? `${UTF8_BOM}${content}` : content;
}

/**
 * Resolves related entity names (Category and Account) for a given transaction.
 *
 * @param {object} transaction
 * @param {object} [lookups={}]
 * @param {Map<string, object>|Array<object>} [lookups.categories]
 * @param {Map<string, object>|Array<object>} [lookups.accounts]
 * @returns {{ categoryName: string, accountName: string, destinationAccountName: string }}
 */
export function resolveTransactionRelations(transaction, lookups = {}) {
  const { categories, accounts } = lookups;

  // 1. Resolve Category Name
  let categoryName = transaction.categoryName || transaction.category?.name || '';
  if (!categoryName && transaction.category_id && categories) {
    if (categories instanceof Map) {
      categoryName = categories.get(transaction.category_id)?.name || '';
    } else if (Array.isArray(categories)) {
      categoryName = categories.find((c) => c.id === transaction.category_id)?.name || '';
    }
  }

  // 2. Resolve Source Account Name
  let accountName = transaction.accountName || transaction.account?.name || '';
  if (!accountName && transaction.account_id && accounts) {
    if (accounts instanceof Map) {
      accountName = accounts.get(transaction.account_id)?.name || '';
    } else if (Array.isArray(accounts)) {
      accountName = accounts.find((a) => a.id === transaction.account_id)?.name || '';
    }
  }

  // 3. Resolve Destination Account Name
  let destinationAccountName =
    transaction.destinationAccountName || transaction.destinationAccount?.name || '';
  if (!destinationAccountName && transaction.destination_account_id && accounts) {
    if (accounts instanceof Map) {
      destinationAccountName = accounts.get(transaction.destination_account_id)?.name || '';
    } else if (Array.isArray(accounts)) {
      destinationAccountName =
        accounts.find((a) => a.id === transaction.destination_account_id)?.name || '';
    }
  }

  return {
    categoryName,
    accountName,
    destinationAccountName
  };
}

/**
 * Formats a single transaction record into an array of cell values matching the CSV columns.
 *
 * @param {object} tx - Transaction record.
 * @param {object} [options={}]
 * @param {string} [options.language='ar'] - Language for labels ('ar' | 'en').
 * @param {string} [options.baseCurrency=DEFAULT_CURRENCY_CODE] - Fallback currency code.
 * @param {object} [options.lookups={}] - Lookup tables for categories and accounts.
 * @param {boolean} [options.signedAmounts=false] - Whether to prefix expenses with a minus sign.
 * @returns {Array<string|number>}
 */
export function formatTransactionRow(tx, options = {}) {
  const {
    language = 'ar',
    baseCurrency = DEFAULT_CURRENCY_CODE,
    lookups = {},
    signedAmounts = false
  } = options;

  const relations = resolveTransactionRelations(tx, lookups);
  const currencyCode = tx.currency || baseCurrency;

  // Format type
  const typeMap = TRANSACTION_TYPE_LABELS[language] || TRANSACTION_TYPE_LABELS.ar;
  const typeLabel = typeMap[tx.type] || tx.type || '';

  // Format amount
  const rawMajorUnits = toMajorUnitsString(tx.amount, currencyCode);
  let amountStr = rawMajorUnits;
  if (signedAmounts && tx.type === 'expense' && !rawMajorUnits.startsWith('-')) {
    amountStr = `-${rawMajorUnits}`;
  }

  // Format category
  let categoryLabel = relations.categoryName;
  if (tx.type === 'transfer') {
    categoryLabel = relations.categoryName || (TRANSFER_CATEGORY_LABEL[language] || TRANSFER_CATEGORY_LABEL.ar);
  }

  // Format tags
  const tags = Array.isArray(tx.tags)
    ? tx.tags.join(', ')
    : typeof tx.tags === 'string'
      ? tx.tags
      : '';

  return [
    tx.id || '',
    tx.date || '',
    typeLabel,
    amountStr,
    currencyCode,
    categoryLabel,
    relations.accountName,
    relations.destinationAccountName,
    tx.payment_method || '',
    tx.notes || '',
    tags,
    tx.created_at || ''
  ];
}

/**
 * Generates a full CSV string from an array of transaction records.
 *
 * @param {Array<object>} transactions - Array of transactions.
 * @param {object} [options={}]
 * @param {'ar'|'en'} [options.language='ar'] - Language for column headers and labels.
 * @param {string} [options.baseCurrency=DEFAULT_CURRENCY_CODE] - Base currency code.
 * @param {object} [options.lookups={}] - Category and Account maps or arrays.
 * @param {boolean} [options.includeDeleted=false] - Whether to include soft-deleted records.
 * @param {boolean} [options.withBom=true] - Whether to include UTF-8 BOM.
 * @param {boolean} [options.sanitizeFormulas=true] - Whether to sanitize formulas.
 * @param {boolean} [options.signedAmounts=false] - Whether expense amounts should be negative.
 * @returns {string} Serialized CSV text.
 */
export function generateTransactionsCsv(transactions = [], options = {}) {
  const {
    language = 'ar',
    baseCurrency = DEFAULT_CURRENCY_CODE,
    includeDeleted = false,
    withBom = true,
    sanitizeFormulas = true,
    signedAmounts = false,
    lookups = {}
  } = options;

  const columns = language === 'en' ? CSV_COLUMNS_EN : CSV_COLUMNS_AR;
  const headers = columns.map((col) => col.label);

  const activeTransactions = includeDeleted
    ? transactions
    : transactions.filter((tx) => tx.deleted_at === null);

  const rows = activeTransactions.map((tx) =>
    formatTransactionRow(tx, {
      language,
      baseCurrency,
      lookups,
      signedAmounts
    })
  );

  return generateCsv(headers, rows, { withBom, sanitizeFormulas });
}

/**
 * Creates a browser-downloadable Blob from CSV string content.
 *
 * @param {string} csvContent
 * @returns {Blob}
 */
export function createCsvBlob(csvContent) {
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Generates a standard standardized filename for transaction exports.
 * Format: `masareef-transactions-YYYY-MM-DD.csv` or with custom prefix.
 *
 * @param {string} [prefix='masareef-transactions']
 * @param {Date} [referenceDate=new Date()]
 * @returns {string}
 */
export function generateCsvFilename(prefix = 'masareef-transactions', referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${prefix}-${year}-${month}-${day}.csv`;
}

/**
 * Triggers a file download in the browser environment.
 * Safely handles server/Node.js testing environments where DOM may not be present.
 *
 * @param {string|Blob} content - CSV string or Blob.
 * @param {string} filename - Target file name.
 * @returns {{ success: boolean, filename: string, isBrowser: boolean }}
 */
export function downloadCsvFile(content, filename) {
  const isBrowser =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function';

  const blob = typeof content === 'string' ? createCsvBlob(content) : content;

  if (!isBrowser) {
    return { success: true, filename, isBrowser: false, blob };
  }

  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup after short microtask
    setTimeout(() => {
      if (typeof document !== 'undefined' && document.body && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(url);
      }
    }, 150);

    return { success: true, filename, isBrowser: true };
  } catch (err) {
    console.error('Failed to initiate CSV file download:', err);
    return { success: false, filename, isBrowser: true, error: err };
  }
}

/**
 * High-level orchestration function to export transactions to CSV.
 * Fetches required lookups and currency from the database if not provided,
 * generates the CSV string and Blob, and optionally triggers download.
 *
 * @param {object} [options={}]
 * @param {import('../db/db.js').ExpenseDatabase} [options.database=db]
 * @param {Array<object>} [options.transactions] - Custom transaction list (e.g. filtered). If omitted, loads all active from DB.
 * @param {boolean} [options.download=true] - Whether to automatically trigger browser download.
 * @param {string} [options.filename] - Custom file name.
 * @param {'ar'|'en'} [options.language='ar'] - Language.
 * @param {boolean} [options.signedAmounts=false] - Whether expense amounts should be negative.
 * @returns {Promise<{ csv: string, blob: Blob, count: number, filename: string, success: boolean }>}
 */
export async function exportTransactions(options = {}) {
  const {
    database = db,
    transactions: providedTransactions = null,
    download = true,
    filename: customFilename = null,
    language = 'ar',
    signedAmounts = false
  } = options;

  // 1. Fetch lookups & currency in parallel
  const [catList, accList, baseCurrency] = await Promise.all([
    database.categories.toArray(),
    database.accounts.toArray(),
    getBaseCurrency(database)
  ]);

  const catMap = new Map(catList.map((c) => [c.id, c]));
  const accMap = new Map(accList.map((a) => [a.id, a]));

  // 2. Fetch transactions if not directly provided
  let txList = providedTransactions;
  if (!txList) {
    txList = await database.transactions
      .filter((t) => t.deleted_at === null)
      .toArray();
    // Sort descending by date, then created_at
    txList.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }

  // 3. Generate CSV
  const csv = generateTransactionsCsv(txList, {
    language,
    baseCurrency,
    lookups: { categories: catMap, accounts: accMap },
    signedAmounts
  });

  const blob = createCsvBlob(csv);
  const filename = customFilename || generateCsvFilename('masareef-transactions');

  // 4. Download if requested
  let downloadResult = { success: true };
  if (download) {
    downloadResult = downloadCsvFile(blob, filename);
  }

  return {
    csv,
    blob,
    count: txList.length,
    filename,
    success: downloadResult.success
  };
}
