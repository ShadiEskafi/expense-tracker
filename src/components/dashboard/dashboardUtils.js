import { formatCurrencyParts } from '../../utils/currency.js';

/**
 * Formats minor units into localized financial number string with thousand grouping (e.g. "34,200.00").
 * Forces Latin digits for tabular clarity per Arabic FinTech standards.
 *
 * @param {number} minorUnits
 * @param {string} [currency='SAR']
 * @returns {string} Formatted number without currency symbol
 */
export function formatAmountNumber(minorUnits, currency = 'SAR') {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) {
    return '0.00';
  }
  const parts = formatCurrencyParts(Math.abs(minorUnits), currency, { useLatinNumerals: true });
  return parts.formattedNumber;
}
