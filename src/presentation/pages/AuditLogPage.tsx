import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditEvents, type AuditEventRecord } from "../../api/auditLogApi";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { formatShortDateTime } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useIsMobile } from "../hooks/useIsMobile";
import type { UserProfile } from "../../types/app";

type AuditLogPageProps = {
  currentUserProfile: UserProfile | null;
};

type AuditFieldChange = {
  path: string;
  before: unknown;
  after: unknown;
};

type EntityChangeAuditMetadata = {
  auditKind?: string;
  action?: string;
  entityType?: string;
  entityId?: string | number | null;
  entityLabel?: string;
  changeCount?: number;
  changes?: AuditFieldChange[];
};

type AuthActivityFailureReason =
  | "missing_credentials"
  | "username_not_found"
  | "password_incorrect"
  | "account_inactive"
  | "missing_rfid_tag"
  | "rfid_tag_not_recognised";

const queryKeys = {
  list: (
    actorUsername: string,
    actorFilter: string,
    actionFilter: string,
    dateFrom: string,
    dateTo: string,
    sortBy: string,
    sortDirection: string,
  ) => [
    "audit-log",
    actorUsername,
    actorFilter,
    actionFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortDirection,
  ] as const,
};

function formatAuditTimestamp(event: AuditEventRecord) {
  if (!event.createdAtDate || !event.createdAtTime) {
    return "-";
  }

  return formatShortDateTime(`${event.createdAtDate}T${event.createdAtTime}`);
}

function formatAuditAction(event: AuditEventRecord) {
  const metadata = event.metadata;

  if (isEntityChangeMetadata(metadata)) {
    if (
      metadata.entityType === "golden_records_sync" &&
      metadata.action === "handicap_refreshed"
    ) {
      return "handicap refreshed";
    }

    if (metadata.entityType === "auth_activity") {
      const changes = metadata.changes ?? [];
      const activityType = changes.find((change) => change.path === "activityType")?.after;
      const method = changes.find((change) => change.path === "method")?.after;

      if (activityType === "login_failed") {
        return method === "rfid"
          ? "failed rfid sign-in"
          : "failed member sign-in";
      }
    }

    if (metadata.entityType === "member_activity") {
      const changes = metadata.changes ?? [];
      const activityType = changes.find((change) => change.path === "activityType")?.after;
      const method = changes.find((change) => change.path === "method")?.after;

      if (activityType === "mobile_check_in") {
        return "mobile check-in recorded";
      }

      if (activityType === "login") {
        if (method === "rfid") {
          return "member logged in via rfid";
        }

        if (method === "password-mobile") {
          return "member logged in via mobile";
        }

        if (method === "password") {
          return "member logged in via website";
        }
      }
    }

    if (metadata.entityType === "guest_activity") {
      return "guest signed in";
    }

    const action = metadata.action ? metadata.action.split("_").join(" ") : "changed";
    const entityType = metadata.entityType
      ? metadata.entityType.split("_").join(" ")
      : "record";

    return `${action} ${entityType}`;
  }

  const normalizedAction = event.action.trim().toLowerCase();
  const fallbackActionLabels = [
    ["put /api/range-rules", "range rules changed"],
    ["post /api/lost-arrows/:id/found", "arrow found"],
    ["post /api/lost-arrows", "arrow lost"],
    ["post /api/announcements/send-email", "announcement email sent"],
    ["post /api/auth/logout", "member logged out"],
    ["post /api/roles", "role created"],
    ["put /api/roles/:rolekey", "role updated"],
    ["delete /api/roles/:rolekey", "role deleted"],
    ["post /api/committee-roles", "committee role created"],
    ["put /api/committee-roles/:id", "committee role updated"],
    ["delete /api/committee-roles/:id", "committee role deleted"],
    ["post /api/user-profiles", "member profile created"],
    ["put /api/user-profiles/:username", "member profile updated"],
    ["post /api/user-profiles/:username/distance-sign-offs", "distance sign-off recorded"],
    ["post /api/user-profiles/:username/assign-rfid", "rfid assigned"],
    ["put /api/loan-bow-profiles/:username", "loan bow updated"],
    ["post /api/loan-bow-profiles/:username/return", "loan bow returned"],
    ["post /api/equipment/items", "equipment item created"],
    ["post /api/equipment/items/:id/decommission", "equipment item decommissioned"],
    ["post /api/equipment/assignments", "equipment assigned"],
    ["post /api/equipment/returns", "equipment returned"],
    ["post /api/equipment/storage", "equipment storage updated"],
    ["post /api/equipment/storage-locations", "storage location created"],
    ["delete /api/equipment/storage-locations/:label", "storage location deleted"],
    ["post /api/outdoor-table", "outdoor table entry created"],
    ["put /api/outdoor-table/:id", "outdoor table entry updated"],
    ["delete /api/outdoor-table/:id", "outdoor table entry deleted"],
    ["post /api/tournaments", "tournament created"],
    ["put /api/tournaments/:id", "tournament updated"],
    ["delete /api/tournaments/:id", "tournament deleted"],
    ["post /api/tournaments/:id/register", "tournament registration created"],
    ["delete /api/tournaments/:id/register", "tournament registration withdrawn"],
    ["post /api/tournaments/:id/score", "tournament score submitted"],
    ["post /api/tournaments/:id/competitors-export", "tournament competitors exported"],
    ["post /api/events", "event created"],
    ["post /api/events/:id/approve", "event approved"],
    ["post /api/events/:id/reject", "event rejected"],
    ["post /api/events/:id/book", "event booking created"],
    ["delete /api/events/:id/booking", "event booking withdrawn"],
    ["delete /api/events/:id", "event deleted"],
    ["post /api/coaching-sessions", "coaching session created"],
    ["post /api/coaching-sessions/:id/approve", "coaching session approved"],
    ["post /api/coaching-sessions/:id/reject", "coaching session rejected"],
    ["post /api/coaching-sessions/:id/book", "coaching booking created"],
    ["delete /api/coaching-sessions/:id/booking", "coaching booking withdrawn"],
    ["delete /api/coaching-sessions/:id", "coaching session deleted"],
    ["post /api/beginners-courses", "beginners course created"],
    ["post /api/beginners-courses/:id/approve", "beginners course approved"],
    ["post /api/beginners-courses/:id/reject", "beginners course rejected"],
    ["delete /api/beginners-courses/:id", "beginners course cancelled"],
    ["post /api/beginners-courses/:id/beginners", "beginner added to course"],
    ["post /api/beginners-course-participants/:id/reset-password", "beginner password reset"],
    ["put /api/beginners-course-participants/:id", "beginner updated"],
    ["delete /api/beginners-course-participants/:id", "beginner removed from course"],
    ["post /api/beginners-course-participants/:id/transfer-to-beginners-course", "beginner transferred to course"],
    ["post /api/beginners-course-participants/:id/convert", "beginner converted to member"],
    ["post /api/beginners-course-participants/:id/assign-case", "beginner case assigned"],
    ["post /api/beginners-course-lessons/:id/coaches", "lesson coaches assigned"],
    ["post /api/range-members/mobile-check-in", "mobile check-in recorded"],
  ] as const;

  const matchedFallbackAction = fallbackActionLabels.find(
    ([actionPattern]) => actionPattern === normalizedAction,
  );

  if (matchedFallbackAction) {
    return matchedFallbackAction[1];
  }

  if (/^(post|put|patch|delete|get)\s+\/api\//.test(normalizedAction)) {
    if (normalizedAction.startsWith("delete ")) {
      return "delete completed";
    }

    if (normalizedAction.startsWith("put ") || normalizedAction.startsWith("patch ")) {
      return "update completed";
    }

    if (normalizedAction.startsWith("post ")) {
      return "action completed";
    }

    return "request completed";
  }

  return event.action.split("_").join(" ").toLowerCase();
}

function getActivitySourceLabel(metadata: EntityChangeAuditMetadata) {
  const changes = metadata.changes ?? [];
  const activityType = changes.find((change) => change.path === "activityType")?.after;
  const method = changes.find((change) => change.path === "method")?.after;

  if (activityType === "login_failed" && method === "rfid") {
    return "Source: RFID";
  }

  if (activityType === "login_failed" && method === "password") {
    return "Source: Website";
  }

  if (activityType === "mobile_check_in" || method === "mobile-app") {
    return "Source: Mobile";
  }

  if (method === "rfid") {
    return "Source: RFID";
  }

  if (method === "password-mobile") {
    return "Source: Mobile";
  }

  if (method === "password") {
    return "Source: Website";
  }

  return "";
}

function getActivityChangeValue(
  metadata: EntityChangeAuditMetadata,
  path: string,
) {
  return (metadata.changes ?? []).find((change) => change.path === path)?.after;
}

function isGenericRequestAuditEvent(event: AuditEventRecord) {
  return !isEntityChangeMetadata(event.metadata);
}

function formatIncorrectFieldLabel(field: string) {
  switch (field) {
    case "username":
      return "Username";
    case "password":
      return "Password";
    case "rfid_tag":
      return "RFID tag";
    default:
      return field.split("_").join(" ");
  }
}

function formatAuthFailureReason(reason: AuthActivityFailureReason | string) {
  switch (reason) {
    case "missing_credentials":
      return "Missing sign-in details";
    case "username_not_found":
      return "Unknown username";
    case "password_incorrect":
      return "Incorrect password";
    case "account_inactive":
      return "Inactive account";
    case "missing_rfid_tag":
      return "Missing RFID tag";
    case "rfid_tag_not_recognised":
      return "RFID tag not recognised";
    default:
      return reason.split("_").join(" ");
  }
}

function formatAuthFailureSummary(metadata: EntityChangeAuditMetadata) {
  const activityType = getActivityChangeValue(metadata, "activityType");

  if (activityType !== "login_failed") {
    return "";
  }

  const reason = getActivityChangeValue(metadata, "failureReason");
  const incorrectFields = getActivityChangeValue(metadata, "incorrectFields");
  const attemptedUsername = getActivityChangeValue(metadata, "attemptedUsername");
  const attemptedRfidTagSuffix = getActivityChangeValue(metadata, "attemptedRfidTagSuffix");
  const parts = [];

  if (typeof reason === "string" && reason) {
    parts.push(formatAuthFailureReason(reason));
  }

  if (Array.isArray(incorrectFields) && incorrectFields.length > 0) {
    const labels = incorrectFields
      .filter((field): field is string => typeof field === "string" && field.length > 0)
      .map(formatIncorrectFieldLabel);

    if (labels.length > 0) {
      parts.push(`Incorrect: ${labels.join(", ")}`);
    }
  }

  if (typeof attemptedUsername === "string" && attemptedUsername) {
    parts.push(`Attempted username: ${attemptedUsername}`);
  } else if (typeof attemptedRfidTagSuffix === "string" && attemptedRfidTagSuffix) {
    parts.push(`RFID ending: ${attemptedRfidTagSuffix}`);
  }

  return parts.join(" | ");
}

function toSentenceCase(value: string) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isActivityAuditMetadata(metadata: unknown): metadata is EntityChangeAuditMetadata {
  return isEntityChangeMetadata(metadata) &&
    (
      metadata.entityType === "member_activity" ||
      metadata.entityType === "guest_activity" ||
      metadata.entityType === "auth_activity"
    );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasMeaningfulMetadata(metadata: unknown) {
  if (!isPlainObject(metadata)) {
    return false;
  }

  if (isEntityChangeMetadata(metadata)) {
    return (metadata.changes?.length ?? 0) > 0;
  }

  const body = isPlainObject(metadata.body) ? metadata.body : null;
  const meaningfulKeys = Object.keys(metadata).filter((key) => {
    if (key === "durationMs") {
      return false;
    }

    if (key === "body") {
      return Boolean(body && Object.keys(body).length > 0);
    }

    return metadata[key] !== null && metadata[key] !== undefined;
  });

  return meaningfulKeys.length > 0;
}

function formatMetadataPreview(metadata: unknown) {
  if (!hasMeaningfulMetadata(metadata)) {
    return "";
  }

  const record = metadata as Record<string, unknown>;
  const entityChangeMetadata = record as EntityChangeAuditMetadata;

  if (
    entityChangeMetadata.auditKind === "entity_change" &&
    Array.isArray(entityChangeMetadata.changes)
  ) {
    if (entityChangeMetadata.entityType === "member_activity") {
      return "";
    }

    if (entityChangeMetadata.entityType === "guest_activity") {
      const invitedByName = getActivityChangeValue(entityChangeMetadata, "invitedByName");
      return typeof invitedByName === "string" && invitedByName
        ? `Invited by ${invitedByName}`
        : "";
    }

    if (
      entityChangeMetadata.entityType === "golden_records_sync" &&
      entityChangeMetadata.action === "handicap_refreshed"
    ) {
      const syncedCount = Number(getActivityChangeValue(entityChangeMetadata, "syncedCount") ?? 0);
      const signOffCount = Number(getActivityChangeValue(entityChangeMetadata, "signOffCount") ?? 0);

      if (syncedCount === 0 && signOffCount === 0) {
        return "No local handicap changes were needed.";
      }

      return `${syncedCount} handicap ${syncedCount === 1 ? "field" : "fields"} updated, ${signOffCount} distance sign-${signOffCount === 1 ? "off" : "offs"} refreshed.`;
    }

    if (entityChangeMetadata.entityType === "auth_activity") {
      return formatAuthFailureSummary(entityChangeMetadata);
    }

    const count = entityChangeMetadata.changes.length;
    const entityLabel =
      entityChangeMetadata.entityLabel ||
      entityChangeMetadata.entityType ||
      "record";
    return `${count} change${count === 1 ? "" : "s"} on ${entityLabel}`;
  }

  if (record.before && record.after) {
    return "Before and after values captured.";
  }

  if (record.body && typeof record.body === "object") {
    const keys = Object.keys(record.body as Record<string, unknown>);
    return keys.length > 0 ? `${keys.length} field${keys.length === 1 ? "" : "s"} captured` : "Body captured.";
  }

  const remainingKeys = Object.keys(record).filter(
    (key) => key !== "durationMs" && key !== "body",
  );

  return remainingKeys.length > 0 ? "Metadata captured." : "";
}

function isEntityChangeMetadata(metadata: unknown): metadata is EntityChangeAuditMetadata {
  return Boolean(metadata) &&
    typeof metadata === "object" &&
    (metadata as EntityChangeAuditMetadata).auditKind === "entity_change" &&
    Array.isArray((metadata as EntityChangeAuditMetadata).changes);
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "empty";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatAuditChangePath(path: string) {
  const pathLabelMap: Record<string, string> = {
    membershipStatus: "Membership status",
    programmeType: "Programme type",
    userType: "Role",
    activeMember: "Active member",
    affiliateMember: "Affiliate member",
    juniorMember: "Junior member",
    archeryGbMembershipNumber: "Archery GB number",
    emailAddress: "Email address",
    membershipFeesDue: "Membership fees due",
    coachingVolunteer: "Coaching volunteer",
    firstName: "First name",
    surname: "Surname",
    username: "Username",
    rfidTag: "RFID tag",
  };

  if (pathLabelMap[path]) {
    return pathLabelMap[path];
  }

  return path
    .replace(/\[(\d+)\]/g, " $1")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(".")
    .map((segment) => segment.replace(/_/g, " "))
    .join(" / ");
}

function GenericAuditMetadataDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const body = isPlainObject(metadata.body) ? metadata.body : null;

  if (body && Object.keys(body).length > 0) {
    return (
      <details className="audit-log-details">
        <summary className="audit-log-details-toggle">
          {formatMetadataPreview(metadata) || "View details"}
        </summary>
        <div className="audit-log-body-list">
          {Object.entries(body).map(([key, value]) => (
            <div key={key} className="audit-log-body-item">
              <span className="audit-log-body-key">{key}</span>
              <pre className="audit-log-body-value">{formatAuditValue(value)}</pre>
            </div>
          ))}
        </div>
      </details>
    );
  }

  const remainingMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
      if (key === "durationMs" || key === "body") {
        return false;
      }

      return value !== null && value !== undefined;
    }),
  );

  if (Object.keys(remainingMetadata).length === 0) {
    return null;
  }

  return (
    <details className="audit-log-details">
      <summary className="audit-log-details-toggle">
        {formatMetadataPreview(metadata) || "View metadata"}
      </summary>
      <pre className="audit-log-metadata">{JSON.stringify(remainingMetadata, null, 2)}</pre>
    </details>
  );
}

function AuditDetailsSummary({ event }: { event: AuditEventRecord }) {
  const metadata = event.metadata;
  const entityLabel = isEntityChangeMetadata(metadata)
    ? metadata.entityLabel || metadata.entityType || ""
    : "";
  const activitySource = isActivityAuditMetadata(metadata)
    ? getActivitySourceLabel(metadata)
    : "";

  return (
    <div className="audit-log-details-summary">
      {entityLabel ? (
        <p className="audit-log-details-heading">{entityLabel}</p>
      ) : null}
      {activitySource ? (
        <p className="audit-log-preview">{activitySource}</p>
      ) : null}
      {formatMetadataPreview(event.metadata) ? (
        <p className="audit-log-preview">{formatMetadataPreview(event.metadata)}</p>
      ) : null}
    </div>
  );
}

function AuditMetadataDetails({ metadata }: { metadata: unknown }) {
  if (!metadata || !hasMeaningfulMetadata(metadata)) {
    return <span className="audit-log-muted">-</span>;
  }

  if (isActivityAuditMetadata(metadata)) {
    return null;
  }

  if (isEntityChangeMetadata(metadata)) {
    return (
      <details className="audit-log-details">
        <summary className="audit-log-details-toggle">
          {toSentenceCase(
            metadata.entityType
              ? `${metadata.action ?? "changed"} ${metadata.entityType.split("_").join(" ")}`
              : "view changes",
          )}
        </summary>
        <div className="audit-log-change-list">
          <table className="audit-log-change-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {(metadata.changes ?? []).map((change) => (
                <tr key={change.path}>
                  <td className="audit-log-change-path">{formatAuditChangePath(change.path)}</td>
                  <td>
                    <pre className="audit-log-change-value">
                      {formatAuditValue(change.before)}
                    </pre>
                  </td>
                  <td>
                    <pre className="audit-log-change-value">
                      {formatAuditValue(change.after)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    );
  }

  return <GenericAuditMetadataDetails metadata={metadata as Record<string, unknown>} />;
}

function dedupeAuditEvents(events: AuditEventRecord[]) {
  const explicitKeys = new Set(
    events
      .filter((event) => isEntityChangeMetadata(event.metadata))
      .map((event) =>
        [
          event.actorUsername || "",
          event.createdAtDate || "",
          event.createdAtTime || "",
          formatAuditAction(event),
        ].join("|"),
      ),
  );

  return events.filter((event) => {
    if (!isGenericRequestAuditEvent(event)) {
      return true;
    }

    const key = [
      event.actorUsername || "",
      event.createdAtDate || "",
      event.createdAtTime || "",
      formatAuditAction(event),
    ].join("|");

    return !explicitKeys.has(key);
  });
}

function AuditLogDesktopTable({ events }: { events: AuditEventRecord[] }) {
  if (events.length === 0) {
    return <p className="usage-empty-state">No audit events match the selected filters.</p>;
  }

  return (
    <div className="reporting-table-wrap">
      <table className="committee-roles-table audit-log-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{formatAuditTimestamp(event)}</td>
              <td>{event.actorUsername || "-"}</td>
              <td className="audit-log-action-cell">
                {toSentenceCase(formatAuditAction(event))}
              </td>
              <td>
                <AuditDetailsSummary event={event} />
                <AuditMetadataDetails metadata={event.metadata} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogMobileCards({ events }: { events: AuditEventRecord[] }) {
  if (events.length === 0) {
    return <p className="usage-empty-state">No audit events match the selected filters.</p>;
  }

  return (
    <div className="audit-log-card-list">
      {events.map((event) => (
        <article key={event.id} className="home-panel audit-log-card">
          <h3 className="home-panel-title">{toSentenceCase(formatAuditAction(event))}</h3>
          <div className="audit-log-card-grid">
            <p><strong>When:</strong> {formatAuditTimestamp(event)}</p>
            <p><strong>Who:</strong> {event.actorUsername || "-"}</p>
          </div>
          <AuditDetailsSummary event={event} />
          <AuditMetadataDetails metadata={event.metadata} />
        </article>
      ))}
    </div>
  );
}

export function AuditLogPage({ currentUserProfile }: AuditLogPageProps) {
  const isMobile = useIsMobile();
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canViewAuditLog = hasPermission(currentUserProfile, "view_reports");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");

  const queryResult = useQuery({
    queryKey: queryKeys.list(
      actorUsername,
      actorFilter,
      actionFilter,
      dateFrom,
      dateTo,
      sortBy,
      sortDirection,
    ),
    queryFn: async () => {
      const result = await getAuditEvents(currentUserProfile, {
        actorUsername: actorFilter,
        dateFrom,
        dateTo,
        sortBy,
        sortDirection,
        limit: 250,
      });

      return result.auditEvents;
    },
    enabled: canViewAuditLog && Boolean(actorUsername),
  });

  const normalizedEvents = useMemo(() => {
    return dedupeAuditEvents(queryResult.data ?? []);
  }, [queryResult.data]);

  const actionOptions = useMemo(() => {
    const options = new Set(
      normalizedEvents.map((event) => toSentenceCase(formatAuditAction(event))),
    );

    return [...options].sort((left, right) => left.localeCompare(right));
  }, [normalizedEvents]);

  const actorOptions = useMemo(() => {
    const options = new Set(
      normalizedEvents
        .map((event) => event.actorUsername?.trim())
        .filter((value): value is string => Boolean(value)),
    );

    return [...options].sort((left, right) => left.localeCompare(right));
  }, [normalizedEvents]);

  const filteredEvents = useMemo(() => {
    if (!actionFilter) {
      return normalizedEvents;
    }

    return normalizedEvents.filter(
      (event) => toSentenceCase(formatAuditAction(event)) === actionFilter,
    );
  }, [actionFilter, normalizedEvents]);

  const summaryLabel = useMemo(() => {
    const count = filteredEvents.length;
    return `${count} audit event${count === 1 ? "" : "s"} shown`;
  }, [filteredEvents]);

  if (!canViewAuditLog) {
    return <p>You do not have permission to view audit logs.</p>;
  }

  return (
    <div className="range-usage-dashboard audit-log-page">
      <p className="range-usage-title">Audit Log</p>

      <section className="usage-filter-panel audit-log-filter-panel">
        <div className="audit-log-filter-header">
          <div>
            <h2 className="audit-log-filter-title">Refine Audit Events</h2>
            <p className="audit-log-filter-copy">
              Filter by who, action, and date range.
            </p>
          </div>
          <p className="audit-log-summary">{summaryLabel}</p>
        </div>

        <div className="audit-log-filter-grid">
          <div className="audit-log-filter-group">
            <p className="audit-log-filter-group-title">Search</p>
            <div className="audit-log-filter-fields">
              <label>
                <span className="audit-log-filter-label">Who</span>
                <select
                  className="profile-input"
                  value={actorFilter}
                  onChange={(event) => setActorFilter(event.target.value)}
                >
                  <option value="">All members</option>
                  {actorOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="audit-log-filter-label">Action</span>
                <select
                  className="profile-input"
                  value={actionFilter}
                  onChange={(event) => setActionFilter(event.target.value)}
                >
                  <option value="">All actions</option>
                  {actionOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="audit-log-filter-group">
            <p className="audit-log-filter-group-title">Range And Order</p>
            <div className="audit-log-filter-fields">
              <DatePicker
                label="From"
                value={dateFrom}
                onChange={setDateFrom}
                max={dateTo || undefined}
              />

              <DatePicker
                label="To"
                value={dateTo}
                onChange={setDateTo}
                min={dateFrom || undefined}
              />

              <label>
                <span className="audit-log-filter-label">Sort by</span>
                <select
                  className="profile-input"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="createdAt">Timestamp</option>
                  <option value="actorUsername">Who</option>
                  <option value="action">Action</option>
                </select>
              </label>

              <label>
                <span className="audit-log-filter-label">Direction</span>
                <select
                  className="profile-input"
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value)}
                >
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="audit-log-filter-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setActorFilter("");
              setActionFilter("");
              setDateFrom("");
              setDateTo("");
              setSortBy("createdAt");
              setSortDirection("desc");
            }}
          >
            Clear Filters
          </Button>
        </div>
      </section>

      <StatusMessagePanel
        error={
          queryResult.error instanceof Error
            ? queryResult.error.message
            : queryResult.error
              ? "Unable to load the audit log."
              : ""
        }
        loading={queryResult.isLoading || queryResult.isFetching}
        loadingLabel="Loading audit log..."
      />

      {isMobile
        ? <AuditLogMobileCards events={filteredEvents} />
        : <AuditLogDesktopTable events={filteredEvents} />}
    </div>
  );
}
