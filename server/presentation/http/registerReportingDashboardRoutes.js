import { buildLoginMethodReport, resolveDashboardPeriod } from "../../domain/services/loginMethodReport.js";
import { DEFAULT_DASHBOARD_PERIOD } from "../../../shared/attendancePolicy.js";

export function registerReportingDashboardRoutes({ app, getActorUser, actorHasPermission, PERMISSIONS, loginMethodReportingGateway, now = () => new Date() }) {
  app.get("/api/reporting/login-methods", async (req, res) => {
    if (!actorHasPermission(getActorUser(req), PERMISSIONS.VIEW_REPORTS)) {
      return res.status(403).json({ success: false, message: "You do not have permission to view reports." });
    }
    let period;
    try { period = resolveDashboardPeriod(req.query.period ?? DEFAULT_DASHBOARD_PERIOD, now()); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    const rows = await loginMethodReportingGateway.countByMethod(period);
    res.set?.("Cache-Control", "no-store");
    return res.json({ success: true, report: buildLoginMethodReport(rows, period) });
  });
}
