import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./Button";
import { formatDate } from "../../utils/dateTime";
import { useIsMobile } from "../hooks/useIsMobile";

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
const DATE_PICKER_POPOVER_MAX_WIDTH = 420;
const DATE_PICKER_POPOVER_VIEWPORT_MARGIN = 8;
const DATE_PICKER_POPOVER_OFFSET = 8;

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
  const isMobile = useIsMobile();
  const selectedDate = parseIsoDate(value);
  const todayIso = toIsoDate(new Date());
  const fallbackDate = selectedDate ?? parseIsoDate(max ?? "") ?? new Date();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(fallbackDate));
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const calendarDays = useMemo(() => getCalendarDays(viewMonth), [viewMonth]);

  useEffect(() => {
    if (!open || !wrapperRef.current) {
      return undefined;
    }

    const updatePopoverPosition = () => {
      if (!wrapperRef.current) {
        return;
      }

      const triggerRect = wrapperRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        DATE_PICKER_POPOVER_MAX_WIDTH,
        viewportWidth - DATE_PICKER_POPOVER_VIEWPORT_MARGIN * 2,
      );
      const measuredHeight = popoverRef.current?.offsetHeight ?? 360;
      const left = Math.min(
        Math.max(triggerRect.left, DATE_PICKER_POPOVER_VIEWPORT_MARGIN),
        viewportWidth - width - DATE_PICKER_POPOVER_VIEWPORT_MARGIN,
      );
      const preferredTop = triggerRect.bottom + DATE_PICKER_POPOVER_OFFSET;
      const top =
        preferredTop + measuredHeight <=
        viewportHeight - DATE_PICKER_POPOVER_VIEWPORT_MARGIN
          ? preferredTop
          : Math.max(
              DATE_PICKER_POPOVER_VIEWPORT_MARGIN,
              triggerRect.top - measuredHeight - DATE_PICKER_POPOVER_OFFSET,
            );

      setPopoverStyle({ left, top, width });
    };

    updatePopoverPosition();

    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, viewMonth]);

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

  if (isMobile) {
    return (
      <label className="custom-date-picker custom-date-picker--native">
        {label ? (
          <span className="custom-date-picker-field-label">{label}</span>
        ) : null}
        <input
          type="date"
          id={id}
          value={value}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {helperText ? (
          <span className="custom-date-picker-helper">{helperText}</span>
        ) : null}
      </label>
    );
  }

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
        <div
          ref={popoverRef}
          className="custom-date-picker-popover"
          role="dialog"
          aria-label="Choose date"
          style={
            popoverStyle
              ? {
                  left: `${popoverStyle.left}px`,
                  top: `${popoverStyle.top}px`,
                  width: `${popoverStyle.width}px`,
                }
              : undefined
          }
        >
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
