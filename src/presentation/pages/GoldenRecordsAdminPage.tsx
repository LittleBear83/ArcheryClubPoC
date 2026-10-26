import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { MemberProfileApi } from "../../api/memberProfileApi";
import type { GoldenRecordsCandidateMatch } from "../../domain/entities/MemberProfile";
import {
  applyGoldenRecordsIndoorBackfill,
  applyGoldenRecordsBowDisciplineImport,
  getGoldenRecordsAdminSummary,
  previewGoldenRecordsBowDisciplineImport,
  previewGoldenRecordsIndoorBackfill,
  syncGoldenRecordsLookups,
  testGoldenRecordsHealth,
  type GoldenRecordsBowDisciplineImportPlan,
  type GoldenRecordsIndoorBackfillPlan,
} from "../../api/goldenRecordsApi";
import { getGoldenRecordsMemberSyncJob, triggerGoldenRecordsOutdoorTableSync } from "../../api/outdoorTableApi";
import { formatDateTime } from "../../utils/dateTime";
import { Button } from "../components/Button";
import { MemberAutocomplete } from "../components/MemberAutocomplete";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { refreshGoldenRecordsReferenceData } from "./goldenRecordsReferenceRefresh";

type GoldenRecordsAdminPageProps = {
  currentUserProfile: unknown;
};

const goldenRecordsQueryKeys = {
  summary: (actorUsername: string) => ["golden-records-admin", actorUsername] as const,
};

const memberProfileApi = new MemberProfileApi();

function GoldenRecordsSlice({ children, description, status, title }: {
  children: ReactNode;
  description: string;
  status?: string;
  title: string;
}) {
  return (
    <details className="golden-records-admin-card">
      <summary className="golden-records-admin-card-summary">
        <span className="golden-records-admin-card-heading">
          <span className="golden-records-admin-card-title">{title}</span>
          <span className="golden-records-admin-card-description">{description}</span>
        </span>
        {status ? <span className="golden-records-admin-card-status">{status}</span> : null}
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

const clubSyncTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function GoldenRecordsAdminPage({
  currentUserProfile,
}: GoldenRecordsAdminPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth?.username ?? "";
  const actorRole = getActorRole(currentUserProfile).toLowerCase();
  const canManageGoldenRecords = actorRole === "admin" || actorRole === "developer";
  const canImportBowDisciplines = actorRole === "developer";
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [candidateMatches, setCandidateMatches] = useState<GoldenRecordsCandidateMatch[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [isMatchConfirmOpen, setIsMatchConfirmOpen] = useState(false);
  const [bowImportPlan, setBowImportPlan] = useState<GoldenRecordsBowDisciplineImportPlan | null>(null);
  const [indoorBackfillPlan, setIndoorBackfillPlan] = useState<GoldenRecordsIndoorBackfillPlan | null>(null);
  const [isBowImportConfirmOpen, setIsBowImportConfirmOpen] = useState(false);
  const [isIndoorBackfillConfirmOpen, setIsIndoorBackfillConfirmOpen] = useState(false);
  const lastHandledJobId = useRef("");

  const jobQuery = useQuery({
    queryKey: ["golden-records-sync-job", actorUsername],
    queryFn: () => getGoldenRecordsMemberSyncJob(currentUserProfile),
    enabled: canManageGoldenRecords && Boolean(actorUsername),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.job?.state ?? "") ? 2000 : false,
  });
  const memberSyncJob = jobQuery.data?.job;

  useEffect(() => {
    if (!memberSyncJob || ["queued", "running"].includes(memberSyncJob.state) || lastHandledJobId.current === memberSyncJob.id) return;
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

  const referenceRefreshMutation = useMutation({
    mutationFn: () => refreshGoldenRecordsReferenceData(
      () => testGoldenRecordsHealth(currentUserProfile),
      () => syncGoldenRecordsLookups(currentUserProfile),
    ),
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
    onError: async (error: Error) => {
      setActionError(error.message);
      await jobQuery.refetch();
    },
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

  const bowImportPreviewMutation = useMutation({
    mutationFn: () => previewGoldenRecordsBowDisciplineImport(currentUserProfile),
    onMutate: () => { setActionError(""); setActionSuccess(""); setBowImportPlan(null); },
    onSuccess: (result) => setBowImportPlan(result.plan),
    onError: (error: Error) => setActionError(error.message),
  });
  const indoorBackfillPreviewMutation = useMutation({
    mutationFn: () => previewGoldenRecordsIndoorBackfill(currentUserProfile),
    onMutate: () => { setActionError(""); setIndoorBackfillPlan(null); },
    onSuccess: (result) => setIndoorBackfillPlan(result.plan),
    onError: (error: Error) => setActionError(error.message),
  });
  const indoorBackfillApplyMutation = useMutation({
    mutationFn: (planHash: string) => applyGoldenRecordsIndoorBackfill(currentUserProfile, planHash),
    onMutate: () => { setActionError(""); setActionSuccess(""); },
    onSuccess: async (result) => {
      setIsIndoorBackfillConfirmOpen(false);
      setIndoorBackfillPlan(null);
      setActionSuccess(result.message);
      await queryClient.invalidateQueries({ queryKey: ["indoor-table"] });
    },
    onError: (error: Error) => { setIsIndoorBackfillConfirmOpen(false); setIndoorBackfillPlan(null); setActionError(error.message); },
  });
  const bowImportApplyMutation = useMutation({
    mutationFn: (planHash: string) => applyGoldenRecordsBowDisciplineImport(currentUserProfile, planHash),
    onMutate: () => { setActionError(""); setActionSuccess(""); },
    onSuccess: async (result) => {
      setIsBowImportConfirmOpen(false);
      setBowImportPlan(null);
      setActionSuccess(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["member-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["golden-records-admin-members", actorUsername] }),
      ]);
    },
    onError: (error: Error) => { setIsBowImportConfirmOpen(false); setBowImportPlan(null); setActionError(error.message); },
  });

  if (!canManageGoldenRecords) {
    return <p>You do not have permission to view Golden Records settings.</p>;
  }

  const summary = data?.summary;
  const lastConnectionTest = summary?.lastConnectionTest ?? null;
  const lastSyncStatus = summary?.lastSyncStatus ?? null;
  const lastSuccessfulClubSyncAt = memberSyncJob?.lastSuccessfulAt ?? (memberSyncJob?.state === "completed" ? memberSyncJob.completedAt : null);
  const selectedMember = memberOptionsQuery.data?.members.find((member) => member.username === selectedUsername);
  const selectedCandidate = candidateMatches.find((candidate) => candidate.memberId === selectedCandidateId);
  const finishedJob = memberSyncJob && !["queued", "running"].includes(memberSyncJob.state) ? memberSyncJob : null;
  const jobError = finishedJob && (finishedJob.state === "failed" || finishedJob.state === "interrupted")
    ? finishedJob.failureMessage || "Golden Records member sync failed."
    : "";
  const jobNeedsReview = finishedJob?.state === "completed-with-errors";
  const jobSuccess = finishedJob && !jobError && !jobNeedsReview
    ? `Golden Records member sync finished: ${finishedJob.matchedCount} matched, ${finishedJob.unmatchedCount} unmatched, ${finishedJob.achievementCount} achievements, ${finishedJob.errorCount} errors.`
    : "";

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form golden-records-admin-panel" title="Golden Records Admin">
        <p>
          For a missing member result, sync that member. For a wider issue, check the club sync.
          Maintenance tools are for occasional checks and imports.
        </p>
        <p className="golden-records-admin-last-sync">
          <strong>Last successful club sync</strong>
          {lastSuccessfulClubSyncAt
            ? <time dateTime={lastSuccessfulClubSyncAt}>{clubSyncTimeFormatter.format(new Date(lastSuccessfulClubSyncAt))}</time>
            : <span>{jobQuery.isLoading ? "Checking sync history..." : jobQuery.isError ? "Sync history unavailable" : "No successful club sync recorded"}</span>}
        </p>

        <StatusMessagePanel
          error={actionError || (actionSuccess ? "" : jobError)}
          info={jobNeedsReview && !actionError && !actionSuccess ? `Club sync finished with ${finishedJob?.errorCount ?? 0} errors. Open Sync all members to review them.` : ""}
          loading={isLoading || referenceRefreshMutation.isPending || memberSyncMutation.isPending || individualSyncMutation.isPending || assignMatchMutation.isPending || bowImportPreviewMutation.isPending || bowImportApplyMutation.isPending || indoorBackfillPreviewMutation.isPending}
          loadingLabel={
            bowImportPreviewMutation.isPending
              ? "Checking bow disciplines against Golden Records..."
              : indoorBackfillPreviewMutation.isPending
                ? "Preparing indoor backfill preview..."
              : bowImportApplyMutation.isPending
                ? "Adding bow disciplines..."
                : referenceRefreshMutation.isPending
              ? "Checking connection and refreshing reference data..."
              : memberSyncMutation.isPending
                ? "Syncing Golden Records members and achievements..."
              : individualSyncMutation.isPending
                ? `Syncing ${selectedMember?.fullName || selectedUsername}...`
              : assignMatchMutation.isPending
                ? "Assigning Golden Records account..."
              : "Loading Golden Records settings..."
          }
          success={actionError ? "" : actionSuccess || jobSuccess}
        />

        <GoldenRecordsSlice title="Sync one member" description="Refresh one member's achievements and handicap." status={selectedMember?.fullName || undefined}>
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
              {individualSyncMutation.isPending ? "Refreshing member..." : "Refresh this member"}
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

        <GoldenRecordsSlice title="Sync all members" description="Refresh member achievements across the club." status={jobQuery.isLoading ? "Checking..." : memberSyncJob?.state ?? "Not run"}>
          <p>
            Use this for widespread missing results or when a club-wide update is needed sooner.
            It refreshes outdoor achievements and verified indoor results for matched members.
            Matching uses Golden Records ID, AGB number, email, or an exact name.
            Ambiguous matches are skipped; add an AGB number or email to their profile before retrying.
          </p>
          <Button
            title="Sync all portal members from Golden Records, including outdoor achievements and indoor handicaps."
            onClick={() => memberSyncMutation.mutate()}
            disabled={memberSyncJob?.state === "running" || memberSyncJob?.state === "queued" || memberSyncMutation.isPending || referenceRefreshMutation.isPending}
          >
            {memberSyncJob?.state === "running" ? "Sync in progress" : "Run club sync now"}
          </Button>
          {memberSyncJob ? (
            <div role="status">
              <p>
                <strong>Status:</strong> {memberSyncJob.state}. {memberSyncJob.attemptedCount} members attempted; {memberSyncJob.matchedCount} matched, {memberSyncJob.unmatchedCount} unmatched, {memberSyncJob.achievementCount} achievements, {memberSyncJob.errorCount} errors.
                {memberSyncJob.durationMs !== undefined ? ` Duration: ${Math.round(memberSyncJob.durationMs / 1000)} seconds.` : ""}
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

        <GoldenRecordsSlice title="Maintenance tools" description="Connection checks, reference data, and one-off imports.">
          <GoldenRecordsSlice title="Reference data and connection" description="Check access and refresh cached lookup lists in one step." status={isLoading ? "Checking..." : lastSyncStatus?.fetchedAt ? `Last refreshed ${formatDateTime(lastSyncStatus.fetchedAt)}` : "Never refreshed"}>
            <p>Use this when Golden Records reference lists need updating. The portal checks the connection first, then refreshes the lists.</p>
            <Button
              title="Check the Golden Records connection, then refresh cached reference lists."
              onClick={() => referenceRefreshMutation.mutate()}
              disabled={referenceRefreshMutation.isPending || memberSyncMutation.isPending || memberSyncJob?.state === "running" || memberSyncJob?.state === "queued"}
            >
              {referenceRefreshMutation.isPending ? "Refreshing reference data..." : "Check and refresh reference data"}
            </Button>
            <div className="golden-records-admin-facts">
              <p><strong>Configured:</strong> {summary?.enabled ? "Yes" : "No"}</p>
              <p><strong>Endpoint:</strong> {summary?.maskedBaseUrl || "Not configured"}</p>
              <p><strong>Auth mode:</strong> {summary?.authMode || "Not configured"}</p>
              <p><strong>Last connection check:</strong> {lastConnectionTest?.testedAt ? formatDateTime(lastConnectionTest.testedAt) : "Never"}</p>
              <p><strong>Last response:</strong> {lastConnectionTest?.diagnostics?.status ? `${lastConnectionTest.diagnostics.status} ${lastConnectionTest.diagnostics.statusText ?? ""}`.trim() : "None recorded"}</p>
              <p><strong>Last reference refresh:</strong> {lastSyncStatus?.fetchedAt ? formatDateTime(lastSyncStatus.fetchedAt) : "Never"}</p>
              <p><strong>Refresh status:</strong> {lastSyncStatus?.status ? String(lastSyncStatus.status) : "Not run"}</p>
              {summary?.lastFailureSummary ? <p><strong>Last issue:</strong> {summary.lastFailureSummary}</p> : null}
            </div>
            {summary?.lookupCounts?.length ? (
              <details className="golden-records-admin-lookup-details">
                <summary>View cached lists ({summary.lookupCounts.length})</summary>
                <div className="golden-records-admin-list">
                  {summary.lookupCounts.map((lookup) => (
                    <article key={lookup.lookupType} className="golden-records-admin-list-item">
                      <strong>{formatLookupLabel(lookup.lookupType)}</strong>
                      <span>{lookup.itemCount} records</span>
                      <span>{lookup.fetchedAt ? `Fetched ${formatDateTime(lookup.fetchedAt)}` : "Not fetched yet"}</span>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </GoldenRecordsSlice>

        <GoldenRecordsSlice title="Historical indoor results" description="Preview additions from stored Golden Records snapshots." status={indoorBackfillPlan ? `${indoorBackfillPlan.inserts.length + indoorBackfillPlan.updates.length} changes to review` : undefined}>
          <p>Review dated indoor results from stored Golden Records snapshots, then apply the proposed additions. Existing achievement dates are kept.</p>
          <Button onClick={() => indoorBackfillPreviewMutation.mutate()} disabled={indoorBackfillPreviewMutation.isPending}>
            {indoorBackfillPreviewMutation.isPending ? "Preparing preview..." : "Preview Indoor Backfill"}
          </Button>
          {indoorBackfillPlan ? <div className="golden-records-bow-import-preview">
            <p role="status">{indoorBackfillPlan.inserts.length} proposed inserts; {indoorBackfillPlan.updates.length} proposed updates; {indoorBackfillPlan.skipped.length} skipped; {indoorBackfillPlan.unmapped.length} unmapped source values.</p>
            {(["inserts", "updates"] as const).map((kind) => <details key={kind}>
              <summary>{kind === "inserts" ? "Proposed inserts" : "Proposed updates"} ({indoorBackfillPlan[kind].length})</summary>
              <ul>{indoorBackfillPlan[kind].map((record, index) => <li key={`${kind}-${record.username}-${record.seasonYear}-${record.bowType}-${index}`}>
                {record.username}, {record.bowType}, indoor season {record.seasonYear}/{record.seasonYear + 1}: {Object.entries({ ...record.classifications, ...record.scores }).map(([key, date]) => `${key} ${date}`).join(", ")}
              </li>)}</ul>
            </details>)}
            <details><summary>Skipped ({indoorBackfillPlan.skipped.length})</summary>
              <ul>{indoorBackfillPlan.skipped.map((record, index) => <li key={`skip-${index}`}>{record.username}: {record.reason}</li>)}</ul>
            </details>
            <details><summary>Unmapped source values ({indoorBackfillPlan.unmapped.length})</summary>
              <ul>{indoorBackfillPlan.unmapped.map((record, index) => <li key={`unmapped-${index}`}>{record.username}: {record.kind} “{record.label}” — {record.reason} ({record.count})</li>)}</ul>
            </details>
            {indoorBackfillPlan.inserts.length + indoorBackfillPlan.updates.length > 0 ?
              <Button onClick={() => setIsIndoorBackfillConfirmOpen(true)} disabled={indoorBackfillApplyMutation.isPending}>Apply Indoor Backfill</Button> : null}
          </div> : null}
        </GoldenRecordsSlice>

        {canImportBowDisciplines ? <GoldenRecordsSlice title="Import bow disciplines" description="Review bowstyles missing from member profiles." status={bowImportPlan ? `${bowImportPlan.counts.add} additions to review` : undefined}>
          <p>Compare active portal members with Golden Records, then review the proposed additions before applying them. Existing disciplines are kept.</p>
          <Button onClick={() => bowImportPreviewMutation.mutate()} disabled={bowImportPreviewMutation.isPending || bowImportApplyMutation.isPending}>
            {bowImportPreviewMutation.isPending ? "Preparing preview..." : "Preview Bow Disciplines"}
          </Button>
          {bowImportPlan ? <div className="golden-records-bow-import-preview">
            <p role="status">{bowImportPlan.counts.add} to add · {bowImportPlan.counts.unchanged} already present · {bowImportPlan.counts.skip} skipped.</p>
            <p>{bowImportPlan.portalMemberCount} active portal members; {bowImportPlan.goldenRecordsMemberCount} Golden Records members checked.</p>
            <ul className="golden-records-bow-import-list" aria-label="Bow discipline import preview">
              {bowImportPlan.records.map((record) => <li key={record.username}>
                <strong>{record.firstName} {record.surname} ({record.username})</strong>
                <span>{record.status === "add" ? `Add ${record.discipline}` : record.status === "unchanged" ? `${record.discipline} already present` : `Skipped: ${record.reason}`}</span>
              </li>)}
            </ul>
            {bowImportPlan.counts.add > 0 ? <Button onClick={() => setIsBowImportConfirmOpen(true)} disabled={bowImportApplyMutation.isPending}>Apply {bowImportPlan.counts.add} additions</Button> : null}
          </div> : null}
        </GoldenRecordsSlice> : null}

        </GoldenRecordsSlice>
      </SectionPanel>
      <Modal open={isIndoorBackfillConfirmOpen} onClose={() => !indoorBackfillApplyMutation.isPending && setIsIndoorBackfillConfirmOpen(false)} title="Apply Indoor Backfill">
        <p>Apply {indoorBackfillPlan?.inserts.length ?? 0} inserts and {indoorBackfillPlan?.updates.length ?? 0} updates from the preview? Existing achievement dates will be kept.</p>
        <div className="profile-card-issue-actions">
          <Button variant="secondary" disabled={indoorBackfillApplyMutation.isPending} onClick={() => setIsIndoorBackfillConfirmOpen(false)}>Cancel</Button>
          <Button disabled={!indoorBackfillPlan || indoorBackfillApplyMutation.isPending} onClick={() => { if (indoorBackfillPlan) indoorBackfillApplyMutation.mutate(indoorBackfillPlan.planHash); }}>
            {indoorBackfillApplyMutation.isPending ? "Applying..." : "Apply Backfill"}
          </Button>
        </div>
      </Modal>
      <Modal open={isBowImportConfirmOpen} onClose={() => !bowImportApplyMutation.isPending && setIsBowImportConfirmOpen(false)} title="Apply Bow Discipline Import">
        <p>Add {bowImportPlan?.counts.add ?? 0} bow disciplines to active members? This will update the live database and retain their existing disciplines.</p>
        <div className="profile-card-issue-actions">
          <Button variant="secondary" disabled={bowImportApplyMutation.isPending} onClick={() => setIsBowImportConfirmOpen(false)}>Cancel</Button>
          <Button disabled={!bowImportPlan || bowImportApplyMutation.isPending} onClick={() => { if (bowImportPlan) bowImportApplyMutation.mutate(bowImportPlan.planHash); }}>
            {bowImportApplyMutation.isPending ? "Applying..." : "Apply Import"}
          </Button>
        </div>
      </Modal>
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
