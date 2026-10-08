import { useState } from "react";

type SectionPanelProps = {
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  description?: string;
  title: string;
  titleClassName?: string;
  toggleStyle?: "button" | "accordion";
};

export function SectionPanel({
  children,
  className = "",
  collapsible = false,
  defaultCollapsed = false,
  description = "",
  title,
  titleClassName = "",
  toggleStyle = "button",
}: SectionPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const headingClassName = ["profile-section-title", titleClassName]
    .filter(Boolean)
    .join(" ");

  if (collapsible && toggleStyle === "accordion") {
    return (
      <details
        className={["profile-accordion", "section-panel-accordion", className]
          .filter(Boolean)
          .join(" ")}
        open={!defaultCollapsed}
      >
        <summary className="profile-accordion-summary">
          <span className="profile-accordion-label">{title}</span>
          {description ? (
            <span className="section-panel-accordion-description">{description}</span>
          ) : null}
          <span className="profile-accordion-icon" aria-hidden="true" />
        </summary>
        <div className="profile-accordion-content">{children}</div>
      </details>
    );
  }

  return (
    <section className={className}>
      {collapsible ? (
        <div className="profile-section-toggle-row">
          <div className="profile-section-heading-group">
            <h3 className={headingClassName}>{title}</h3>
            {description ? (
              <span className="profile-section-description">{description}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="profile-section-toggle"
            onClick={() => setCollapsed((current) => !current)}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
          >
            <span className="profile-section-toggle-icon" aria-hidden="true">
              {collapsed ? "+" : "-"}
            </span>
          </button>
        </div>
      ) : (
        <div className="profile-section-heading-group">
          <h3 className={headingClassName}>{title}</h3>
          {description ? (
            <span className="profile-section-description">{description}</span>
          ) : null}
        </div>
      )}
      {collapsible && collapsed ? null : children}
    </section>
  );
}
