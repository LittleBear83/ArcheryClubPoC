import { useMemo, useState } from "react";
import { Sankey } from "@nivo/sankey";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { SectionPanel } from "../components/SectionPanel";
import { MobileCardList } from "../components/mobile/MobileCardList";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import selbyLogo from "../../assets/selby_Archery_Logo.svg";
import { getMemberJourneyReport, type MemberJourneyReportRow } from "../../api/reportingApi";
import { formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useTheme } from "../../theme/useTheme";
import {
  getMonthStartString,
  getRangeLabel,
  getTodayString,
} from "./reporting/reportingUtils";

type BeginnersAndTasterReportingPageProps = {
  currentUserProfile: unknown;
};

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function buildStageRate(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function formatCourseTypeLabel(value: string) {
  if (value === "taster-session") {
    return "Taster Session";
  }

  if (value === "beginners") {
    return "Beginners Course";
  }

  if (value === "member") {
    return "Full Member";
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function BeginnersJourneySankey({
  directBeginnersCount,
  directBeginnersToMembersCount,
  tasterCount,
  tasterToBeginnersCount,
  tasterToMembersCount,
}: {
  directBeginnersCount: number;
  directBeginnersToMembersCount: number;
  tasterCount: number;
  tasterToBeginnersCount: number;
  tasterToMembersCount: number;
}) {
  const { theme, themeName } = useTheme();
  const sankeyColours = useMemo(() => {
    const vars = theme.variables;
    const isDawn = themeName === "dawn";

    return {
      border: vars["--accent-border"],
      dropOff: "#111111",
      dropOffBorder: "#f5f5f5",
      directBeginners: vars["--success"],
      label: isDawn ? vars["--text-on-accent"] : vars["--text-on-strong"],
      linkOpacity: isDawn ? 0.68 : 0.5,
      member: vars["--accent-hover"],
      taster: isDawn ? vars["--info"] : "#58abff",
      tooltipBackground: vars["--modal-surface"],
      tooltipText: vars["--text-h"],
      beginners: vars["--accent"],
    };
  }, [theme.variables, themeName]);

  const tasterDropOffCount = Math.max(tasterCount - tasterToBeginnersCount, 0);
  const tasterBeginnersDropOffCount = Math.max(
    tasterToBeginnersCount - tasterToMembersCount,
    0,
  );
  const directBeginnersDropOffCount = Math.max(
    directBeginnersCount - directBeginnersToMembersCount,
    0,
  );

  const nodeCopy = {
    beginners_course: "Beginners Course (From Taster)",
    direct_drop_off: "Drop-off",
    direct_beginners: "Beginners Course (Direct)",
    full_member: "Full Member",
    taster_drop_off: "Taster Drop-off",
    taster_member_drop_off: "Beginners Drop-off",
    taster_session: "Taster Session",
  };
  const data = {
    nodes: [
      { id: "taster_session", label: nodeCopy.taster_session },
      { id: "direct_beginners", label: nodeCopy.direct_beginners },
      { id: "beginners_course", label: nodeCopy.beginners_course },
      { id: "taster_drop_off", label: nodeCopy.taster_drop_off },
      { id: "taster_member_drop_off", label: nodeCopy.taster_member_drop_off },
      { id: "direct_drop_off", label: nodeCopy.direct_drop_off },
      {
        id: "full_member",
        label: nodeCopy.full_member,
      },
    ],
    links: [
      {
        source: "taster_session",
        target: "beginners_course",
        value: tasterToBeginnersCount,
        startColor: sankeyColours.taster,
        endColor: sankeyColours.beginners,
      },
      {
        source: "taster_session",
        target: "taster_drop_off",
        value: tasterDropOffCount,
        startColor: sankeyColours.taster,
        endColor: sankeyColours.dropOff,
      },
      {
        source: "beginners_course",
        target: "full_member",
        value: tasterToMembersCount,
        startColor: sankeyColours.beginners,
        endColor: sankeyColours.member,
      },
      {
        source: "beginners_course",
        target: "taster_member_drop_off",
        value: tasterBeginnersDropOffCount,
        startColor: sankeyColours.beginners,
        endColor: sankeyColours.dropOff,
      },
      {
        source: "direct_beginners",
        target: "full_member",
        value: directBeginnersToMembersCount,
        startColor: sankeyColours.directBeginners,
        endColor: sankeyColours.member,
      },
      {
        source: "direct_beginners",
        target: "direct_drop_off",
        value: directBeginnersDropOffCount,
        startColor: sankeyColours.directBeginners,
        endColor: sankeyColours.dropOff,
      },
    ].filter((link) => link.value > 0),
  };

  if (data.links.length === 0) {
    return (
      <div className="beginners-journey-sankey-empty">
        No conversion flow is available for the selected date range yet.
      </div>
    );
  }

  const customLabelsLayer = ({ nodes }) => (
    <g className="beginners-journey-sankey-label-layer">
      {nodes.map((node) => {
        let x = node.x + 14;
        let y = node.y + node.height / 2 + 4;
        let textAnchor = "start";

        if (node.id === "taster_session") {
          x = node.x + 14;
          y = node.y + node.height / 2 + 4;
        } else if (node.id === "beginners_course") {
          x = node.x + 14;
          y = node.y + node.height / 2 - 24;
        } else if (node.id === "direct_beginners") {
          x = node.x + 14;
          y = node.y + node.height / 2 + 2;
        } else if (node.id === "taster_drop_off") {
          x = node.x + 14;
          y = node.y + node.height / 2 + 4;
          textAnchor = "start";
        } else if (node.id === "taster_member_drop_off") {
          x = node.x - 16;
          y = node.y + node.height / 2 + 4;
          textAnchor = "end";
        } else if (node.id === "direct_drop_off") {
          x = node.x + 14;
          y = node.y + node.height / 2 - 8;
          textAnchor = "start";
        } else if (node.id === "full_member") {
          x = node.x - 16;
          y = node.y + node.height / 2 + 4;
          textAnchor = "end";
        }

        return (
          <text
            key={node.id}
            x={x}
            y={y}
            textAnchor={textAnchor}
            className="beginners-journey-sankey-fixed-label"
          >
            {node.label}
          </text>
        );
      })}
    </g>
  );

  return (
    <div
      className="beginners-journey-sankey-wrap"
      role="img"
      aria-label="Beginners and Taster conversion flow chart"
    >
      <Sankey
        data={data}
        width={1280}
        height={224}
        margin={{ top: 4, right: 20, bottom: 12, left: 20 }}
        align="center"
        colors={[
          sankeyColours.taster,
          sankeyColours.directBeginners,
          sankeyColours.beginners,
          sankeyColours.dropOff,
          sankeyColours.dropOff,
          sankeyColours.dropOff,
          sankeyColours.member,
        ]}
        nodeOpacity={1}
        nodeHoverOthersOpacity={0.45}
        nodeThickness={9}
        nodeSpacing={12}
        nodeBorderWidth={1}
        nodeBorderColor={(node) =>
          String(node.id).includes("drop_off")
            ? sankeyColours.dropOffBorder
            : sankeyColours.border
        }
        nodeBorderRadius={6}
        label={(node) => node.label ?? String(node.id)}
        enableLabels={false}
        linkOpacity={sankeyColours.linkOpacity}
        linkHoverOthersOpacity={0.12}
        linkContract={2}
        linkBlendMode="normal"
        enableLinkGradient
        animate={false}
        layers={["links", "nodes", customLabelsLayer]}
        theme={{
          text: {
            fill: sankeyColours.label,
            fontSize: 10,
            fontWeight: 700,
          },
          tooltip: {
            container: {
              background: sankeyColours.tooltipBackground,
              color: sankeyColours.tooltipText,
              border: `1px solid ${sankeyColours.border}`,
              borderRadius: "12px",
              boxShadow: "0 14px 34px rgba(0, 0, 0, 0.35)",
            },
          },
        }}
        nodeTooltip={({ node }) => (
          <div className="beginners-journey-sankey-tooltip">
            <strong>{node.label}</strong>
            <div>{node.formattedValue} people reached this stage.</div>
          </div>
        )}
        linkTooltip={({ link }) => (
          <div className="beginners-journey-sankey-tooltip">
            <strong>{link.formattedValue} people converted</strong>
            <div>
              {nodeCopy[String(link.source.id)]} to {nodeCopy[String(link.target.id)]}
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function BeginnersAndTasterReportingPage({
  currentUserProfile,
}: BeginnersAndTasterReportingPageProps) {
  const actorUsername =
    (currentUserProfile as { auth?: { username?: string | null } } | null)?.auth
      ?.username ?? "";
  const canViewReports = hasPermission(currentUserProfile, "view_reports");
  const [startDate, setStartDate] = useState(getMonthStartString());
  const [endDate, setEndDate] = useState(getTodayString());

  const memberJourneyQuery = useQuery({
    queryKey: ["beginners-and-taster-reporting", actorUsername, startDate, endDate],
    queryFn: async () => {
      const result = await getMemberJourneyReport(actorUsername, {
        startDate,
        endDate,
      });

      return result.report;
    },
    enabled: canViewReports && Boolean(actorUsername),
  });

  const tasterRows = useMemo(
    () =>
      (memberJourneyQuery.data?.rows ?? []).filter(
        (row) => row.originCourseType === "taster-session",
      ),
    [memberJourneyQuery.data?.rows],
  );
  const directBeginnersRows = useMemo(
    () =>
      (memberJourneyQuery.data?.rows ?? []).filter(
        (row) => row.originCourseType === "beginners",
      ),
    [memberJourneyQuery.data?.rows],
  );
  const tasterToBeginnersRows = useMemo(
    () =>
      tasterRows.filter(
        (row) =>
          row.currentCourseType === "beginners" || row.convertedToMember,
      ),
    [tasterRows],
  );
  const tasterToMembersRows = useMemo(
    () => tasterRows.filter((row) => row.convertedToMember),
    [tasterRows],
  );
  const directBeginnersToMembersRows = useMemo(
    () => directBeginnersRows.filter((row) => row.convertedToMember),
    [directBeginnersRows],
  );
  const beginnersCohortRows = useMemo(
    () => [...directBeginnersRows, ...tasterToBeginnersRows],
    [directBeginnersRows, tasterToBeginnersRows],
  );
  const beginnersToMembersRows = useMemo(
    () => [...directBeginnersToMembersRows, ...tasterToMembersRows],
    [directBeginnersToMembersRows, tasterToMembersRows],
  );
  const rangeLabel = useMemo(
    () => getRangeLabel(startDate, endDate),
    [endDate, startDate],
  );
  const handlePrintExport = () => {
    window.print();
  };
  const tasterFunnelRows = [
    {
      stage: "Taster Session attendees",
      people: tasterRows.length,
      previous: "-",
      overall: "Baseline",
    },
    {
      stage: "Moved to Beginners Course",
      people: tasterToBeginnersRows.length,
      previous: formatPercentage(
        buildStageRate(tasterToBeginnersRows.length, tasterRows.length),
      ),
      overall: formatPercentage(
        buildStageRate(tasterToBeginnersRows.length, tasterRows.length),
      ),
    },
    {
      stage: "Converted to full member",
      people: tasterToMembersRows.length,
      previous: formatPercentage(
        buildStageRate(tasterToMembersRows.length, tasterToBeginnersRows.length),
      ),
      overall: formatPercentage(
        buildStageRate(tasterToMembersRows.length, tasterRows.length),
      ),
    },
  ];
  const beginnersFunnelRows = [
    {
      stage: "Direct Beginners Course starters",
      people: directBeginnersRows.length,
      share: formatPercentage(
        buildStageRate(directBeginnersRows.length, beginnersCohortRows.length),
      ),
    },
    {
      stage: "Taster attendees who reached Beginners Courses",
      people: tasterToBeginnersRows.length,
      share: formatPercentage(
        buildStageRate(tasterToBeginnersRows.length, beginnersCohortRows.length),
      ),
    },
    {
      stage: "Total Beginners Course cohort",
      people: beginnersCohortRows.length,
      share: "Baseline",
    },
    {
      stage: "Converted to full member",
      people: beginnersToMembersRows.length,
      share: formatPercentage(
        buildStageRate(beginnersToMembersRows.length, beginnersCohortRows.length),
      ),
    },
  ];
  const directBeginnersFunnelRows = [
    {
      stage: "Direct Beginners Course starters",
      people: directBeginnersRows.length,
      previous: "-",
      overall: "Baseline",
    },
    {
      stage: "Converted to full member",
      people: directBeginnersToMembersRows.length,
      previous: formatPercentage(
        buildStageRate(
          directBeginnersToMembersRows.length,
          directBeginnersRows.length,
        ),
      ),
      overall: formatPercentage(
        buildStageRate(
          directBeginnersToMembersRows.length,
          directBeginnersRows.length,
        ),
      ),
    },
  ];
  const beginnersBreakdownRows = [
    {
      route: "Direct Beginners Course",
      cohort: directBeginnersRows.length,
      converted: directBeginnersToMembersRows.length,
      rate: formatPercentage(
        buildStageRate(
          directBeginnersToMembersRows.length,
          directBeginnersRows.length,
        ),
      ),
    },
    {
      route: "Taster-fed Beginners Course",
      cohort: tasterToBeginnersRows.length,
      converted: tasterToMembersRows.length,
      rate: formatPercentage(
        buildStageRate(tasterToMembersRows.length, tasterToBeginnersRows.length),
      ),
    },
    {
      route: "All Beginners attendees",
      cohort: beginnersCohortRows.length,
      converted: beginnersToMembersRows.length,
      rate: formatPercentage(
        buildStageRate(beginnersToMembersRows.length, beginnersCohortRows.length),
      ),
    },
  ];
  const combinedJourneyRows = useMemo(
    () =>
      [...tasterRows, ...directBeginnersRows]
        .sort((left, right) => left.joinedAtDate.localeCompare(right.joinedAtDate))
        .map((row) => ({
          ...row,
          route:
            row.originCourseType === "taster-session"
              ? "Taster Session"
              : "Direct Beginners",
        })),
    [directBeginnersRows, tasterRows],
  );

  if (!canViewReports) {
    return <p>You do not have permission to view reporting.</p>;
  }

  return (
    <div className="beginners-course-page beginners-journey-reporting-page">
      <SectionPanel
        className="profile-form beginners-course-panel"
        title="Conversion Reporting"
        description="Review Taster Session and Beginners Course conversion funnels for the selected date range."
      >
        <div className="beginners-journey-reporting-filters no-print">
          <label>
            <DatePicker
              label="Date from"
              value={startDate}
              onChange={setStartDate}
              max={endDate}
            />
          </label>
          <label>
            <DatePicker
              label="Date to"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
              max={getTodayString()}
            />
          </label>
        </div>

        {memberJourneyQuery.error ? (
          <p className="usage-error">
            {memberJourneyQuery.error instanceof Error
              ? memberJourneyQuery.error.message
              : "Unable to load the Taster Session reporting data."}
          </p>
        ) : null}

        {memberJourneyQuery.isLoading && !memberJourneyQuery.data ? (
          <p className="equipment-meta-copy">Loading Taster Session reporting...</p>
        ) : null}

        {memberJourneyQuery.data ? (
          <>
            <div className="screen-report-only">
              <div className="usage-cards reporting-summary-cards">
                <div className="usage-card reporting-summary-card">
                  <p className="usage-card-title">Selected Range</p>
                  <p className="usage-card-range">{rangeLabel}</p>
                  <div className="usage-card-stats">
                    <div>
                      <span className="usage-stat-label">Taster starters</span>
                      <strong>{tasterRows.length}</strong>
                    </div>
                    <div>
                      <span className="usage-stat-label">Direct beginners</span>
                      <strong>{directBeginnersRows.length}</strong>
                    </div>
                    <div>
                      <span className="usage-stat-label">Total members</span>
                      <strong>{beginnersToMembersRows.length}</strong>
                    </div>
                  </div>
                </div>

                <div className="usage-card reporting-summary-card">
                  <p className="usage-card-title">Taster To Beginners</p>
                  <div className="reporting-breakdown-list">
                    <p>
                      <strong>
                        {formatPercentage(
                          buildStageRate(
                            tasterToBeginnersRows.length,
                            tasterRows.length,
                          ),
                        )}
                      </strong>{" "}
                      conversion rate
                    </p>
                    <p>
                      <strong>{tasterToBeginnersRows.length}</strong> of{" "}
                      {tasterRows.length} attendees progressed
                    </p>
                  </div>
                </div>

                <div className="usage-card reporting-summary-card">
                  <p className="usage-card-title">Taster Path To Member</p>
                  <div className="reporting-breakdown-list">
                    <p>
                      <strong>
                        {formatPercentage(
                          buildStageRate(
                            tasterToMembersRows.length,
                            tasterToBeginnersRows.length,
                          ),
                        )}
                      </strong>{" "}
                      conversion rate
                    </p>
                    <p>
                      <strong>{tasterToMembersRows.length}</strong> of{" "}
                      {tasterRows.length} taster attendees became members
                    </p>
                  </div>
                </div>

                <div className="usage-card reporting-summary-card">
                  <p className="usage-card-title">Direct Beginners To Member</p>
                  <div className="reporting-breakdown-list">
                    <p>
                      <strong>
                        {formatPercentage(
                          buildStageRate(
                            directBeginnersToMembersRows.length,
                            directBeginnersRows.length,
                          ),
                        )}
                      </strong>{" "}
                      conversion rate
                    </p>
                    <p>
                      <strong>{directBeginnersToMembersRows.length}</strong> of{" "}
                      {directBeginnersRows.length} direct beginners became members
                    </p>
                  </div>
                </div>
              </div>

              <section className="usage-hourly-panel reporting-panel">
                <div className="usage-hourly-header">
                  <h3>Conversion Flow Chart</h3>
                  <p>
                    Visual flow of the two joining routes into full membership for the
                    selected date range.
                  </p>
                </div>
                <div className="reporting-desktop-only">
                  <BeginnersJourneySankey
                    tasterCount={tasterRows.length}
                    tasterToBeginnersCount={tasterToBeginnersRows.length}
                    tasterToMembersCount={tasterToMembersRows.length}
                    directBeginnersCount={directBeginnersRows.length}
                    directBeginnersToMembersCount={directBeginnersToMembersRows.length}
                  />
                </div>
                <div className="reporting-mobile-only">
                  <MobileCardList className="reporting-mobile-flow-list">
                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Taster Route"
                        description="Taster Session through to full member."
                      />
                      <MobileKeyValueList
                        items={[
                          { label: "Start", value: `${tasterRows.length} Taster Session` },
                          {
                            label: "Reached beginners",
                            value: String(tasterToBeginnersRows.length),
                          },
                          {
                            label: "Converted",
                            value: String(tasterToMembersRows.length),
                          },
                          {
                            label: "Taster drop-off",
                            value: String(
                              Math.max(tasterRows.length - tasterToBeginnersRows.length, 0),
                            ),
                          },
                          {
                            label: "Beginners drop-off",
                            value: String(
                              Math.max(
                                tasterToBeginnersRows.length - tasterToMembersRows.length,
                                0,
                              ),
                            ),
                          },
                        ]}
                      />
                    </article>
                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Direct Route"
                        description="Beginners Course direct to full member."
                      />
                      <MobileKeyValueList
                        items={[
                          {
                            label: "Start",
                            value: `${directBeginnersRows.length} Beginners Course`,
                          },
                          {
                            label: "Converted",
                            value: String(directBeginnersToMembersRows.length),
                          },
                          {
                            label: "Drop-off",
                            value: String(
                              Math.max(
                                directBeginnersRows.length -
                                  directBeginnersToMembersRows.length,
                                0,
                              ),
                            ),
                          },
                        ]}
                      />
                    </article>
                  </MobileCardList>
                </div>
              </section>

              <section className="usage-hourly-panel reporting-panel reporting-detail-panel">
                <div className="usage-hourly-header">
                  <h3>Conversion Details</h3>
                  <p>
                    Compact funnel and route comparison view for the selected period
                    from {formatDate(startDate)} to {formatDate(endDate)}.
                  </p>
                </div>

                <div className="reporting-detail-grid reporting-desktop-only">
                  <article className="reporting-detail-card">
                    <div className="reporting-detail-card-header">
                      <h4>Taster Conversion Funnel</h4>
                      <p>Step-by-step movement from taster attendee to member.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Prev.</th>
                            <th>From Start</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasterFunnelRows.map((row) => (
                            <tr key={row.stage}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.previous}</td>
                              <td>{row.overall}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="reporting-detail-card">
                    <div className="reporting-detail-card-header">
                      <h4>Direct Beginners Funnel</h4>
                      <p>People who joined a Beginners Course without a taster route.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Prev.</th>
                            <th>From Start</th>
                          </tr>
                        </thead>
                        <tbody>
                          {directBeginnersFunnelRows.map((row) => (
                            <tr key={row.stage}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.previous}</td>
                              <td>{row.overall}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>

                <div className="reporting-detail-grid reporting-desktop-only">
                  <article className="reporting-detail-card">
                    <div className="reporting-detail-card-header">
                      <h4>Combined Beginners To Member Funnel</h4>
                      <p>All Beginners Course attendees, combining direct and taster-fed routes.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beginnersFunnelRows.map((row) => (
                            <tr key={row.stage}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.share}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="reporting-detail-card">
                    <div className="reporting-detail-card-header">
                      <h4>Route Comparison</h4>
                      <p>See which Beginners route is producing the stronger member conversion.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Route</th>
                            <th>Cohort</th>
                            <th>Converted</th>
                            <th>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beginnersBreakdownRows.map((row) => (
                            <tr key={row.route}>
                              <td>{row.route}</td>
                              <td>{row.cohort}</td>
                              <td>{row.converted}</td>
                              <td>{row.rate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>

                <div className="reporting-mobile-only">
                  <MobileCardList>
                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Taster Conversion Funnel"
                        description="Step-by-step movement from taster attendee to member."
                      />
                      <MobileCardList>
                        {tasterFunnelRows.map((row) => (
                          <article
                            key={`mobile-taster-${row.stage}`}
                            className="reporting-mobile-row-card reporting-mobile-row-card--nested"
                          >
                            <p className="reporting-mobile-row-title">{row.stage}</p>
                            <MobileKeyValueList
                              items={[
                                { label: "People", value: String(row.people) },
                                { label: "Prev.", value: row.previous },
                                { label: "From start", value: row.overall },
                              ]}
                            />
                          </article>
                        ))}
                      </MobileCardList>
                    </article>

                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Direct Beginners Funnel"
                        description="People who joined a Beginners Course directly."
                      />
                      <MobileCardList>
                        {directBeginnersFunnelRows.map((row) => (
                          <article
                            key={`mobile-direct-${row.stage}`}
                            className="reporting-mobile-row-card reporting-mobile-row-card--nested"
                          >
                            <p className="reporting-mobile-row-title">{row.stage}</p>
                            <MobileKeyValueList
                              items={[
                                { label: "People", value: String(row.people) },
                                { label: "Prev.", value: row.previous },
                                { label: "From start", value: row.overall },
                              ]}
                            />
                          </article>
                        ))}
                      </MobileCardList>
                    </article>

                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Combined Beginners Funnel"
                        description="All Beginners attendees across both routes."
                      />
                      <MobileCardList>
                        {beginnersFunnelRows.map((row) => (
                          <article
                            key={`mobile-beginners-${row.stage}`}
                            className="reporting-mobile-row-card reporting-mobile-row-card--nested"
                          >
                            <p className="reporting-mobile-row-title">{row.stage}</p>
                            <MobileKeyValueList
                              items={[
                                { label: "People", value: String(row.people) },
                                { label: "Share", value: row.share },
                              ]}
                            />
                          </article>
                        ))}
                      </MobileCardList>
                    </article>

                    <article className="reporting-mobile-row-card">
                      <MobileSectionHeader
                        title="Route Comparison"
                        description="Compare conversion strength across the entry routes."
                      />
                      <MobileCardList>
                        {beginnersBreakdownRows.map((row) => (
                          <article
                            key={`mobile-breakdown-${row.route}`}
                            className="reporting-mobile-row-card reporting-mobile-row-card--nested"
                          >
                            <p className="reporting-mobile-row-title">{row.route}</p>
                            <MobileKeyValueList
                              items={[
                                { label: "Cohort", value: String(row.cohort) },
                                { label: "Converted", value: String(row.converted) },
                                { label: "Rate", value: row.rate },
                              ]}
                            />
                          </article>
                        ))}
                      </MobileCardList>
                    </article>
                  </MobileCardList>
                </div>
              </section>

              <section className="usage-hourly-panel reporting-panel">
                <div className="usage-hourly-header">
                  <h3>Journey Detail</h3>
                  <p>
                    Individual attendee journeys across both entry routes for the
                  selected period.
                </p>
              </div>
                {combinedJourneyRows.length === 0 ? (
                  <p className="usage-empty-state">
                    No attendee journeys started in the selected date range.
                  </p>
                ) : (
                  <>
                  <div className="reporting-table-wrap reporting-desktop-only">
                    <table className="committee-roles-table reporting-table">
                      <thead>
                        <tr>
                          <th>Joined</th>
                          <th>Route</th>
                          <th>Name</th>
                          <th>Journey</th>
                          <th>Current Stage</th>
                          <th>Converted</th>
                          <th>Converted Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combinedJourneyRows
                          .slice(0, 50)
                          .map(
                            (
                              row: MemberJourneyReportRow & { route: string },
                            ) => (
                              <tr key={row.id}>
                                <td>{formatDate(row.joinedAtDate)}</td>
                                <td>{row.route}</td>
                                <td>{row.name || row.username}</td>
                                <td>{row.journey}</td>
                                <td>{formatCourseTypeLabel(row.currentCourseType)}</td>
                                <td>{row.convertedToMember ? "Yes" : "No"}</td>
                                <td>
                                  {row.convertedAtDate
                                    ? formatDate(row.convertedAtDate)
                                    : "-"}
                                </td>
                              </tr>
                            ),
                          )}
                      </tbody>
                    </table>
                    {combinedJourneyRows.length > 50 ? (
                      <p className="reporting-table-note">
                        Showing the first 50 journeys from {combinedJourneyRows.length}{" "}
                        starters across both entry routes in this cohort.
                      </p>
                    ) : null}
                  </div>
                  <div className="reporting-mobile-only">
                    <MobileCardList className="reporting-mobile-row-list">
                      {combinedJourneyRows.slice(0, 50).map((row) => (
                        <article
                          key={`journey-mobile-${row.id}`}
                          className="reporting-mobile-row-card reporting-mobile-journey-card"
                        >
                          <div className="reporting-mobile-journey-header">
                            <div className="reporting-mobile-journey-title-block">
                              <p className="reporting-mobile-row-title">
                                {row.name || row.username}
                              </p>
                              <p className="reporting-mobile-journey-route">
                                {row.originCourseType === "taster-session"
                                  ? "Taster Session route"
                                  : "Direct Beginners route"}
                              </p>
                            </div>
                            <span
                              className={[
                                "reporting-mobile-journey-status",
                                row.convertedToMember
                                  ? "reporting-mobile-journey-status--converted"
                                  : "reporting-mobile-journey-status--active",
                              ].join(" ")}
                            >
                              {row.convertedToMember ? "Converted" : "In progress"}
                            </span>
                          </div>
                          <div className="reporting-mobile-journey-flow">
                            {row.journey}
                          </div>
                          <MobileKeyValueList
                            items={[
                              { label: "Joined", value: formatDate(row.joinedAtDate) },
                              {
                                label: "Current stage",
                                value: formatCourseTypeLabel(row.currentCourseType),
                              },
                              {
                                label: "Converted date",
                                value: row.convertedAtDate
                                  ? formatDate(row.convertedAtDate)
                                  : "-",
                              },
                            ]}
                          />
                        </article>
                      ))}
                    </MobileCardList>
                    {combinedJourneyRows.length > 50 ? (
                      <p className="reporting-table-note">
                        Showing the first 50 journeys from {combinedJourneyRows.length}{" "}
                        starters across both entry routes in this cohort.
                      </p>
                    ) : null}
                  </div>
                  </>
                )}
              </section>

              <div className="reporting-export-panel reporting-export-panel--footer no-print">
                <Button
                  type="button"
                  onClick={handlePrintExport}
                  disabled={memberJourneyQuery.isLoading || !memberJourneyQuery.data}
                >
                  Export PDF
                </Button>
              </div>
            </div>

            <div className="print-report-only">
              <section className="print-report-page">
                <header className="print-report-header">
                  <div className="print-report-header-copy">
                    <h1>Selby Archery Club Beginners Report</h1>
                    <p>Beginners and Taster Sessions membership conversion report.</p>
                  </div>
                  <img
                    className="print-report-logo"
                    src={selbyLogo}
                    alt="Selby Archery Club logo"
                  />
                </header>

                <div className="print-summary-grid">
                  <article className="print-report-card">
                    <h2>Selected Range</h2>
                    <p className="print-report-emphasis">{rangeLabel}</p>
                    <div className="print-summary-metrics">
                      <div>
                        <span>Taster starters</span>
                        <strong>{tasterRows.length}</strong>
                      </div>
                      <div>
                        <span>Direct beginners</span>
                        <strong>{directBeginnersRows.length}</strong>
                      </div>
                      <div>
                        <span>Total members</span>
                        <strong>{beginnersToMembersRows.length}</strong>
                      </div>
                    </div>
                  </article>

                  <article className="print-report-card">
                    <h2>Taster To Beginners</h2>
                    <p className="print-report-emphasis">
                      {formatPercentage(
                        buildStageRate(
                          tasterToBeginnersRows.length,
                          tasterRows.length,
                        ),
                      )}{" "}
                      conversion rate
                    </p>
                    <p>
                      {tasterToBeginnersRows.length} of {tasterRows.length} attendees
                      progressed.
                    </p>
                  </article>

                  <article className="print-report-card">
                    <h2>Taster Path To Member</h2>
                    <p className="print-report-emphasis">
                      {formatPercentage(
                        buildStageRate(
                          tasterToMembersRows.length,
                          tasterToBeginnersRows.length,
                        ),
                      )}{" "}
                      conversion rate
                    </p>
                    <p>
                      {tasterToMembersRows.length} of {tasterRows.length} taster
                      attendees became members.
                    </p>
                  </article>

                  <article className="print-report-card">
                    <h2>Direct Beginners To Member</h2>
                    <p className="print-report-emphasis">
                      {formatPercentage(
                        buildStageRate(
                          directBeginnersToMembersRows.length,
                          directBeginnersRows.length,
                        ),
                      )}{" "}
                      conversion rate
                    </p>
                    <p>
                      {directBeginnersToMembersRows.length} of{" "}
                      {directBeginnersRows.length} direct beginners became members.
                    </p>
                  </article>
                </div>

                <article className="print-report-card print-report-card--flow">
                  <div className="print-report-card-header">
                    <h2>Conversion Flow Chart</h2>
                    <p>Visual flow of both joining routes into full membership.</p>
                  </div>
                  <div className="print-flow-layout">
                    <div className="print-flow-route">
                      <div className="print-flow-node">
                        <span className="print-flow-node-label">Taster Session</span>
                        <strong>{tasterRows.length}</strong>
                      </div>
                      <span className="print-flow-arrow">{"->"}</span>
                      <div className="print-flow-node">
                        <span className="print-flow-node-label">
                          Beginners Course
                        </span>
                        <strong>{tasterToBeginnersRows.length}</strong>
                      </div>
                      <span className="print-flow-arrow">{"->"}</span>
                      <div className="print-flow-node">
                        <span className="print-flow-node-label">Full Member</span>
                        <strong>{tasterToMembersRows.length}</strong>
                      </div>
                    </div>
                    <div className="print-flow-dropoffs">
                      <p>
                        Taster drop-off:{" "}
                        <strong>
                          {Math.max(tasterRows.length - tasterToBeginnersRows.length, 0)}
                        </strong>
                      </p>
                      <p>
                        Beginners drop-off:{" "}
                        <strong>
                          {Math.max(
                            tasterToBeginnersRows.length - tasterToMembersRows.length,
                            0,
                          )}
                        </strong>
                      </p>
                    </div>

                    <div className="print-flow-route">
                      <div className="print-flow-node print-flow-node--direct">
                        <span className="print-flow-node-label">
                          Beginners Course (Direct)
                        </span>
                        <strong>{directBeginnersRows.length}</strong>
                      </div>
                      <span className="print-flow-arrow">{"->"}</span>
                      <div className="print-flow-node">
                        <span className="print-flow-node-label">Full Member</span>
                        <strong>{directBeginnersToMembersRows.length}</strong>
                      </div>
                    </div>
                    <div className="print-flow-dropoffs">
                      <p>
                        Direct route drop-off:{" "}
                        <strong>
                          {Math.max(
                            directBeginnersRows.length -
                              directBeginnersToMembersRows.length,
                            0,
                          )}
                        </strong>
                      </p>
                    </div>
                  </div>
                </article>
              </section>

              <section className="print-report-page">
                <div className="print-card-grid">
                  <article className="print-report-card">
                    <div className="print-report-card-header">
                      <h2>Taster Conversion Funnel</h2>
                      <p>Step-by-step movement from taster attendee to member.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Prev.</th>
                            <th>From Start</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasterFunnelRows.map((row) => (
                            <tr key={`print-${row.stage}`}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.previous}</td>
                              <td>{row.overall}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="print-report-card">
                    <div className="print-report-card-header">
                      <h2>Direct Beginners Funnel</h2>
                      <p>People who joined a Beginners Course without a taster route.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Prev.</th>
                            <th>From Start</th>
                          </tr>
                        </thead>
                        <tbody>
                          {directBeginnersFunnelRows.map((row) => (
                            <tr key={`print-direct-${row.stage}`}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.previous}</td>
                              <td>{row.overall}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="print-report-card">
                    <div className="print-report-card-header">
                      <h2>Combined Beginners To Member Funnel</h2>
                      <p>All Beginners attendees across direct and taster-fed routes.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Stage</th>
                            <th>People</th>
                            <th>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beginnersFunnelRows.map((row) => (
                            <tr key={`print-beginners-${row.stage}`}>
                              <td>{row.stage}</td>
                              <td>{row.people}</td>
                              <td>{row.share}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <article className="print-report-card">
                    <div className="print-report-card-header">
                      <h2>Route Comparison</h2>
                      <p>Compare conversion strength across the Beginners entry routes.</p>
                    </div>
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table reporting-table--compact">
                        <thead>
                          <tr>
                            <th>Route</th>
                            <th>Cohort</th>
                            <th>Converted</th>
                            <th>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beginnersBreakdownRows.map((row) => (
                            <tr key={`print-breakdown-${row.route}`}>
                              <td>{row.route}</td>
                              <td>{row.cohort}</td>
                              <td>{row.converted}</td>
                              <td>{row.rate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>
              </section>

              <section className="print-report-page print-report-page--journeys">
                <article className="print-report-card print-report-card--journey">
                  <div className="print-report-card-header">
                    <h2>Journey Detail</h2>
                    <p>Individual attendee journeys across both entry routes.</p>
                  </div>
                  {combinedJourneyRows.length === 0 ? (
                    <p className="usage-empty-state">
                      No attendee journeys started in the selected date range.
                    </p>
                  ) : (
                    <div className="reporting-table-wrap">
                      <table className="committee-roles-table reporting-table print-journey-table">
                        <thead>
                          <tr>
                            <th>Joined</th>
                            <th>Route</th>
                            <th>Name</th>
                            <th>Journey</th>
                            <th>Current Stage</th>
                            <th>Converted</th>
                            <th>Converted Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedJourneyRows
                            .slice(0, 50)
                            .map(
                              (
                                row: MemberJourneyReportRow & { route: string },
                              ) => (
                                <tr key={`print-journey-${row.id}`}>
                                  <td>{formatDate(row.joinedAtDate)}</td>
                                  <td>{row.route}</td>
                                  <td>{row.name || row.username}</td>
                                  <td>{row.journey}</td>
                                  <td>{row.currentCourseType}</td>
                                  <td>{row.convertedToMember ? "Yes" : "No"}</td>
                                  <td>
                                    {row.convertedAtDate
                                      ? formatDate(row.convertedAtDate)
                                      : "-"}
                                  </td>
                                </tr>
                              ),
                            )}
                        </tbody>
                      </table>
                      {combinedJourneyRows.length > 50 ? (
                        <p className="reporting-table-note">
                          Showing the first 50 journeys from {combinedJourneyRows.length}{" "}
                          starters across both entry routes in this cohort.
                        </p>
                      ) : null}
                    </div>
                  )}
                </article>
              </section>
            </div>

          </>
        ) : null}
      </SectionPanel>
    </div>
  );
}
