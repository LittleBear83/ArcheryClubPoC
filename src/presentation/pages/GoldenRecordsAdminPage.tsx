import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { MemberProfileApi } from "../../api/memberProfileApi";
import type { GoldenRecordsCandidateMatch } from "../../domain/entities/MemberProfile";
import {
  getGoldenRecordsAdminSummary,
  syncGoldenRecordsLookups,
  testGoldenRecordsHealth,
} from "../../api/goldenRecordsApi";
import { getGoldenRecordsMemberSyncJob, triggerGoldenRecordsOutdoorTableSync } from "../../api/outdoorTableApi";
import { formatDateTime } from "../../utils/dateTime";
import { Button } from "../components/Button";
import { MemberAutocomplete } from "../components/MemberAutocomplete";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";

type GoldenRecordsAdminPageProps = {
  currentUserProfile: unknown;
};

const goldenRecordsQueryKeys = {
  summary: (actorUsername: string) => ["golden-records-admin", actorUsername] as const,
};

const memberProfileApi = new MemberProfileApi();

function GoldenRecordsSlice({ children, title }: { children: ReactNode; title: string }) {
  return (
    <details className="golden-records-admin-card" open>
      <summary className="golden-records-admin-card-summary" title={`Show or hide ${title}`}>
        <span>{title}</span>
        <span className="profile-accordion-icon" aria-hidden="true" />
      </summary>
      <div className="golden-records-admin-card-content">{children}</div>
    </details>
  );
}

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
  const [selectedUsername, setSelectedUsername] = useState("");
  const [candidateMatches, setCandidateMatches] = useState<GoldenRecordsCandidateMatch[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [isMatchConfirmOpen, setIsMatchConfirmOpen] = useState(false);
  const lastHandledJobId = useRef("");

  const jobQuery = useQuery({
    queryKey: ["golden-records-sync-job", actorUsername],
    queryFn: () => getGoldenRecordsMemberSyncJob(currentUserProfile),
    enabled: canManageGoldenRecords && Boolean(actorUsername),
    refetchInterval: (query) => query.state.data?.job?.state === "running" ? 2000 : false,
  });
  const memberSyncJob = jobQuery.data?.job;

  useEffect(() => {
    if (!memberSyncJob || memberSyncJob.state === "running" || lastHandledJobId.current === memberSyncJob.id) return;
    lastHandledJobId.current = memberSyncJob.id;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["outdoor-table"] }),
      queryClient.invalidateQueries({ queryKey: ["indoor-table"] }),
      queryClient.invalidateQueries({ queryKey: ["member-profiles"] }),
      queryClient.invalidateQueries({ queryKey: goldenRecordsQueryKeys.summary(actorUsername) }),
    ]);
  }, [actorUsername, memberSyncJob, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: goldenRecordsQueryKeys.summary(actorUsername),
    queryFn: () => getGoldenRecordsAdminSummary(currentUserProfile),
    enabled: canManageGoldenRecords && Boolean(actorUsername),
  });
  const memberOptionsQuery = useQuery({
    queryKey: ["golden-records-admin-members", actorUsername],
    queryFn: () => memberProfileApi.getProfileOptions(actorUsername),
    enabled: canManageGoldenRecords && Boolean(actorUsername),
  });

  const invalidateAchievements = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["outdoor-table"] }),
      queryClient.invalidateQueries({ queryKey: ["indoor-table"] }),
      queryClient.invalidateQueries({ queryKey: ["member-profiles"] }),
    ]);
  };

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

  const memberSyncMutation = useMutation({
    mutationFn: () => triggerGoldenRecordsOutdoorTableSync(currentUserProfile),
    onMutate: () => {
      setActionError("");
      setActionSuccess("");
    },
    onSuccess: async (result) => {
      setActionSuccess(result.message);
      await jobQuery.refetch();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const individualSyncMutation = useMutation({
    mutationFn: () => memberProfileApi.refreshGoldenRecordsHandicap(actorUsername, selectedUsername),
    onMutate: () => {
      setActionError("");
      setActionSuccess("");
      setCandidateMatches([]);
      setSelectedCandidateId("");
    },
    onSuccess: async (result) => {
      setActionSuccess(result.message || `Golden Records refreshed for ${selectedUsername}.`);
      await invalidateAchievements();
    },
    onError: (error: Error) => {
      const matches = error instanceof ApiError
        ? (error.payload as { candidateMatches?: GoldenRecordsCandidateMatch[] }).candidateMatches
        : undefined;
      if (Array.isArray(matches) && matches.length) {
        setCandidateMatches(matches);
        setSelectedCandidateId(matches[0].memberId);
      }
      setActionError(error.message);
    },
  });

  const assignMatchMutation = useMutation({
    mutationFn: () => memberProfileApi.assignGoldenRecordsMatch(
      actorUsername, selectedUsername, selectedCandidateId,
    ),
    onMutate: () => {
      setActionError("");
      setActionSuccess("");
    },
    onSuccess: async (result) => {
      setIsMatchConfirmOpen(false);
      setCandidateMatches([]);
      setSelectedCandidateId("");
      setActionSuccess(result.message || `Golden Records account assigned to ${selectedUsername}.`);
      await invalidateAchievements();
    },
    onError: (error: Error) => setActionError(error.message),
  });

  if (!canManageGoldenRecords) {
    return <p>You do not have permission to view Golden Records settings.</p>;
  }

  const summary = data?.summary;
  const lastConnectionTest = summary?.lastConnectionTest ?? null;
  const lastSyncStatus = summary?.lastSyncStatus ?? null;
  const selectedMember = memberOptionsQuery.data?.members.find((member) => member.username === selectedUsername);
  const selectedCandidate = candidateMatches.find((candidate) => candidate.memberId === selectedCandidateId);
  const finishedJob = memberSyncJob && memberSyncJob.state !== "running" ? memberSyncJob : null;
  const jobError = finishedJob && (finishedJob.state === "failed" || finishedJob.state === "interrupted")
    ? finishedJob.failureMessage || "Golden Records member sync failed."
    : "";
  const jobSuccess = finishedJob && !jobError
    ? `Golden Records member sync finished: ${finishedJob.matchedCount} matched, ${finishedJob.unmatchedCount} unmatched, ${finishedJob.achievementCount} achievements, ${finishedJob.errorCount} errors.`
    : "";

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form golden-records-admin-panel" title="Golden Records Admin">
        <p>
          Test the Golden Records connection, sync existing portal members and
          achievements, and refresh cached reference data.
        </p>

        <StatusMessagePanel
          error={actionError || (actionSuccess ? "" : jobError)}
          loading={isLoading || connectionTestMutation.isPending || lookupSyncMutation.isPending || memberSyncMutation.isPending || individualSyncMutation.isPending || assignMatchMutation.isPending}
          loadingLabel={
            connectionTestMutation.isPending
              ? "Testing Golden Records connection..."
              : memberSyncMutation.isPending
                ? "Syncing Golden Records members and achievements..."
              : individualSyncMutation.isPending
                ? `Syncing ${selectedMember?.fullName || selectedUsername}...`
              : assignMatchMutation.isPending
                ? "Assigning Golden Records account..."
              : lookupSyncMutation.isPending
                ? "Syncing Golden Records lookup data..."
                : "Loading Golden Records settings..."
          }
          success={actionError ? "" : actionSuccess || jobSuccess}
        />

        <div className="golden-records-admin-grid">
          <GoldenRecordsSlice title="Connection">
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
                title="Check whether this portal can connect to the Golden Records API."
                onClick={() => connectionTestMutation.mutate()}
                disabled={connectionTestMutation.isPending || lookupSyncMutation.isPending}
              >
                Run Connection Test
              </Button>
            </div>
          </GoldenRecordsSlice>

          <GoldenRecordsSlice title="Lookup Sync">
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
                title="Refresh cached Golden Records reference lists used by the portal."
                onClick={() => lookupSyncMutation.mutate()}
                disabled={lookupSyncMutation.isPending || connectionTestMutation.isPending}
              >
                Sync Lookup Data
              </Button>
            </div>
          </GoldenRecordsSlice>
        </div>

        <GoldenRecordsSlice title="Member and Achievement Sync">
          <p>
            Sync existing portal members using their Golden Records ID, AGB number, email,
            or a unique exact full-name match. Ambiguous names remain unmatched; add an
            AGB number or email to their portal profile, then rerun the sync. The sync
            refreshes outdoor achievements and indoor handicaps.
          </p>
          <Button
            title="Sync all portal members from Golden Records, including outdoor achievements and indoor handicaps."
            onClick={() => memberSyncMutation.mutate()}
            disabled={memberSyncJob?.state === "running" || memberSyncMutation.isPending || connectionTestMutation.isPending || lookupSyncMutation.isPending}
          >
            {memberSyncJob?.state === "running" ? "Sync in progress" : "Sync Members and Achievements"}
          </Button>
          {memberSyncJob ? (
            <div role="status">
              <p>
                <strong>Status:</strong> {memberSyncJob.state}. {memberSyncJob.attemptedCount} members attempted; {memberSyncJob.matchedCount} matched, {memberSyncJob.unmatchedCount} unmatched, {memberSyncJob.errorCount} errors.
                {memberSyncJob.failureMessage ? ` ${memberSyncJob.failureMessage}` : ""}
              </p>
              {memberSyncJob.errors?.length ? (
                <ul>{memberSyncJob.errors.slice(0, 10).map((error, index) => (
                  <li key={`${error.username}-${index}`}>{error.username}: {error.message}</li>
                ))}</ul>
              ) : null}
            </div>
          ) : null}
        </GoldenRecordsSlice>

        <GoldenRecordsSlice title="Individual Member Sync">
          <p>Refresh one member from Golden Records, including their outdoor achievements and indoor handicaps.</p>
          <div className="golden-records-admin-member-actions">
            <MemberAutocomplete
              label="Select member"
              options={(memberOptionsQuery.data?.members ?? []).map((member) => ({
                label: member.fullName || member.username,
                keywords: [member.username],
                value: member.username,
              }))}
              value={selectedUsername}
              onValueChange={(username) => {
                setSelectedUsername(username);
                setCandidateMatches([]);
                setSelectedCandidateId("");
                setActionError("");
              }}
              disabled={memberOptionsQuery.isLoading || individualSyncMutation.isPending || assignMatchMutation.isPending}
            />
            <Button
              title="Fetch this member's current Golden Records data and update their achievement rows."
              onClick={() => individualSyncMutation.mutate()}
              disabled={!selectedUsername || individualSyncMutation.isPending || assignMatchMutation.isPending || memberSyncJob?.state === "running"}
            >
              {individualSyncMutation.isPending ? "Syncing member..." : "Sync Selected Member"}
            </Button>
          </div>
          {memberOptionsQuery.isError ? <p role="alert">Could not load members for individual sync.</p> : null}
          {candidateMatches.length ? (
            <div className="golden-records-admin-match">
              <p>Golden Records could not identify this member uniquely. Review the suggested accounts before assigning one.</p>
              <MemberAutocomplete
                label="Golden Records account"
                options={candidateMatches.map((candidate) => ({
                  label: candidate.name,
                  secondaryText: candidate.membershipId || undefined,
                  keywords: [candidate.memberId, candidate.membershipId],
                  value: candidate.memberId,
                }))}
                value={selectedCandidateId}
                onValueChange={setSelectedCandidateId}
                disabled={assignMatchMutation.isPending}
              />
              <Button
                title="Review the chosen Golden Records account before linking it to this member."
                onClick={() => setIsMatchConfirmOpen(true)}
                disabled={!selectedCandidateId || assignMatchMutation.isPending}
              >
                Review Account Match
              </Button>
            </div>
          ) : null}
        </GoldenRecordsSlice>

        <GoldenRecordsSlice title="Cached Lookup Collections">
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
        </GoldenRecordsSlice>
      </SectionPanel>
      <Modal open={isMatchConfirmOpen} onClose={() => !assignMatchMutation.isPending && setIsMatchConfirmOpen(false)} title="Confirm Golden Records Assignment">
        <div className="profile-card-issue-modal">
          <p>Assign <strong>{selectedCandidate?.name}</strong> to <strong>{selectedMember?.fullName || selectedUsername}</strong>?</p>
          <p className="profile-card-issue-note">Confirm the account carefully. The selected account's records will be linked to this member.</p>
          {actionError ? <p className="profile-error">{actionError}</p> : null}
          <div className="profile-card-issue-actions">
            <Button variant="secondary" title="Close without assigning an account." onClick={() => setIsMatchConfirmOpen(false)} disabled={assignMatchMutation.isPending}>Cancel</Button>
            <Button title="Link this Golden Records account and sync its records to the selected member." onClick={() => assignMatchMutation.mutate()} disabled={!selectedUsername || !selectedCandidateId || assignMatchMutation.isPending}>
              {assignMatchMutation.isPending ? "Assigning..." : "Assign Golden Records Account"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
