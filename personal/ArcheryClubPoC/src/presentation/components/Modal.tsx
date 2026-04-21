import React from "react";
import "./Modal.css";
import { Button } from "./Button";

export function Modal({
  open,
  onClose,
  title,
  children,
  contentClassName = "",
}) {
  if (!open) return null;

  // Clicks on the overlay close the modal; clicks inside the panel are stopped
  // so forms and buttons can be used without dismissing their parent dialog.
  const modalContentClassName = ["modal-content", contentClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={modalContentClassName} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <Button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            variant="unstyled"
          >
            x
          </Button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
