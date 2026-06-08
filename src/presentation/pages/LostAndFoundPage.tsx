import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { MobileCardList } from "../components/mobile/MobileCardList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  createLostArrow,
  listLostArrowMembers,
  listOpenLostArrows,
  markLostArrowFound,
  type LostArrowMemberOption,
} from "../../api/lostArrowApi";
import { formatDate } from "../../utils/dateTime";
import type { LostArrowRecord, UserProfile } from "../../types/app";

type LostAndFoundPageProps = {
  currentUserProfile: UserProfile | null;
};

type LostArrowDraft = {
  archerUsername: string;
  dateLost: string;
  arrowMaterial: "aluminium" | "carbon" | "";
  arrowColour: string;
  arrowIdentifier: string;
  fletchingColour1: string;
  fletchingColour2: string;
  nockColour: string;
  targetDistance: string;
  laneNumber: string;
  otherDetails: string;
};

type FoundArrowDraft = {
  dateFound: string;
  foundByUsername: string;
};

const TARGET_DISTANCE_OPTIONS = [
  "10yrds",
  "15yrds",
  "20yrds",
  "30yrds",
  "40yrds",
  "50yrds",
  "60yrds",
  "70mtr",
  "80yrds",
  "90yrds",
  "100yrds",
] as const;
const LANE_OPTIONS = Array.from({ length: 11 }, (_, index) => String(index + 1));

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildEmptyDraft(currentUsername: string): LostArrowDraft {
  return {
    archerUsername: currentUsername,
    dateLost: getTodayIsoDate(),
    arrowMaterial: "",
    arrowColour: "",
    arrowIdentifier: "",
    fletchingColour1: "",
    fletchingColour2: "",
    nockColour: "",
    targetDistance: "",
    laneNumber: "",
    otherDetails: "",
  };
}

function buildFoundDraft(currentUsername: string): FoundArrowDraft {
  return {
    dateFound: getTodayIsoDate(),
    foundByUsername: currentUsername,
  };
}

function getMemberDisplayName(members: LostArrowMemberOption[], username: string) {
  return members.find((member) => member.username === username)?.fullName ?? username;
}

function buildLostArrowSummary(arrow: LostArrowRecord) {
  return [
    `${arrow.arrowColour} ${arrow.arrowMaterial} arrow`,
    arrow.arrowIdentifier ? `marked ${arrow.arrowIdentifier}` : "",
    `lane ${arrow.laneNumber}`,
    `${arrow.targetDistance}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function LostAndFoundPage({ currentUserProfile }: LostAndFoundPageProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const [draft, setDraft] = useState<LostArrowDraft>(() => buildEmptyDraft(actorUsername));
  const [foundDraft, setFoundDraft] = useState<FoundArrowDraft>(() =>
    buildFoundDraft(actorUsername),
  );
  const [selectedLostArrow, setSelectedLostArrow] = useState<LostArrowRecord | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const membersQuery = useQuery({
    queryKey: ["lost-arrow-members", actorUsername],
    queryFn: () => listLostArrowMembers(currentUserProfile),
    enabled: Boolean(actorUsername),
  });
  const lostArrowsQuery = useQuery({
    queryKey: ["lost-arrows", actorUsername],
    queryFn: () => listOpenLostArrows(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const memberOptions = useMemo(
    () => membersQuery.data?.members ?? [],
    [membersQuery.data?.members],
  );
  const lostArrows = useMemo(
    () => lostArrowsQuery.data?.lostArrows ?? [],
    [lostArrowsQuery.data?.lostArrows],
  );

  useEffect(() => {
    setDraft((current) =>
      current.archerUsername
        ? current
        : {
            ...current,
            archerUsername: actorUsername,
          },
    );
    setFoundDraft((current) =>
      current.foundByUsername
        ? current
        : {
            ...current,
            foundByUsername: actorUsername,
          },
    );
  }, [actorUsername]);

  const createMutation = useMutation({
    mutationFn: () => createLostArrow(currentUserProfile, draft),
    onMutate: () => {
      setError("");
      setSuccess("");
    },
    onSuccess: async (result) => {
      setSuccess(
        `Lost arrow recorded for ${result.lostArrow.archerName || result.lostArrow.archerUsername}.`,
      );
      setDraft(buildEmptyDraft(actorUsername));
      await queryClient.invalidateQueries({
        queryKey: ["lost-arrows", actorUsername],
      });
      void queryClient.invalidateQueries({
        queryKey: ["my-lost-arrow-notices", actorUsername],
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const markFoundMutation = useMutation({
    mutationFn: () => {
      if (!selectedLostArrow) {
        throw new Error("Choose a lost arrow before marking it as found.");
      }

      return markLostArrowFound(currentUserProfile, selectedLostArrow.id, foundDraft);
    },
    onMutate: () => {
      setError("");
      setSuccess("");
    },
    onSuccess: async (result) => {
      setSuccess(
        `Arrow marked found for ${result.lostArrow.archerName || result.lostArrow.archerUsername}.`,
      );
      setSelectedLostArrow(null);
      setFoundDraft(buildFoundDraft(actorUsername));
      await queryClient.invalidateQueries({
        queryKey: ["lost-arrows", actorUsername],
      });
      void queryClient.invalidateQueries({
        queryKey: ["my-lost-arrow-notices", actorUsername],
      });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const handleDraftChange =
    <K extends keyof LostArrowDraft>(field: K) =>
    (
      value:
        | LostArrowDraft[K]
        | ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => {
      const nextValue =
        typeof value === "object" && value && "target" in value
          ? (value.target.value as LostArrowDraft[K])
          : value;

      setDraft((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleFoundDraftChange =
    <K extends keyof FoundArrowDraft>(field: K) =>
    (
      value: FoundArrowDraft[K] | ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => {
      const nextValue =
        typeof value === "object" && value && "target" in value
          ? (value.target.value as FoundArrowDraft[K])
          : value;

      setFoundDraft((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void createMutation.mutateAsync();
  };

  const handleMarkFoundSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void markFoundMutation.mutateAsync();
  };

  const isLoading = membersQuery.isLoading || lostArrowsQuery.isLoading;

  return (
    <>
      <div className="profile-page lost-arrow-page">
        <p>
          Record lost arrows, track which arrows are still missing, and notify the
          owner once one has been found.
        </p>

        <StatusMessagePanel
          error={error}
          loading={isLoading}
          loadingLabel="Loading lost arrow register..."
          success={success}
        />

        <SectionPanel className="profile-form" title="Report Lost Arrow">
          <form className="left-align-form lost-arrow-form" onSubmit={handleSubmit}>
            <div className="lost-arrow-form-grid">
              <label>
                Name of Archer
                <select
                  value={draft.archerUsername}
                  onChange={handleDraftChange("archerUsername")}
                  required
                >
                  <option value="">Select member</option>
                  {memberOptions.map((member) => (
                    <option key={member.username} value={member.username}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <DatePicker
                label="Date Lost"
                value={draft.dateLost}
                onChange={handleDraftChange("dateLost")}
                max={getTodayIsoDate()}
                required
              />

              <label>
                Arrow Material
                <select
                  value={draft.arrowMaterial}
                  onChange={handleDraftChange("arrowMaterial")}
                  required
                >
                  <option value="">Select material</option>
                  <option value="aluminium">Aluminium</option>
                  <option value="carbon">Carbon</option>
                </select>
              </label>

              <label>
                Arrow Colour
                <input
                  value={draft.arrowColour}
                  onChange={handleDraftChange("arrowColour")}
                  maxLength={64}
                  required
                />
              </label>

              <label>
                Arrow Initial or Number
                <input
                  value={draft.arrowIdentifier}
                  onChange={handleDraftChange("arrowIdentifier")}
                  maxLength={64}
                  required
                />
              </label>

              <label>
                Fletching Colour 1
                <input
                  value={draft.fletchingColour1}
                  onChange={handleDraftChange("fletchingColour1")}
                  maxLength={64}
                  required
                />
              </label>

              <label>
                Fletching Colour 2
                <input
                  value={draft.fletchingColour2}
                  onChange={handleDraftChange("fletchingColour2")}
                  maxLength={64}
                  required
                />
              </label>

              <label>
                Nock Colour
                <input
                  value={draft.nockColour}
                  onChange={handleDraftChange("nockColour")}
                  maxLength={64}
                  required
                />
              </label>

              <label>
                Target Distance
                <select
                  value={draft.targetDistance}
                  onChange={handleDraftChange("targetDistance")}
                  required
                >
                  <option value="">Select distance</option>
                  {TARGET_DISTANCE_OPTIONS.map((distance) => (
                    <option key={distance} value={distance}>
                      {distance}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Lane Number
                <select
                  value={draft.laneNumber}
                  onChange={handleDraftChange("laneNumber")}
                  required
                >
                  <option value="">Select lane</option>
                  {LANE_OPTIONS.map((lane) => (
                    <option key={lane} value={lane}>
                      {lane}
                    </option>
                  ))}
                </select>
              </label>

              <label className="lost-arrow-form-grid-span">
                Any Other Details
                <textarea
                  value={draft.otherDetails}
                  onChange={handleDraftChange("otherDetails")}
                  maxLength={256}
                  rows={3}
                />
                <span className="lost-arrow-helper-text">
                  {256 - draft.otherDetails.length} characters left
                </span>
              </label>
            </div>

            <div className="lost-arrow-actions">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save lost arrow"}
              </Button>
            </div>
          </form>
        </SectionPanel>

        <SectionPanel className="profile-form" title="Current Lost Arrows">
          {lostArrows.length === 0 ? (
            <p>No lost arrows are currently recorded.</p>
          ) : isMobile ? (
            <>
              <MobileSectionHeader
                title="Open Lost Arrows"
                description="Use the found action once an arrow has been recovered."
              />
              <MobileCardList className="lost-arrow-mobile-list">
                {lostArrows.map((arrow) => (
                  <article key={arrow.id} className="lost-arrow-mobile-card">
                    <h4>{arrow.archerName}</h4>
                    <p>{buildLostArrowSummary(arrow)}</p>
                    <p>Lost on {formatDate(arrow.dateLost)}</p>
                    <p>
                      Fletchings: {arrow.fletchingColour1} / {arrow.fletchingColour2}
                    </p>
                    <p>Nock: {arrow.nockColour}</p>
                    {arrow.otherDetails ? <p>Notes: {arrow.otherDetails}</p> : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSelectedLostArrow(arrow);
                        setFoundDraft(buildFoundDraft(actorUsername));
                      }}
                    >
                      Mark found
                    </Button>
                  </article>
                ))}
              </MobileCardList>
            </>
          ) : (
            <div className="lost-arrow-table-wrap">
              <table className="lost-arrow-table">
                <thead>
                  <tr>
                    <th>Archer</th>
                    <th>Date Lost</th>
                    <th>Arrow</th>
                    <th>Fletching Colours</th>
                    <th>Nock Colour</th>
                    <th>Distance</th>
                    <th>Lane</th>
                    <th>Other Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lostArrows.map((arrow) => (
                    <tr key={arrow.id}>
                      <td>{arrow.archerName}</td>
                      <td>{formatDate(arrow.dateLost)}</td>
                      <td>
                        {arrow.arrowColour} {arrow.arrowMaterial}
                        <br />
                        <span className="lost-arrow-table-subcopy">
                          {arrow.arrowIdentifier}
                        </span>
                      </td>
                      <td>
                        {arrow.fletchingColour1} / {arrow.fletchingColour2}
                      </td>
                      <td>{arrow.nockColour}</td>
                      <td>{arrow.targetDistance}</td>
                      <td>{arrow.laneNumber}</td>
                      <td>{arrow.otherDetails || "-"}</td>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setSelectedLostArrow(arrow);
                            setFoundDraft(buildFoundDraft(actorUsername));
                          }}
                        >
                          Mark found
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      </div>

      <Modal
        open={Boolean(selectedLostArrow)}
        onClose={() => setSelectedLostArrow(null)}
        title="Mark Arrow Found"
      >
        {selectedLostArrow ? (
          <form className="left-align-form lost-arrow-found-form" onSubmit={handleMarkFoundSubmit}>
            <p className="lost-arrow-found-summary">
              {selectedLostArrow.archerName} | {buildLostArrowSummary(selectedLostArrow)}
            </p>

            <DatePicker
              label="Date Found"
              value={foundDraft.dateFound}
              onChange={handleFoundDraftChange("dateFound")}
              max={getTodayIsoDate()}
              required
            />

            <label>
              Who Found Arrow
              <select
                value={foundDraft.foundByUsername}
                onChange={handleFoundDraftChange("foundByUsername")}
                required
              >
                <option value="">Select member</option>
                {memberOptions.map((member) => (
                  <option key={member.username} value={member.username}>
                    {member.fullName}
                  </option>
                ))}
              </select>
            </label>

            <div className="lost-arrow-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedLostArrow(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={markFoundMutation.isPending}>
                {markFoundMutation.isPending ? "Saving..." : "Confirm found"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
