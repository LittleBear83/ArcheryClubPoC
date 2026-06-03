import { useIsMobile } from "../hooks/useIsMobile";
import { ReportingDesktopView } from "./reporting/ReportingDesktopView";
import { ReportingMobileView } from "./reporting/ReportingMobileView";
import { useReportingPageState } from "./reporting/useReportingPageState";
import type { UserProfile } from "../../types/app";

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

  return isMobile
    ? <ReportingMobileView {...reportingPageState} />
    : <ReportingDesktopView {...reportingPageState} />;
}
