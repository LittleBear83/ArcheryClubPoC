import { useIsMobile } from "../hooks/useIsMobile";
import { ReportingDesktopView } from "./reporting/ReportingDesktopView";
import { ReportingMobileView } from "./reporting/ReportingMobileView";
import { useReportingPageState } from "./reporting/useReportingPageState";
import type { UserProfile } from "../../types/app";
import { ReportingDashboard } from "./reporting/dashboard/ReportingDashboard";
import "./reporting/dashboard/reportingDashboard.css";
import { ProfileAccordion } from "./profile/ProfileAccordion";

export function ReportingPage({
  currentUserProfile,
}: {
  currentUserProfile: UserProfile | null;
}) {
  const isMobile = useIsMobile();
  const reportingPageState = useReportingPageState(currentUserProfile);

  if (!reportingPageState.canViewReports) {
    return <p>You do not have permission to view reports.</p>;
  }

  return <>{isMobile
    ? <ReportingMobileView {...reportingPageState} />
    : <ReportingDesktopView {...reportingPageState} />}
    <div className="reporting-dashboard-accordion">
      <ProfileAccordion title="Dashboard" detail="Member login methods">
        <ReportingDashboard actorUsername={currentUserProfile?.auth?.username ?? ""} />
      </ProfileAccordion>
    </div>
  </>;
}
