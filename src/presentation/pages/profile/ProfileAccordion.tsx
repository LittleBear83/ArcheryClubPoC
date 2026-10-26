import type { ReactEventHandler, ReactNode } from "react";

type ProfileAccordionProps = {
  children: ReactNode;
  className?: string;
  detail?: string;
  onToggle?: ReactEventHandler<HTMLDetailsElement>;
  title: string;
};

export function ProfileAccordion({ children, className, detail, onToggle, title }: ProfileAccordionProps) {
  return (
    <details className={className ? `profile-accordion ${className}` : "profile-accordion"} onToggle={onToggle}>
      <summary className="profile-accordion-summary">
        <span className="profile-accordion-label">{title}</span>
        {detail ? <span className="profile-accordion-detail">{detail}</span> : null}
        <span className="profile-accordion-icon" aria-hidden="true" />
      </summary>
      <div className="profile-accordion-content">{children}</div>
    </details>
  );
}
