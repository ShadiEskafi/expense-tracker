import { useState } from 'react';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  CalendarIcon,
  CheckIcon,
  RotateCcwIcon
} from '../../components/common/Icons.jsx';
import {
  REPORT_PRESETS,
  formatPeriodHeadline
} from './reportsAnalytics.js';

/**
 * ReportsPeriodControls (F012)
 * Manages interval selection (Week, Month, Year, Custom), period stepping (backward/forward),
 * and custom date range boundaries.
 *
 * References:
 * - design-system/screens.md § 8
 * - /impeccable, /make-interfaces-feel-better
 */
export function ReportsPeriodControls({
  preset,
  onSelectPreset,
  startDate,
  endDate,
  onNavigatePeriod,
  onResetToCurrent,
  isNavigatedAway,
  customStartDate,
  customEndDate,
  onApplyCustomDates
}) {
  const [localStart, setLocalStart] = useState(customStartDate || startDate);
  const [localEnd, setLocalEnd] = useState(customEndDate || endDate);

  const headline = formatPeriodHeadline(preset, startDate, endDate);

  const handleApply = (e) => {
    e.preventDefault();
    if (onApplyCustomDates) {
      onApplyCustomDates(localStart, localEnd);
    }
  };

  return (
    <div className="reports-header-section">
      {/* 1. Main Controls Bar */}
      <div className="reports-controls-bar">
        {/* Preset Switcher */}
        <div className="reports-presets-group" role="tablist" aria-label="محدد الفترة الزمنية">
          {REPORT_PRESETS.map((p) => {
            const isActive = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`preset-chip-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectPreset(p.id)}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Stepper / Period Navigator (Only shown for non-custom presets) */}
        {preset !== 'custom' ? (
          <div className="reports-navigator-group" aria-label="التنقل بين الفترات">
            {/* Right arrow in RTL: moves to previous period */}
            <button
              type="button"
              className="navigator-arrow-btn"
              onClick={() => onNavigatePeriod(-1)}
              aria-label="الفترة السابقة"
              title="الفترة السابقة"
            >
              <ChevronRightIcon size={18} />
            </button>

            <div className="period-headline-badge">
              <CalendarIcon size={16} />
              <span>{headline}</span>
            </div>

            {/* Left arrow in RTL: moves to next period */}
            <button
              type="button"
              className="navigator-arrow-btn"
              onClick={() => onNavigatePeriod(1)}
              aria-label="الفترة التالية"
              title="الفترة التالية"
            >
              <ChevronLeftIcon size={18} />
            </button>

            {isNavigatedAway && (
              <button
                type="button"
                className="reset-today-btn"
                onClick={onResetToCurrent}
                title="الرجوع للفترة الحالية"
              >
                <RotateCcwIcon size={14} style={{ verticalAlign: 'middle', marginLeft: 2 }} />
                الحالي
              </button>
            )}
          </div>
        ) : (
          <div className="period-headline-badge">
            <CalendarIcon size={16} />
            <span>{headline}</span>
          </div>
        )}
      </div>

      {/* 2. Custom Date Range Inputs (Revealed when preset is 'custom') */}
      {preset === 'custom' && (
        <form className="custom-date-picker-bar" onSubmit={handleApply}>
          <div className="custom-date-field">
            <label htmlFor="report-custom-start">من تاريخ:</label>
            <input
              id="report-custom-start"
              type="date"
              className="custom-date-input"
              value={localStart}
              onChange={(e) => setLocalStart(e.target.value)}
              required
            />
          </div>

          <div className="custom-date-field">
            <label htmlFor="report-custom-end">إلى تاريخ:</label>
            <input
              id="report-custom-end"
              type="date"
              className="custom-date-input"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-apply-custom-dates">
            <CheckIcon size={16} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            تطبيق النطاق
          </button>
        </form>
      )}
    </div>
  );
}
