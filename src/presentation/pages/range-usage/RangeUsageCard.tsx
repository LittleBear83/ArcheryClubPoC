import { Button } from "../../components/Button";

export function UsageCard({ active, data, onClick, title }) {
  return (
    <Button
      className={`usage-card ${active ? "active" : ""}`}
      onClick={onClick}
      variant="unstyled"
    >
      <p className="usage-card-title">{title}</p>
      <p className="usage-card-range">{data.label}</p>
      <div className="usage-card-stats">
        <div>
          <span className="usage-stat-label">Members</span>
          <strong>{data.members}</strong>
        </div>
        <div>
          <span className="usage-stat-label">Guests</span>
          <strong>{data.guests}</strong>
        </div>
        <div>
          <span className="usage-stat-label">Total</span>
          <strong>{data.total}</strong>
        </div>
      </div>
    </Button>
  );
}
