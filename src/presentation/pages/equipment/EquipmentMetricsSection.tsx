import type { ReactNode } from "react";
import { formatDate, formatShortDateTime } from "../../../utils/dateTime";
import { SectionPanel } from "../../components/SectionPanel";
import { getEquipmentTypeDisplayLabel } from "./equipmentUtils";

function renderTimestamp(value: string) {
  return value ? formatShortDateTime(value) : "Never";
}

function renderDate(value: string) {
  return value ? formatDate(value) : "-";
}

function renderIdleLabel(value: number | null) {
  if (value == null) {
    return "Never";
  }

  return `${value} day${value === 1 ? "" : "s"}`;
}

function EquipmentMetricTable({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <article className="equipment-metrics-card">
      <h4>{title}</h4>
      <div className="equipment-metrics-table-wrap">{children}</div>
    </article>
  );
}

export function EquipmentMetricsSection({ analytics }) {
  const summaryCards = [
    {
      label: "Active items",
      value: analytics.summary.activeItemsCount,
      helper: "Items currently in service.",
    },
    {
      label: "Currently on loan",
      value: analytics.summary.currentlyOnLoanCount,
      helper: "Items or case contents signed out now.",
    },
    {
      label: "Loan records",
      value: analytics.summary.totalLoanRecords,
      helper: "All recorded issue events.",
    },
    {
      label: "Return records",
      value: analytics.summary.totalReturnRecords,
      helper: "All recorded check-ins.",
    },
    {
      label: "Never loaned",
      value: analytics.summary.neverLoanedCount,
      helper: "Active items with no usage history.",
    },
    {
      label: `Idle ${analytics.inactiveThresholdDays}+ days`,
      value: analytics.summary.inactiveItemsCount,
      helper: "Previously used items not loaned recently.",
    },
  ];

  return (
    <SectionPanel
      className="profile-form"
      title="Equipment Metrics"
      description="Review usage trends, inactive stock, and items that may need buying or reallocating."
      collapsible
      defaultCollapsed
    >
      <div className="equipment-metrics-layout">
        <div className="equipment-metrics-summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="equipment-metrics-summary-card">
              <p className="equipment-metrics-summary-label">{card.label}</p>
              <strong className="equipment-metrics-summary-value">
                {card.value}
              </strong>
              <p className="equipment-metrics-summary-helper">{card.helper}</p>
            </article>
          ))}
        </div>

        <div className="equipment-metrics-grid">
          <EquipmentMetricTable title="Usage By Type">
            <table className="equipment-metrics-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Active</th>
                  <th>On loan</th>
                  <th>Loans</th>
                  <th>Never loaned</th>
                </tr>
              </thead>
              <tbody>
                {analytics.usageByType.map((row) => (
                  <tr key={row.type}>
                    <td>{row.typeLabel}</td>
                    <td>{row.totalItems}</td>
                    <td>{row.onLoanCount}</td>
                    <td>{row.totalLoans}</td>
                    <td>{row.neverLoanedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EquipmentMetricTable>

          <EquipmentMetricTable title="Most Used Items">
            <table className="equipment-metrics-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Loans</th>
                  <th>Last loaned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {analytics.mostUsedItems.length > 0 ? (
                  analytics.mostUsedItems.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{getEquipmentTypeDisplayLabel(row.item)}</strong>
                        <span className="equipment-metrics-row-copy">
                          {row.referenceLabel}
                        </span>
                      </td>
                      <td>{row.loanCount}</td>
                      <td>{renderTimestamp(row.lastLoanedAt)}</td>
                      <td>{row.isOnLoan ? "On loan" : row.locationLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No equipment loans have been recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </EquipmentMetricTable>

          <EquipmentMetricTable
            title={`Inactive For ${analytics.inactiveThresholdDays}+ Days`}
          >
            <table className="equipment-metrics-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Idle</th>
                  <th>Last loaned</th>
                  <th>Stored at</th>
                </tr>
              </thead>
              <tbody>
                {analytics.inactiveItems.length > 0 ? (
                  analytics.inactiveItems.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{getEquipmentTypeDisplayLabel(row.item)}</strong>
                        <span className="equipment-metrics-row-copy">
                          {row.referenceLabel}
                        </span>
                      </td>
                      <td>{renderIdleLabel(row.daysSinceLastLoan)}</td>
                      <td>{renderTimestamp(row.lastLoanedAt)}</td>
                      <td>{row.locationLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      No active items have been idle for {analytics.inactiveThresholdDays} days or more.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </EquipmentMetricTable>

          <EquipmentMetricTable title="Never Loaned Items">
            <table className="equipment-metrics-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Added</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {analytics.neverLoanedItems.length > 0 ? (
                  analytics.neverLoanedItems.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{getEquipmentTypeDisplayLabel(row.item)}</strong>
                        <span className="equipment-metrics-row-copy">
                          {row.referenceLabel}
                        </span>
                      </td>
                      <td>{renderDate(row.addedAt)}</td>
                      <td>{row.locationLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>Every active item has at least one recorded loan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </EquipmentMetricTable>
        </div>
      </div>
    </SectionPanel>
  );
}
