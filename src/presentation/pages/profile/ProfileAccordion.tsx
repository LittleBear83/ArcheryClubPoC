import type { ReactNode } from "react";

type ProfileAccordionProps = {
  children: ReactNode;
  className?: string;
  detail?: string;
  title: string;
};

export function ProfileAccordion({ children, className, detail, title }: ProfileAccordionProps) {
  return (
    <details className={className ? `profile-accordion ${className}` : "profile-accordion"}>
      <summary className="profile-accordion-summary">
        <span className="profile-accordion-label">{title}</span>
        {detail ? <span className="profile-accordion-detail">{detail}</span> : null}
        <span className="profile-accordion-icon" aria-hidden="true" />
      </summary>
      <div className="profile-accordion-content">{children}</div>
    </details>
  );
}
