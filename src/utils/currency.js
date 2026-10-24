/**
 * @file currency.js
 * @description ISO 4217 Monetary Precision & Minor Units Engine.
 *
 * All monetary amounts in the database and internal accounting calculations
 * are strictly stored and manipulated as Integer Minor Units (e.g., cents, fils).
 * This eliminates floating-point rounding errors (e.g., 0.1 + 0.2 !== 0.3)
 * across ledgers, balances, and sync payloads.
 *
 * @see docs/financial-rules.md
 * @see DECISIONS.md (ADR-002)
 */

/**
 * Supported ISO 4217 Currency Metadata.
 */
export const CURRENCIES = Object.freeze({
  SAR: {
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbolAr: 'ر.س',
    symbolEn: 'SAR',
    exponent: 2,
    flag: '🇸🇦',
  },
  USD: {
    code: 'USD',
    nameAr: 'دولار أمريكي',
    nameEn: 'US Dollar',
    symbolAr: '$',
    symbolEn: '$',
    exponent: 2,
    flag: '🇺🇸',
  },
  EUR: {
    code: 'EUR',
    nameAr: 'يورو',
    nameEn: 'Euro',
    symbolAr: '€',
    symbolEn: '€',
    exponent: 2,
    flag: '🇪🇺',
  },
  AED: {
    code: 'AED',
    nameAr: 'درهم إماراتي',
    nameEn: 'UAE Dirham',
    symbolAr: 'د.إ',
    symbolEn: 'AED',
    exponent: 2,
    flag: '🇦🇪',
  },
  EGP: {
    code: 'EGP',
    nameAr: 'جنيه مصري',
    nameEn: 'Egyptian Pound',
    symbolAr: 'ج.م',
    symbolEn: 'EGP',
    exponent: 2,
    flag: '🇪🇬',
  },
  KWD: {
    code: 'KWD',
    nameAr: 'دينار كويتي',
    nameEn: 'Kuwaiti Dinar',
    symbolAr: 'د.ك',
    symbolEn: 'KWD',
    exponent: 3,
    flag: '🇰🇼',
  },
  BHD: {
    code: 'BHD',
    nameAr: 'دينار بحريني',
    nameEn: 'Bahraini Dinar',
    symbolAr: 'د.ب',
    symbolEn: 'BHD',
    exponent: 3,
    flag: '🇧🇭',
  },
  OMR: {
    code: 'OMR',
    nameAr: 'ريال عماني',
    nameEn: 'Omani Rial',
    symbolAr: 'ر.ع',
    symbolEn: 'OMR',
    exponent: 3,
    flag: '🇴🇲',
  },
  QAR: {
    code: 'QAR',
    nameAr: 'ريال قطري',
    nameEn: 'Qatari Riyal',
    symbolAr: 'ر.ق',
    symbolEn: 'QAR',
    exponent: 2,
    flag: '🇶🇦',
  },
  JOD: {
    code: 'JOD',
    nameAr: 'دينار أردني',
    nameEn: 'Jordanian Dinar',
    symbolAr: 'د.أ',
    symbolEn: 'JOD',
    exponent: 3,
    flag: '🇯🇴',
  },
  GBP: {
    code: 'GBP',
    nameAr: 'جنيه إسترليني',
    nameEn: 'British Pound',
    symbolAr: '£',
    symbolEn: '£',
    exponent: 2,
    flag: '🇬🇧',
  },
  JPY: {
    code: 'JPY',
    nameAr: 'ين ياباني',
    nameEn: 'Japanese Yen',
    symbolAr: '¥',
    symbolEn: '¥',
    exponent: 0,
    flag: '🇯🇵',
  },
  KRW: {
    code: 'KRW',
    nameAr: 'وون كوري',
    nameEn: 'South Korean Won',
    symbolAr: '₩',
    symbolEn: '₩',
    exponent: 0,
    flag: '🇰🇷',
  },
  IQD: {
    code: 'IQD',
    nameAr: 'دينار عراقي',
    nameEn: 'Iraqi Dinar',
    symbolAr: 'د.ع',
    symbolEn: 'IQD',
    exponent: 3,
    flag: '🇮🇶',
  },
  TRY: {
    code: 'TRY',
    nameAr: 'ليرة تركية',
    nameEn: 'Turkish Lira',
    symbolAr: '₺',
    symbolEn: 'TRY',
    exponent: 2,
    flag: '🇹🇷',
  },
});

/** Default system base currency code */
export const DEFAULT_CURRENCY_CODE = 'SAR';

/**
 * Retrieves currency metadata by ISO code.
 * Falls back to 2 decimal places if the currency code is unregistered.
 *
 * @param {string} [code=DEFAULT_CURRENCY_CODE] ISO 4217 currency code
 * @returns {object} Currency configuration object
 */
export function getCurrency(code = DEFAULT_CURRENCY_CODE) {
  if (!code || typeof code !== 'string') {
    return { ...CURRENCIES[DEFAULT_CURRENCY_CODE], multiplier: 10 ** CURRENCIES[DEFAULT_CURRENCY_CODE].exponent };
  }
  const upper = code.trim().toUpperCase();
  const found = CURRENCIES[upper];
  if (found) {
    return { ...found, multiplier: 10 ** found.exponent };
  }
  return {
    code: upper,
    nameAr: upper,
    nameEn: upper,
    symbolAr: upper,
    symbolEn: upper,
    exponent: 2,
    multiplier: 100,
    flag: '🌐',
  };
}

/**
 * Returns an array of all pre-registered ISO 4217 currencies.
 * @returns {Array<object>}
 */
export function getAllCurrencies() {
  return Object.values(CURRENCIES).map((c) => ({
    ...c,
    multiplier: 10 ** c.exponent,
  }));
}

/**
 * Normalizes user input string:
 * - Translates Eastern Arabic and Arabic-Indic numerals to Latin 0-9
 * - Normalizes Arabic decimal separator (٫) to dot (.)
 * - Handles thousands commas vs decimal points
 *
 * @param {string|number} input
 * @param {number} exponent
 * @returns {{ cleanStr: string, sign: number }}
 */
function normalizeNumericInput(input, exponent = 2) {
  if (input === null || input === undefined) {
    return { cleanStr: '', sign: 1 };
  }

  let str = String(input).trim();
  if (!str) {
    return { cleanStr: '', sign: 1 };
  }

  // Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Latin (0-9)
  str = str.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632);
  // Convert Persian/Eastern Arabic digits (۰۱۲۳۴۵۶۷۸۹) to Latin (0-9)
  str = str.replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);
  // Convert Arabic decimal comma (U+066B ٫) to dot
  str = str.replace(/٫/g, '.');

  // Sign detection
  let sign = 1;
  if (str.startsWith('-')) {
    sign = -1;
    str = str.slice(1).trim();
  } else if (str.startsWith('+')) {
    str = str.slice(1).trim();
  }

  // Disambiguate commas and dots
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') < str.indexOf('.')) {
      // 1,234.56 -> commas are thousands separators
      str = str.replace(/,/g, '');
    } else {
      // 1.234,56 -> dots are thousands separators, comma is decimal
      str = str.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    // If only 1 comma and digits after it are <= exponent, treat as decimal point
    if (parts.length === 2 && parts[1].length <= Math.max(exponent, 2)) {
      str = str.replace(',', '.');
    } else {
      // Multiple commas or 3 digits like 1,000 -> thousand separators
      str = str.replace(/,/g, '');
    }
  }

  // Strip anything that is not a digit or decimal point
  str = str.replace(/[^\d.]/g, '');

  return { cleanStr: str, sign };
}

/**
 * Converts a major unit currency amount (number or string, e.g. "12.50" SAR)
 * to exact Integer Minor Units (e.g. 1250) without floating-point precision loss.
 *
 * @param {string|number} amount Amount in major units (e.g., 12.50, "29.99")
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 currency code
 * @returns {number} Integer minor units (e.g., 1250, 2999)
 */
export function toMinorUnits(amount, currencyCode = DEFAULT_CURRENCY_CODE) {
  if (amount === null || amount === undefined || amount === '') {
    return 0;
  }

  const { exponent } = getCurrency(currencyCode);
  const { cleanStr, sign } = normalizeNumericInput(amount, exponent);

  if (!cleanStr) {
    return 0;
  }

  const [intPart = '0', rawFracPart = ''] = cleanStr.split('.');
  const intVal = BigInt(intPart || '0');

  if (exponent === 0) {
    let result = intVal;
    // Round to nearest integer if fractional part exists
    if (rawFracPart.length > 0 && Number(rawFracPart[0]) >= 5) {
      result += 1n;
    }
    const num = Number(result * BigInt(sign));
    return num === 0 ? 0 : num;
  }

  let paddedFrac = rawFracPart.slice(0, exponent);
  while (paddedFrac.length < exponent) {
    paddedFrac += '0';
  }

  let minorVal = intVal * BigInt(10 ** exponent) + BigInt(paddedFrac);

  // Round half-up if user supplied more decimal digits than currency exponent
  if (rawFracPart.length > exponent) {
    const nextDigit = Number(rawFracPart[exponent]);
    if (nextDigit >= 5) {
      minorVal += 1n;
    }
  }

  const num = Number(minorVal * BigInt(sign));
  return num === 0 ? 0 : num;
}

/**
 * Converts integer minor units back to a standard floating-point number.
 * Use strictly for presentation or external libraries (e.g. Chart.js);
 * NEVER use for intermediate ledger balance calculations.
 *
 * @param {number} minorUnits Amount in integer minor units (e.g. 1250)
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 code
 * @returns {number} Floating-point major units (e.g. 12.5)
 */
export function toMajorUnits(minorUnits, currencyCode = DEFAULT_CURRENCY_CODE) {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) {
    return 0;
  }
  const { multiplier } = getCurrency(currencyCode);
  return Number(minorUnits) / multiplier;
}

/**
 * Converts integer minor units to an exact decimal string (e.g. "12.50").
 * Preserves exact fixed decimal places without floating-point drift.
 *
 * @param {number} minorUnits Amount in integer minor units (e.g. 1250)
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 code
 * @returns {string} Exact decimal string (e.g. "12.50", "1.250", "1000")
 */
export function toMajorUnitsString(minorUnits, currencyCode = DEFAULT_CURRENCY_CODE) {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) {
    return '0';
  }

  const { exponent, multiplier } = getCurrency(currencyCode);
  const num = Number(minorUnits);
  const isNeg = num < 0;
  const absVal = Math.abs(num);

  if (exponent === 0) {
    return `${isNeg ? '-' : ''}${absVal}`;
  }

  const intPart = Math.floor(absVal / multiplier);
  const fracPart = String(absVal % multiplier).padStart(exponent, '0');
  return `${isNeg ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Formats integer minor units for display using Intl.NumberFormat.
 * By default in Arabic locales, uses Latin digits (u-nu-latn) with standard
 * non-breaking space and Arabic currency symbols, fulfilling Arabic RTL guidelines.
 *
 * @param {number} minorUnits Amount in integer minor units
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 code
 * @param {object} [options={}] Formatting options
 * @param {string} [options.locale='ar-SA'] BCP 47 language tag
 * @param {boolean} [options.useLatinNumerals=true] Force Latin digits (0-9) for financial tabular clarity
 * @param {'auto'|'always'|'never'|'exceptZero'} [options.signDisplay='auto'] Sign display policy
 * @param {'symbol'|'narrowSymbol'|'code'|'name'} [options.currencyDisplay='symbol']
 * @returns {string} Formatted localized currency string
 */
export function formatCurrency(minorUnits, currencyCode = DEFAULT_CURRENCY_CODE, options = {}) {
  const {
    locale = 'ar-SA',
    useLatinNumerals = true,
    signDisplay = 'auto',
    currencyDisplay = 'symbol',
  } = options;

  const currency = getCurrency(currencyCode);
  const majorUnits = toMajorUnits(minorUnits, currencyCode);

  const resolvedLocale = useLatinNumerals && locale.startsWith('ar') && !locale.includes('-u-nu-')
    ? `${locale}-u-nu-latn`
    : locale;

  const formatter = new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: currency.code,
    currencyDisplay,
    signDisplay,
    minimumFractionDigits: currency.exponent,
    maximumFractionDigits: currency.exponent,
  });

  return formatter.format(majorUnits);
}

/**
 * Structured currency formatting broken into individual components.
 * Essential for rendering in RTL interfaces where numbers must have
 * isolated LTR direction (`unicode-bidi: isolate; direction: ltr;`)
 * while currency symbol sits naturally alongside it.
 *
 * @param {number} minorUnits Amount in integer minor units
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 code
 * @param {object} [options={}] Formatting options
 * @returns {object} Formatted components { formatted, formattedNumber, currencySymbol, sign, isNegative, isZero, majorUnits, raw }
 */
export function formatCurrencyParts(minorUnits, currencyCode = DEFAULT_CURRENCY_CODE, options = {}) {
  const {
    locale = 'ar-SA',
    useLatinNumerals = true,
    signDisplay = 'auto',
    currencyDisplay = 'symbol',
  } = options;

  const currency = getCurrency(currencyCode);
  const majorUnits = toMajorUnits(minorUnits, currencyCode);
  const isNegative = Number(minorUnits) < 0;
  const isZero = Number(minorUnits) === 0;

  const resolvedLocale = useLatinNumerals && locale.startsWith('ar') && !locale.includes('-u-nu-')
    ? `${locale}-u-nu-latn`
    : locale;

  const formatter = new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: currency.code,
    currencyDisplay,
    signDisplay,
    minimumFractionDigits: currency.exponent,
    maximumFractionDigits: currency.exponent,
  });

  const parts = formatter.formatToParts(majorUnits);
  let sign = '';
  let currencySymbol = currency.symbolAr || currency.code;
  const numberTokens = [];

  for (const part of parts) {
    if (part.type === 'plusSign' || part.type === 'minusSign') {
      sign = part.value;
    } else if (part.type === 'currency') {
      currencySymbol = part.value.replace(/\u200E|\u200F/g, '').trim();
    } else if (
      part.type === 'integer' ||
      part.type === 'decimal' ||
      part.type === 'fraction' ||
      part.type === 'group'
    ) {
      numberTokens.push(part.value);
    }
  }

  const formattedNumber = numberTokens.join('');
  const formatted = formatter.format(majorUnits);

  return {
    raw: minorUnits,
    majorUnits,
    formatted,
    formattedNumber,
    currencySymbol,
    sign,
    isNegative,
    isZero,
    currency,
  };
}

/**
 * Validates and parses user input from form fields into minor units.
 *
 * @param {string|number} input Raw user input
 * @param {string} [currencyCode=DEFAULT_CURRENCY_CODE] ISO 4217 code
 * @param {object} [rules={}] Validation options
 * @param {boolean} [rules.allowNegative=false] Whether negative values are permissible
 * @param {boolean} [rules.allowZero=false] Whether 0 is permissible
 * @returns {{ isValid: boolean, minorUnits: number, error: string|null }}
 */
export function parseAmountInput(input, currencyCode = DEFAULT_CURRENCY_CODE, rules = {}) {
  const { allowNegative = false, allowZero = false } = rules;

  if (input === null || input === undefined || String(input).trim() === '') {
    return {
      isValid: false,
      minorUnits: 0,
      error: 'مبلغ المعاملة مطلوب',
    };
  }

  const { exponent } = getCurrency(currencyCode);
  const { cleanStr, sign } = normalizeNumericInput(input, exponent);

  if (!cleanStr || cleanStr === '.') {
    return {
      isValid: false,
      minorUnits: 0,
      error: 'يرجى إدخال رقم صحيح للمبلغ',
    };
  }

  const minorUnits = toMinorUnits(input, currencyCode);

  if (sign < 0 && !allowNegative) {
    return {
      isValid: false,
      minorUnits: 0,
      error: 'لا يمكن أن يكون المبلغ سالباً',
    };
  }

  if (minorUnits === 0 && !allowZero) {
    return {
      isValid: false,
      minorUnits: 0,
      error: 'يجب أن يكون المبلغ أكبر من صفر',
    };
  }

  return {
    isValid: true,
    minorUnits,
    error: null,
  };
}

/* =========================================================================
 * Safe Integer Minor Units Arithmetic Helpers
 * Guaranteed zero floating-point accumulation across ledger calculations.
 * ========================================================================= */

/**
 * Adds two minor unit amounts.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function add(a, b) {
  return Math.trunc(a || 0) + Math.trunc(b || 0);
}

/**
 * Subtracts minor unit amount b from a.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function subtract(a, b) {
  return Math.trunc(a || 0) - Math.trunc(b || 0);
}

/**
 * Sums an array or iterable of minor unit amounts.
 * @param {Array<number>} amounts
 * @returns {number}
 */
export function sum(amounts = []) {
  if (!Array.isArray(amounts)) return 0;
  return amounts.reduce((acc, curr) => acc + Math.trunc(curr || 0), 0);
}

/**
 * Multiplies an integer minor unit amount by a decimal scalar factor with integer half-up rounding.
 * (e.g. 1000 minor units * 0.15 VAT = 150 minor units).
 *
 * @param {number} minorUnits
 * @param {number} factor
 * @returns {number}
 */
export function multiply(minorUnits, factor) {
  return Math.round(Math.trunc(minorUnits || 0) * Number(factor));
}

/**
 * Calculates percentage of a minor unit amount relative to a total.
 * Returns percentage as a number rounded to specified decimal places.
 *
 * @param {number} part Minor units
 * @param {number} total Minor units
 * @param {number} [decimals=1]
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(part, total, decimals = 1) {
  const p = Math.trunc(part || 0);
  const t = Math.trunc(total || 0);
  if (t === 0) return 0;
  const pct = (p / t) * 100;
  return Number(pct.toFixed(decimals));
}

/**
 * Compares two minor unit amounts.
 * @param {number} a
 * @param {number} b
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compare(a, b) {
  const diff = Math.trunc(a || 0) - Math.trunc(b || 0);
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/**
 * Checks whether an amount is strictly zero.
 * @param {number} minorUnits
 * @returns {boolean}
 */
export function isZero(minorUnits) {
  return Math.trunc(minorUnits || 0) === 0;
}

/**
 * Checks whether an amount is strictly positive (> 0).
 * @param {number} minorUnits
 * @returns {boolean}
 */
export function isPositive(minorUnits) {
  return Math.trunc(minorUnits || 0) > 0;
}

/**
 * Checks whether an amount is strictly negative (< 0).
 * @param {number} minorUnits
 * @returns {boolean}
 */
export function isNegative(minorUnits) {
  return Math.trunc(minorUnits || 0) < 0;
}
