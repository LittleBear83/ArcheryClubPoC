import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGoldenRecordsAdminSummary,
  syncGoldenRecordsLookups,
  testGoldenRecordsHealth,
} from "../../api/goldenRecordsApi";
import { formatDateTime } from "../../utils/dateTime";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";

type GoldenRecordsAdminPageProps = {
  currentUserProfile: unknown;
};

const goldenRecordsQueryKeys = {
  summary: (actorUsername: string) => ["golden-records-admin", actorUsername] as const,
};

function getActorRole(profile: unknown) {
  if (!profile || typeof profile !== "object") {
    return "";
  }

  const value = profile as {
    membership?: { role?: string | null };
    userType?: string | null;
    user_type?: string | null;
  };

  return String(value.membership?.role ?? value.userType ?? value.user_type ?? "").trim();
}

function formatLookupLabel(value: string) {
  return value
    .split("-")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

export function GoldenRecordsAdminPage({
  currentUserProfile,
}: GoldenRecordsAdminPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth?.username ?? "";
  const actorRole = getActorRole(currentUserProfile).toLowerCase();
  const canManageGoldenRecords = actorRole === "admin" || actorRole === "developer";
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: goldenRecordsQueryKeys.summary(actorUsername),
    queryFn: () => getGoldenRecordsAdminSummary(currentUserProfile),
    enabled: canManageGoldenRecords && Boolean(actorUsername),
  });

  const refreshSummary = async () => {
    await queryClient.invalidateQueries({
      queryKey: goldenRecordsQueryKeys.summary(actorUsername),
    });
  };

  const connectionTestMutation = useMutation({
    mutationFn: () => testGoldenRecordsHealth(currentUserProfile),
    onMutate: () => {
      setActionError("");
      setActionSuccess("");
    },
    onSuccess: async (result) => {
      setActionSuccess(result.message);
      await refreshSummary();
    },
    onError: async (error: Error) => {
      setActionError(error.message);
      await refreshSummary();
    },
  });

  const lookupSyncMutation = useMutation({
    mutationFn: () => syncGoldenRecordsLookups(currentUserProfile),
    onMutate: () => {
      setActionError("");
      setActionSuccess("");
    },
    onSuccess: async (result) => {
      setActionSuccess(result.message);
      await refreshSummary();
    },
    onError: async (error: Error) => {
      setActionError(error.message);
      await refreshSummary();
    },
  });

  if (!canManageGoldenRecords) {
    return <p>You do not have permission to view Golden Records settings.</p>;
  }

  const summary = data?.summary;
  const lastConnectionTest = summary?.lastConnectionTest ?? null;
  const lastSyncStatus = summary?.lastSyncStatus ?? null;

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form" title="Golden Records Admin">
        <p>
          Manage the read-only Golden Records integration, run a safe connection
          test, and refresh cached reference data used by future sync phases.
        </p>

        <StatusMessagePanel
          error={actionError}
          loading={isLoading || connectionTestMutation.isPending || lookupSyncMutation.isPending}
          loadingLabel={
            connectionTestMutation.isPending
              ? "Testing Golden Records connection..."
              : lookupSyncMutation.isPending
                ? "Syncing Golden Records lookup data..."
                : "Loading Golden Records settings..."
          }
          success={actionSuccess}
        />

        <div className="golden-records-admin-grid">
          <section className="golden-records-admin-card">
            <h3>Connection</h3>
            <p>
              <strong>Enabled:</strong> {summary?.enabled ? "Yes" : "No"}
            </p>
            <p>
              <strong>Auth mode:</strong> {summary?.authMode || "Not configured"}
            </p>
            <p>
              <strong>Endpoint:</strong> {summary?.maskedBaseUrl || "Not configured"}
            </p>
            <p>
              <strong>Last successful connection test:</strong>{" "}
              {lastConnectionTest?.ok && lastConnectionTest.testedAt
                ? formatDateTime(lastConnectionTest.testedAt)
                : "None recorded"}
            </p>
            <p>
              <strong>Last response:</strong>{" "}
              {lastConnectionTest?.diagnostics?.status
                ? `${lastConnectionTest.diagnostics.status} ${lastConnectionTest.diagnostics.statusText ?? ""}`.trim()
                : "No diagnostics yet"}
            </p>
            <div className="range-rules-editor-actions">
              <Button
                onClick={() => connectionTestMutation.mutate()}
                disabled={connectionTestMutation.isPending || lookupSyncMutation.isPending}
              >
                Run Connection Test
              </Button>
            </div>
          </section>

          <section className="golden-records-admin-card">
            <h3>Lookup Sync</h3>
            <p>
              <strong>Last sync status:</strong>{" "}
              {lastSyncStatus?.status ? String(lastSyncStatus.status) : "Not run yet"}
            </p>
            <p>
              <strong>Last sync time:</strong>{" "}
              {lastSyncStatus?.fetchedAt ? formatDateTime(lastSyncStatus.fetchedAt) : "Never"}
            </p>
            <p>
              <strong>Last sync summary:</strong>{" "}
              {lastSyncStatus?.summary || "No lookup sync has been run yet."}
            </p>
            <p>
              <strong>Last failure summary:</strong>{" "}
              {summary?.lastFailureSummary || "None"}
            </p>
            <div className="range-rules-editor-actions">
              <Button
                onClick={() => lookupSyncMutation.mutate()}
                disabled={lookupSyncMutation.isPending || connectionTestMutation.isPending}
              >
                Sync Lookup Data
              </Button>
            </div>
          </section>
        </div>

        <section className="golden-records-admin-card">
          <h3>Cached Lookup Collections</h3>
          {summary?.lookupCounts?.length ? (
            <div className="golden-records-admin-list">
              {summary.lookupCounts.map((lookup) => (
                <article key={lookup.lookupType} className="golden-records-admin-list-item">
                  <strong>{formatLookupLabel(lookup.lookupType)}</strong>
                  <span>{lookup.itemCount} records</span>
                  <span>
                    {lookup.fetchedAt ? `Fetched ${formatDateTime(lookup.fetchedAt)}` : "Not fetched yet"}
                  </span>
                  <span>
                    {lookup.updatedByUsername
                      ? `Last updated by ${lookup.updatedByUsername}`
                      : "No update actor recorded"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p>No Golden Records lookup data has been cached yet.</p>
          )}
        </section>
      </SectionPanel>
    </div>
  );
}
