import type { ReactNode } from "react";

export function MobileSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mobile-section-header">
      <div className="mobile-section-header-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="mobile-section-header-actions">{actions}</div> : null}
    </div>
  );
}
