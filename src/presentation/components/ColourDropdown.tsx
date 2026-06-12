import { useEffect, useMemo, useRef, useState } from "react";

export type ColourDropdownOption = {
  value: string;
  swatch: string;
  borderColor?: string;
};

type ColourPreviewProps = {
  colour: string;
  options: readonly ColourDropdownOption[];
};

type ColourDropdownProps = {
  label: string;
  options: readonly ColourDropdownOption[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

function buildSwatchStyle(option?: ColourDropdownOption) {
  if (!option) {
    return undefined;
  }

  return {
    background:
      option.value === "Clear"
        ? "linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.04))"
        : option.swatch,
    borderColor: option.borderColor ?? "transparent",
  };
}

const dropdownMenuStyle = {
  backgroundColor: "var(--input-option-bg)",
  color: "var(--input-option-text)",
};

export function ColourPreview({ colour, options }: ColourPreviewProps) {
  const option = useMemo(
    () => options.find((entry) => entry.value === colour),
    [colour, options],
  );

  return (
    <span className="lost-arrow-colour-preview">
      <span
        className="lost-arrow-colour-swatch"
        style={buildSwatchStyle(option)}
        aria-hidden="true"
      />
      <span>{option?.value ?? colour}</span>
    </span>
  );
}

export function ColourDropdown({
  label,
  options,
  placeholder = "Select colour",
  value,
  onChange,
}: ColourDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="lost-arrow-colour-dropdown" ref={wrapperRef}>
      <label className="lost-arrow-colour-dropdown-label">
        <span>{label}</span>
        <button
          type="button"
          className={`lost-arrow-colour-dropdown-trigger ${open ? "open" : ""}`}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
        >
          {value ? (
            <ColourPreview colour={value} options={options} />
          ) : (
            <span className="lost-arrow-colour-placeholder">{placeholder}</span>
          )}
          <span className="lost-arrow-colour-dropdown-caret" aria-hidden="true">
            v
          </span>
        </button>
      </label>
      {open ? (
        <div
          className="lost-arrow-colour-dropdown-menu"
          role="listbox"
          aria-label={label}
          style={dropdownMenuStyle}
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                className={`lost-arrow-colour-dropdown-option ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
                style={dropdownMenuStyle}
              >
                <span
                  className="lost-arrow-colour-swatch lost-arrow-colour-swatch--large"
                  style={buildSwatchStyle(option)}
                  aria-hidden="true"
                />
                <span>{option.value}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
