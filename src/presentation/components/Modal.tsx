import React, { useEffect, useId, useRef } from "react";
import "./Modal.css";
import { Button } from "./Button";

export function Modal({
  open,
  onClose,
  title,
  children,
  contentClassName = "",
}) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    contentRef.current?.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  // Clicks on the overlay close the modal; clicks inside the panel are stopped
  // so forms and buttons can be used without dismissing their parent dialog.
  const modalContentClassName = ["modal-content", contentClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={contentRef}
        className={modalContentClassName}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== "Tab") return;
          const focusable = contentRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <Button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            variant="unstyled"
          >
            ×
          </Button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
