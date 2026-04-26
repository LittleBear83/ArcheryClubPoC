import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { formatDate } from "../../utils/dateTime";

type DatePickerProps = {
  disabled?: boolean;
  helperText?: string;
  id?: string;
  label?: string;
  max?: string;
  min?: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function addDays(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount));
}

function isOutOfRange(isoDate: string, min?: string, max?: string) {
  return Boolean((min && isoDate < min) || (max && isoDate > max));
}

function getCalendarDays(viewMonth: Date) {
  const monthStart = startOfMonth(viewMonth);
  const mondayOffset = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addDays(monthStart, -mondayOffset);

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function DatePicker({
  disabled = false,
  helperText = "Click date to change",
  id,
  label,
  max,
  min,
  onChange,
  required = false,
  value,
}: DatePickerProps) {
  const selectedDate = parseIsoDate(value);
  const todayIso = toIsoDate(new Date());
  const fallbackDate = selectedDate ?? parseIsoDate(max ?? "") ?? new Date();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(fallbackDate));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const calendarDays = useMemo(() => getCalendarDays(viewMonth), [viewMonth]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectDate = (nextValue: string) => {
    if (disabled || isOutOfRange(nextValue, min, max)) {
      return;
    }

    onChange(nextValue);
    setOpen(false);
  };

  const toggleOpen = () => {
    setOpen((current) => {
      const nextOpen = !current;

      if (nextOpen && selectedDate) {
        setViewMonth(startOfMonth(selectedDate));
      }

      return nextOpen;
    });
  };

  const selectedIso = selectedDate ? toIsoDate(selectedDate) : "";
  const monthLabel = `${MONTH_LABELS[viewMonth.getUTCMonth()]} ${viewMonth.getUTCFullYear()}`;

  return (
    <div className="custom-date-picker" ref={wrapperRef}>
      <Button
        type="button"
        id={id}
        className="custom-date-picker-trigger"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-required={required ? "true" : undefined}
        variant="unstyled"
      >
        <span className="custom-date-picker-copy">
          <span className="custom-date-picker-value-row">
            {label ? (
              <span className="custom-date-picker-field-label">{label}</span>
            ) : null}
            <span className="custom-date-picker-value">
              {value ? formatDate(value) : "Select date"}
            </span>
          </span>
          {helperText ? (
            <span className="custom-date-picker-helper">{helperText}</span>
          ) : null}
        </span>
        <span className="custom-date-picker-icon" aria-hidden="true">
          calendar
        </span>
      </Button>

      {open ? (
        <div className="custom-date-picker-popover" role="dialog" aria-label="Choose date">
          <div className="custom-date-picker-header">
            <strong>{monthLabel}</strong>
            <div className="custom-date-picker-nav">
              <Button
                type="button"
                className="custom-date-picker-nav-button"
                onClick={() => setViewMonth((current) => addMonths(current, -1))}
                aria-label="Previous month"
                variant="unstyled"
              >
                &lt;
              </Button>
              <Button
                type="button"
                className="custom-date-picker-nav-button"
                onClick={() => setViewMonth((current) => addMonths(current, 1))}
                aria-label="Next month"
                variant="unstyled"
              >
                &gt;
              </Button>
            </div>
          </div>

          <div className="custom-date-picker-weekdays">
            {WEEKDAY_LABELS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="custom-date-picker-grid">
            {calendarDays.map((date) => {
              const isoDate = toIsoDate(date);
              const isCurrentMonth = date.getUTCMonth() === viewMonth.getUTCMonth();
              const isSelected = isoDate === selectedIso;
              const isToday = isoDate === todayIso;
              const isDisabled = isOutOfRange(isoDate, min, max);

              return (
                <Button
                  key={isoDate}
                  type="button"
                  className={[
                    "custom-date-picker-day",
                    isCurrentMonth ? "" : "custom-date-picker-day--muted",
                    isSelected ? "custom-date-picker-day--selected" : "",
                    isToday ? "custom-date-picker-day--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectDate(isoDate)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  variant="unstyled"
                >
                  {date.getUTCDate()}
                </Button>
              );
            })}
          </div>

          <div className="custom-date-picker-footer">
            <Button
              type="button"
              className="custom-date-picker-footer-button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              disabled={disabled || required}
              variant="unstyled"
            >
              Clear
            </Button>
            <Button
              type="button"
              className="custom-date-picker-footer-button"
              onClick={() => selectDate(todayIso)}
              disabled={disabled || isOutOfRange(todayIso, min, max)}
              variant="unstyled"
            >
              Today
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
