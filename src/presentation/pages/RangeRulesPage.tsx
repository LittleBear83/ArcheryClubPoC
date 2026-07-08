import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRangeRules } from "../../api/rangeRulesApi";
import { getDefaultRangeRulesContent } from "../../../shared/rangeRulesDefaults.js";
import { Button } from "../components/Button";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { formatShortDateTime } from "../../utils/dateTime";

const TAB_OPTIONS = [
  { id: "indoor", label: "Indoor Range" },
  { id: "outdoor", label: "Outdoor Range" },
] as const;

type TabId = (typeof TAB_OPTIONS)[number]["id"];

type RangeRulesPageProps = {
  currentUserProfile: unknown;
};

const rangeRulesQueryKeys = {
  detail: (actorUsername: string) => ["range-rules", actorUsername] as const,
};

export function RangeRulesPage({ currentUserProfile }: RangeRulesPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const [selectedTab, setSelectedTab] = useState<TabId>("indoor");

  const { data, isLoading } = useQuery({
    queryKey: rangeRulesQueryKeys.detail(actorUsername),
    queryFn: () => getRangeRules(currentUserProfile),
    enabled: Boolean(actorUsername),
  });

  const rangeRules = useMemo(
    () => data?.rangeRules ?? getDefaultRangeRulesContent(),
    [data?.rangeRules],
  );

  const activeRules =
    selectedTab === "indoor" ? rangeRules.indoorRules : rangeRules.outdoorRules;
  const activeTitle =
    selectedTab === "indoor"
      ? "Indoor Range Guidance"
      : "Outdoor Range Guidance";
  const updatedAtLabel =
    rangeRules.updatedAtDate && rangeRules.updatedAtTime
      ? formatShortDateTime(
          `${rangeRules.updatedAtDate}T${rangeRules.updatedAtTime}`,
        )
      : "";

  return (
    <div className="profile-page range-rules-page">
      <SectionPanel className="profile-form" title="Range Rules">
        <p>
          Use this page as a quick in-app reference for the club&apos;s core
          range expectations. Switch between indoor and outdoor guidance using
          the tabs below.
        </p>

        <StatusMessagePanel
          loading={isLoading}
          loadingLabel="Loading range rules..."
        />

        <div
          className="range-rules-tabs"
          role="tablist"
          aria-label="Range rule categories"
        >
          {TAB_OPTIONS.map((tab) => {
            const isActive = tab.id === selectedTab;

            return (
              <Button
                key={tab.id}
                aria-selected={isActive}
                className={`range-rules-tab ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedTab(tab.id)}
                role="tab"
                variant={isActive ? "primary" : "ghost"}
              >
                {tab.label}
              </Button>
            );
          })}
        </div>
      </SectionPanel>

      <SectionPanel className="home-panel" title={activeTitle}>
        <p className="range-rules-panel-copy">
          {selectedTab === "indoor"
            ? "Indoor guidance covers target-face use, shared shooting rhythm, and basic range housekeeping."
            : "Outdoor guidance covers when the field can be used, how lane distances are organised, and how bosses should be put away after shooting."}
        </p>

        <ul className="home-info-list range-rules-list">
          {activeRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        {selectedTab === "outdoor" ? (
          <div className="range-rules-table-wrap">
            <table className="range-rules-table">
              <thead>
                <tr>
                  <th></th>
                  <th colSpan={4}>Maximum Distances Permitted</th>
                </tr>
                <tr>
                  <th>Target</th>
                  <th>Recurve</th>
                  <th>Compound</th>
                  <th>Longbow</th>
                  <th>Barebow</th>
                </tr>
              </thead>
              <tbody>
                {rangeRules.outdoorLaneRules.map((laneRule) => (
                  <tr key={laneRule.target}>
                    <td>{laneRule.target}</td>
                    <td>{laneRule.recurve}</td>
                    <td>{laneRule.compound}</td>
                    <td>{laneRule.longbow}</td>
                    <td>{laneRule.barebow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rangeRules.updatedByUsername ? (
          <p className="range-rules-audit">
            Last updated
            {updatedAtLabel ? ` on ${updatedAtLabel}` : ""}.
          </p>
        ) : null}
      </SectionPanel>
    </div>
  );
}
