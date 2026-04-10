import React from "react";
import "./Modal.css";
import { Button } from "./Button";

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
