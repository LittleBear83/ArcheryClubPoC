import { Button } from "./Button";

type ApprovalAction = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: "primary" | "danger";
};

type ApprovalCardProps = {
  actions: ApprovalAction[];
  children: React.ReactNode;
  conflictWarnings?: Array<{ id: string; text: string }>;
  title: string;
};

export function ApprovalCard({
  actions,
  children,
  conflictWarnings = [],
  title,
}: ApprovalCardProps) {
  return (
    <article className="approvals-card">
      <p className="approvals-card-title">{title}</p>
      {children}
      {conflictWarnings.length > 0 ? (
        <div className="approvals-conflict-box">
          <p className="approvals-conflict-title">Scheduling conflicts found</p>
          <ul className="approvals-conflict-list">
            {conflictWarnings.map((warning) => (
              <li key={warning.id}>{warning.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="approvals-card-actions">
        {actions.map((action) => (
          <Button
            key={action.label}
            className={
              action.variant === "danger"
                ? "approvals-reject-button"
                : "tournament-secondary-button"
            }
            disabled={action.disabled}
            onClick={action.onClick}
            variant={action.variant === "danger" ? "danger" : "secondary"}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </article>
  );
}
