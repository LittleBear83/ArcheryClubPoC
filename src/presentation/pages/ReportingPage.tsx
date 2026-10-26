import { useReportingPageState } from "./reporting/useReportingPageState";
import type { UserProfile } from "../../types/app";
import { ReportingVisualDashboard } from "./reporting/ReportingVisualDashboard";

export function ReportingPage({
  currentUserProfile,
}: {
  currentUserProfile: UserProfile | null;
}) {
  const reportingPageState = useReportingPageState(currentUserProfile);

  if (!reportingPageState.canViewReports) {
    return <p>You do not have permission to view reports.</p>;
  }

  return <ReportingVisualDashboard state={reportingPageState} />;
}
