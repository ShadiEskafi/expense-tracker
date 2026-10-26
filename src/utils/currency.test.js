/**
 * @file currency.test.js
 * @description Unit tests for ISO 4217 Monetary Precision & Minor Units Engine.
 * Verifies zero floating-point accumulation, multi-currency exponent handling,
 * Arabic-Indic numeral parsing, and localized formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY_CODE,
  getCurrency,
  getAllCurrencies,
  toMinorUnits,
  toMajorUnits,
  toMajorUnitsString,
  formatCurrency,
  formatCurrencyParts,
  parseAmountInput,
  add,
  subtract,
  sum,
  multiply,
  calculatePercentage,
  compare,
  isZero,
  isPositive,
  isNegative,
} from './currency.js';

describe('Currency Engine: Registry & Metadata', () => {
  it('provides default currency as SAR with exponent 2 and multiplier 100', () => {
    expect(DEFAULT_CURRENCY_CODE).toBe('SAR');
    const sar = getCurrency();
    expect(sar.code).toBe('SAR');
    expect(sar.exponent).toBe(2);
    expect(sar.multiplier).toBe(100);
    expect(sar.symbolAr).toBe('ر.س');
  });

  it('correctly provides 3-decimal currencies (KWD, BHD, OMR, JOD, IQD)', () => {
    const kwd = getCurrency('KWD');
    expect(kwd.exponent).toBe(3);
    expect(kwd.multiplier).toBe(1000);
    expect(kwd.symbolAr).toBe('د.ك');

    const bhd = getCurrency('BHD');
    expect(bhd.exponent).toBe(3);
    expect(bhd.multiplier).toBe(1000);

    const omr = getCurrency('OMR');
    expect(omr.exponent).toBe(3);
    expect(omr.multiplier).toBe(1000);
  });

  it('correctly provides 0-decimal currencies (JPY, KRW)', () => {
    const jpy = getCurrency('JPY');
    expect(jpy.exponent).toBe(0);
    expect(jpy.multiplier).toBe(1);

    const krw = getCurrency('KRW');
    expect(krw.exponent).toBe(0);
    expect(krw.multiplier).toBe(1);
  });

  it('falls back gracefully to exponent 2 for unknown currency codes', () => {
    const custom = getCurrency('XYZ');
    expect(custom.code).toBe('XYZ');
    expect(custom.exponent).toBe(2);
    expect(custom.multiplier).toBe(100);
  });

  it('retrieves all registered currencies with valid multipliers', () => {
    const all = getAllCurrencies();
    expect(all.length).toBe(Object.keys(CURRENCIES).length);
    for (const c of all) {
      expect(c.multiplier).toBe(10 ** c.exponent);
    }
  });
});

describe('Currency Engine: toMinorUnits (Monetary Precision)', () => {
  it('eliminates standard JavaScript floating-point errors (1.14 & 29.99)', () => {
    // 1.14 * 100 in native JS is 113.99999999999999
    expect(toMinorUnits('1.14', 'SAR')).toBe(114);
    expect(toMinorUnits(1.14, 'SAR')).toBe(114);

    // 29.99 * 100 in native JS is 2998.9999999999995
    expect(toMinorUnits('29.99', 'SAR')).toBe(2999);
    expect(toMinorUnits(29.99, 'SAR')).toBe(2999);

    // 0.1 + 0.2 in native JS is 0.30000000000000004
    expect(toMinorUnits(0.1 + 0.2, 'SAR')).toBe(30);
  });

  it('converts standard decimal strings and integers', () => {
    expect(toMinorUnits('12.50', 'SAR')).toBe(1250);
    expect(toMinorUnits('12.5', 'SAR')).toBe(1250);
    expect(toMinorUnits('12', 'SAR')).toBe(1200);
    expect(toMinorUnits(12, 'SAR')).toBe(1200);
    expect(toMinorUnits('0.05', 'SAR')).toBe(5);
    expect(toMinorUnits('0', 'SAR')).toBe(0);
    expect(toMinorUnits(0, 'SAR')).toBe(0);
  });

  it('handles negative amounts correctly', () => {
    expect(toMinorUnits('-12.50', 'SAR')).toBe(-1250);
    expect(toMinorUnits('-0.05', 'SAR')).toBe(-5);
    expect(toMinorUnits(-12.5, 'SAR')).toBe(-1250);
  });

  it('returns 0 for empty or nullish inputs', () => {
    expect(toMinorUnits('', 'SAR')).toBe(0);
    expect(toMinorUnits('   ', 'SAR')).toBe(0);
    expect(toMinorUnits(null, 'SAR')).toBe(0);
    expect(toMinorUnits(undefined, 'SAR')).toBe(0);
  });

  it('parses Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic numerals with Arabic comma (٫)', () => {
    expect(toMinorUnits('١٢٫٥٠', 'SAR')).toBe(1250);
    expect(toMinorUnits('١٠٠', 'SAR')).toBe(10000);
    expect(toMinorUnits('-٥٫٢٥', 'SAR')).toBe(-525);
    expect(toMinorUnits('۱۲٫۵۰', 'SAR')).toBe(1250);
  });

  it('handles thousands commas and European decimal comma formats', () => {
    // US / Arab standard: commas are thousands separators
    expect(toMinorUnits('1,250.50', 'SAR')).toBe(125050);
    expect(toMinorUnits('10,000', 'SAR')).toBe(1000000);
    expect(toMinorUnits('1,000,000.00', 'SAR')).toBe(100000000);

    // European format: dot is thousands separator, comma is decimal
    expect(toMinorUnits('1.250,50', 'SAR')).toBe(125050);
  });

  it('performs half-up rounding for excess decimal places beyond exponent', () => {
    // Exponent 2: 12.345 -> 1235 (rounds up), 12.344 -> 1234 (rounds down)
    expect(toMinorUnits('12.345', 'SAR')).toBe(1235);
    expect(toMinorUnits('12.344', 'SAR')).toBe(1234);
    expect(toMinorUnits('9.999', 'SAR')).toBe(1000);
    expect(toMinorUnits('-12.345', 'SAR')).toBe(-1235);
  });

  it('accurately converts 3-decimal currencies (KWD)', () => {
    expect(toMinorUnits('1.250', 'KWD')).toBe(1250);
    expect(toMinorUnits('1.2', 'KWD')).toBe(1200);
    expect(toMinorUnits('1.25', 'KWD')).toBe(1250);
    expect(toMinorUnits('1', 'KWD')).toBe(1000);
    expect(toMinorUnits('1.2345', 'KWD')).toBe(1235); // rounded half-up
  });

  it('accurately converts 0-decimal currencies (JPY)', () => {
    expect(toMinorUnits('1000', 'JPY')).toBe(1000);
    expect(toMinorUnits(1000, 'JPY')).toBe(1000);
    expect(toMinorUnits('1000.4', 'JPY')).toBe(1000);
    expect(toMinorUnits('1000.6', 'JPY')).toBe(1001); // rounded half-up
  });
});

describe('Currency Engine: toMajorUnits & toMajorUnitsString', () => {
  it('converts minor units to floating-point major units', () => {
    expect(toMajorUnits(1250, 'SAR')).toBe(12.5);
    expect(toMajorUnits(1250, 'KWD')).toBe(1.25);
    expect(toMajorUnits(1000, 'JPY')).toBe(1000);
    expect(toMajorUnits(0, 'SAR')).toBe(0);
    expect(toMajorUnits(null, 'SAR')).toBe(0);
    expect(toMajorUnits(undefined, 'SAR')).toBe(0);
  });

  it('converts minor units to exact fixed decimal strings without float drift', () => {
    expect(toMajorUnitsString(1250, 'SAR')).toBe('12.50');
    expect(toMajorUnitsString(5, 'SAR')).toBe('0.05');
    expect(toMajorUnitsString(-5, 'SAR')).toBe('-0.05');
    expect(toMajorUnitsString(0, 'SAR')).toBe('0.00');
    expect(toMajorUnitsString(-1250, 'SAR')).toBe('-12.50');

    // 3-decimal currency (KWD)
    expect(toMajorUnitsString(1250, 'KWD')).toBe('1.250');
    expect(toMajorUnitsString(5, 'KWD')).toBe('0.005');

    // 0-decimal currency (JPY)
    expect(toMajorUnitsString(1000, 'JPY')).toBe('1000');
    expect(toMajorUnitsString(-1000, 'JPY')).toBe('-1000');
  });
});

describe('Currency Engine: formatCurrency & formatCurrencyParts', () => {
  it('formats SAR with Arabic currency symbol and 2 decimal places', () => {
    const formatted = formatCurrency(1250, 'SAR');
    expect(formatted).toContain('12.50');
    expect(formatted).toContain('ر.س');
  });

  it('formats negative amounts and explicit sign display', () => {
    const negative = formatCurrency(-1250, 'SAR');
    expect(negative).toContain('12.50');

    const alwaysSign = formatCurrency(1250, 'SAR', { signDisplay: 'always' });
    expect(alwaysSign).toContain('+');
    expect(alwaysSign).toContain('12.50');
  });

  it('formats 3-decimal currency (KWD) with 3 decimals', () => {
    const formatted = formatCurrency(1250, 'KWD');
    expect(formatted).toContain('1.250');
    expect(formatted).toContain('د.ك');
  });

  it('formats 0-decimal currency (JPY) with 0 decimals', () => {
    const formatted = formatCurrency(1000, 'JPY');
    expect(formatted).toContain('1,000');
    expect(formatted).toContain('JP¥');
  });

  it('formats non-Arabic locales (e.g. en-US with USD)', () => {
    const formatted = formatCurrency(10000, 'USD', { locale: 'en-US' });
    expect(formatted).toBe('$100.00');
  });

  it('provides structured formatCurrencyParts for RTL LTR-isolated display', () => {
    const parts = formatCurrencyParts(1250, 'SAR');
    expect(parts.raw).toBe(1250);
    expect(parts.majorUnits).toBe(12.5);
    expect(parts.formattedNumber).toBe('12.50');
    expect(parts.isNegative).toBe(false);
    expect(parts.isZero).toBe(false);
    expect(parts.currencySymbol).toBe('ر.س.');

    const negParts = formatCurrencyParts(-5000, 'SAR');
    expect(negParts.isNegative).toBe(true);
    expect(negParts.formattedNumber).toBe('50.00');
    expect(negParts.sign).toBe('-');
  });
});

describe('Currency Engine: parseAmountInput (Form Field Validation)', () => {
  it('validates and parses valid amounts', () => {
    const res = parseAmountInput('12.50', 'SAR');
    expect(res.isValid).toBe(true);
    expect(res.minorUnits).toBe(1250);
    expect(res.error).toBeNull();
  });

  it('rejects empty, null, or whitespace-only inputs', () => {
    const emptyRes = parseAmountInput('', 'SAR');
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.minorUnits).toBe(0);
    expect(emptyRes.error).toBe('مبلغ المعاملة مطلوب');
  });

  it('rejects non-numeric gibberish', () => {
    const gibberishRes = parseAmountInput('abc', 'SAR');
    expect(gibberishRes.isValid).toBe(false);
    expect(gibberishRes.minorUnits).toBe(0);
    expect(gibberishRes.error).toBe('يرجى إدخال رقم صحيح للمبلغ');
  });

  it('rejects negative amounts when allowNegative is false (default)', () => {
    const negRes = parseAmountInput('-25.00', 'SAR');
    expect(negRes.isValid).toBe(false);
    expect(negRes.error).toBe('لا يمكن أن يكون المبلغ سالباً');

    // Allowed when explicit
    const allowedNeg = parseAmountInput('-25.00', 'SAR', { allowNegative: true });
    expect(allowedNeg.isValid).toBe(true);
    expect(allowedNeg.minorUnits).toBe(-2500);
  });

  it('rejects zero amounts when allowZero is false (default for transactions)', () => {
    const zeroRes = parseAmountInput('0', 'SAR');
    expect(zeroRes.isValid).toBe(false);
    expect(zeroRes.error).toBe('يجب أن يكون المبلغ أكبر من صفر');

    // Allowed when explicit (e.g. account initial balance)
    const allowedZero = parseAmountInput('0', 'SAR', { allowZero: true });
    expect(allowedZero.isValid).toBe(true);
    expect(allowedZero.minorUnits).toBe(0);
  });
});

describe('Currency Engine: Integer Arithmetic Helpers', () => {
  it('adds two minor unit amounts', () => {
    expect(add(1050, 250)).toBe(1300);
    expect(add(1000, -200)).toBe(800);
  });

  it('subtracts minor unit amounts', () => {
    expect(subtract(1050, 250)).toBe(800);
    expect(subtract(1000, 1500)).toBe(-500);
  });

  it('sums an array of minor unit amounts', () => {
    expect(sum([1000, 250, 50])).toBe(1300);
    expect(sum([])).toBe(0);
    expect(sum([100, -40, 20])).toBe(80);
  });

  it('multiplies minor units with scalar factors and rounds half-up', () => {
    // 1000 cents * 0.15 VAT = 150 cents
    expect(multiply(1000, 0.15)).toBe(150);
    // 100 cents * 0.055 = 5.5 -> 6 cents
    expect(multiply(100, 0.055)).toBe(6);
  });

  it('calculates percentages correctly', () => {
    expect(calculatePercentage(250, 1000)).toBe(25);
    expect(calculatePercentage(1, 3, 2)).toBe(33.33);
    expect(calculatePercentage(50, 0)).toBe(0);
  });

  it('compares minor unit amounts correctly', () => {
    expect(compare(1000, 2000)).toBe(-1);
    expect(compare(2000, 1000)).toBe(1);
    expect(compare(1000, 1000)).toBe(0);
  });

  it('checks zero, positive, and negative amounts', () => {
    expect(isZero(0)).toBe(true);
    expect(isZero(10)).toBe(false);

    expect(isPositive(100)).toBe(true);
    expect(isPositive(0)).toBe(false);
    expect(isPositive(-100)).toBe(false);

    expect(isNegative(-100)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isNegative(100)).toBe(false);
  });
});

describe('Currency Engine: Israeli New Shekel (ILS) Support', () => {
  it('correctly registers ILS with ISO 4217 specifications', () => {
    expect(CURRENCIES.ILS).toBeDefined();
    const ils = getCurrency('ILS');
    expect(ils.code).toBe('ILS');
    expect(ils.nameAr).toBe('شيكل إسرائيلي جديد');
    expect(ils.nameArShort).toBe('شيكل جديد');
    expect(ils.nameEn).toBe('Israeli New Shekel');
    expect(ils.symbolAr).toBe('₪');
    expect(ils.symbolEn).toBe('₪');
    expect(ils.exponent).toBe(2);
    expect(ils.multiplier).toBe(100);
  });

  it('is included in getAllCurrencies() list', () => {
    const all = getAllCurrencies();
    const found = all.find((c) => c.code === 'ILS');
    expect(found).toBeDefined();
    expect(found.code).toBe('ILS');
    expect(found.symbolAr).toBe('₪');
  });

  it('converts major units to minor units without floating-point error', () => {
    expect(toMinorUnits(125.50, 'ILS')).toBe(12550);
    expect(toMinorUnits('125.50', 'ILS')).toBe(12550);
    expect(toMinorUnits('0.05', 'ILS')).toBe(5);
    expect(toMinorUnits('99.99', 'ILS')).toBe(9999);
  });

  it('converts minor units back to major units and exact string', () => {
    expect(toMajorUnits(12550, 'ILS')).toBe(125.5);
    expect(toMajorUnitsString(12550, 'ILS')).toBe('125.50');
    expect(toMajorUnitsString(5, 'ILS')).toBe('0.05');
  });

  it('parses user input in Latin and Arabic numerals for ILS', () => {
    const latinResult = parseAmountInput('125.50', 'ILS');
    expect(latinResult.isValid).toBe(true);
    expect(latinResult.minorUnits).toBe(12550);

    const arabicResult = parseAmountInput('١٢٥.٥٠', 'ILS');
    expect(arabicResult.isValid).toBe(true);
    expect(arabicResult.minorUnits).toBe(12550);
  });

  it('formats ILS correctly using Intl.NumberFormat and formatCurrencyParts', () => {
    const formatted = formatCurrency(12550, 'ILS');
    expect(formatted).toContain('125.50');
    expect(formatted).toContain('₪');

    const parts = formatCurrencyParts(12550, 'ILS');
    expect(parts.formattedNumber).toBe('125.50');
    expect(parts.currencySymbol).toBe('₪');
    expect(parts.isNegative).toBe(false);
  });

  it('performs exact round-trip conversion without precision drift', () => {
    const inputs = ['125.50', '0.01', '999.99', '1500.00', '49.90'];
    for (const val of inputs) {
      const minor = toMinorUnits(val, 'ILS');
      const majorStr = toMajorUnitsString(minor, 'ILS');
      expect(majorStr).toBe(val);
    }
  });
});
