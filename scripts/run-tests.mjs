import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

await import("./check-test-registrations.mjs");
const root = process.cwd();
await import("../shared/attendancePolicy.test.js");
await import("../shared/handicapAllowance.test.js");
await import("../shared/membershipClassification.test.js");
await import("../src/utils/userProfile.test.js");
await import("../src/api/beginnersCourseTypeSupport.test.js");
await import("../src/presentation/navigation/memberPageAccess.test.js");
await import("../server/domain/services/tournamentHandicapService.test.js");
await import("../server/domain/services/rememberedDeviceService.test.js");
await import("../server/security/rememberedDeviceCookie.test.js");
await import("../server/infrastructure/persistence/rememberedDeviceGateway.test.js");
await import("../server/presentation/http/registerAuthRoutes.remembered.test.js");
await import("../server/domain/services/goldenRecordsIndoorMapping.test.js");
await import("../server/domain/services/goldenRecordsOutdoorMapping.test.js");
await import("../server/domain/services/goldenRecordsOutdoorSync.test.js");
await import("../server/domain/services/beginnerCourseRules.test.js");
await import("../server/domain/services/beginnerCourseViews.test.js");
await import("../server/domain/services/feedbackSync.test.js");
await import("../server/presentation/http/goldenRecordsIndoorBackfillRoutes.test.js");
await import("../server/presentation/http/registerCourseDateCancellationRoutes.test.js");
await import("../server/presentation/http/registerBeginnersCourseRoutes.test.js");
await import("../server/infrastructure/golden-records/goldenRecordsPagination.test.js");
await import("../server/domain/services/loginMethodReport.test.js");
await import("../src/presentation/pages/achievementTableSelection.test.js");
await import("../src/presentation/pages/featureStyles.test.js");
await import("../src/presentation/pages/aggregateIndoorTableRows.test.js");
await import("../src/presentation/pages/records/handicapLookup.test.js");
await import("../src/presentation/pages/records/handicapMemberDefaults.test.js");
await import("../src/presentation/pages/records/groupHandicapRounds.test.js");
await import("../src/presentation/pages/goldenRecordsReferenceRefresh.test.js");
await import("../server/presentation/http/tournamentTemplateCapability.test.js");
await import("../server/presentation/http/tournamentRegistration.test.js");
await import("../server/presentation/http/registerTournamentRoutes.templateUpdate.test.js");
await import("../server/infrastructure/persistence/tournamentTemplateUpdate.test.js");
await import("../server/infrastructure/persistence/createSqliteBeginnersCourseStatements.test.js");
await import("../server/domain/services/goldenRecordsManualMatch.test.js");
await import("../server/domain/services/goldenRecordsBowDisciplineImport.test.js");
await import("../server/presentation/http/goldenRecordsBowDisciplineImportRoutes.test.js");
await import("../server/infrastructure/golden-records/goldenRecordsBowDisciplineImportService.test.js");
await import("../server/infrastructure/persistence/goldenRecordsManualMatchGateway.test.js");
await import("../server/infrastructure/persistence/goldenRecordsManualMatchTransaction.test.js");
await import("../server/presentation/http/goldenRecordsManualMatchRoute.test.js");
await import("../src/presentation/pages/beginnersCourseWorkflow.test.js");
await import("../server/domain/services/beginnerConversionCaseLoan.test.js");
await import("../server/domain/services/beginnerConversionDate.test.js");
await import("../server/domain/services/runBeginnerConversion.test.js");
await import("../server/infrastructure/persistence/beginnerConversionTransaction.test.js");
await import("../server/presentation/http/registerCoachingHubRoutes.test.js");
await import("../server/infrastructure/persistence/coachingAssignmentNotificationGateway.test.js");
await import("../server/infrastructure/persistence/coachingParticipantNoteGateway.test.js");
await import("../shared/award252Progression.test.js");
await import("../server/infrastructure/persistence/memberDistanceSignOffRepository.test.js");
await import("../server/presentation/http/beginnersCourseCoachRequirements.test.js");
const outDir = path.join(root, ".test-dist");
const files = [
  "src/utils/userProfile.js",
  "src/utils/mobileInstall.ts",
  "src/utils/mobileInstall.test.ts",
  "src/utils/memberClassification.ts",
  "src/utils/memberClassification.test.ts",
  "src/utils/joiningRoutes.ts",
  "src/presentation/pages/home/committeeApprovalSummaryUtils.ts",
  "src/presentation/pages/home/committeeApprovalSummaryUtils.test.ts",
  "src/presentation/pages/reporting/reportingUtils.ts",
  "src/presentation/pages/reporting/reportingUtils.test.ts",
  "src/presentation/pages/reporting/reportingTime.ts",
  "src/presentation/pages/reporting/reportingTime.test.ts",
  "src/presentation/pages/reporting/reportingPresentation.ts",
  "src/presentation/pages/reporting/reportingPresentation.test.ts",
  "src/presentation/pages/reporting/rangeVisitPeriods.ts",
  "src/presentation/pages/reporting/rangeVisitPeriods.test.ts",
  "src/presentation/pages/reporting/reportingInsights.ts",
  "src/presentation/pages/reporting/reportingInsights.test.ts",
  "src/presentation/pages/reporting/reportingExportBuilder.ts",
  "src/presentation/pages/reporting/reportingExportBuilder.test.ts",
  "src/presentation/pages/reporting/ReportingSharedSections.tsx",
  "src/presentation/pages/reporting/ReportingSharedSections.test.tsx",
  "src/presentation/pages/records/HandicapReferencePanel.tsx",
  "src/presentation/pages/records/HandicapReferencePanel.test.tsx",
  "shared/membershipClassification.js",
  "shared/membershipClassificationRules.js",
  "shared/attendancePolicy.js",
  "src/presentation/pages/coachingHubModel.ts",
  "src/presentation/pages/coachingHubModel.test.ts",
  "src/presentation/pages/courseCoachRequirements.ts",
  "src/presentation/pages/courseCoachRequirements.test.ts",
  "src/presentation/pages/CoachingParticipantsList.tsx",
  "src/presentation/components/Button.tsx",
  "src/presentation/components/DatePicker.tsx",
  "src/presentation/components/mobile/MobileActionBar.tsx",
  "src/presentation/pages/profile/ProfileAccordion.tsx",
  "src/presentation/hooks/useIsMobile.ts",
  "src/utils/dateTime.js",
  "src/presentation/pages/range-usage/rangeUsageUtils.ts",
  "src/presentation/pages/range-usage/rangeUsageUtils.test.ts",
  "src/api/reportingDashboardApi.ts",
  "src/theme/themes.ts",
  "src/theme/ThemeContext.ts",
  "src/theme/useTheme.ts",
  "src/presentation/pages/reporting/dashboard/DashboardCard.tsx",
  "src/presentation/pages/reporting/dashboard/DashboardPeriodFilter.tsx",
  "src/presentation/pages/reporting/dashboard/LoginMethodChartCard.tsx",
  "src/presentation/pages/reporting/dashboard/reportingDashboard.test.tsx",
  "src/presentation/pages/roles/rolePermissionsUtils.ts",
  "src/presentation/pages/roles/rolePermissionsUtils.test.ts",
  "src/api/client.ts",
  "src/api/client.test.ts",
  "src/api/memberProfileApi.ts",
  "src/api/memberProfileApi.test.ts",
  "src/api/beginnersCoursesApi.ts",
  "src/api/beginnersCoursesApi.test.ts",
  "src/presentation/pages/home/committeeApprovalsCardUtils.ts",
  "src/presentation/pages/home/committeeApprovalsCardUtils.test.ts",
  "src/presentation/pages/home/committeeApprovedCoursesUtils.ts",
  "src/presentation/pages/home/committeeApprovedCoursesUtils.test.ts",
  "src/presentation/pages/home/homeActivityFilters.ts",
  "src/presentation/pages/home/homeActivityFilters.test.ts",
  "src/presentation/pages/home/homeTickerUtils.ts",
  "src/presentation/pages/home/HomeTickers.tsx",
  "src/presentation/pages/home/HomeTickers.test.tsx",
  "src/data/repositories/RoleRepositoryImpl.ts",
  "src/data/repositories/RoleRepositoryImpl.test.ts",
  "src/domain/repositories/RoleRepository.ts",
];

function rewriteRelativeImports(source) {
  const rewriteSpecifier = (specifier) =>
    specifier.endsWith(".js")
      ? specifier
      : specifier.replace(/\.ts$/, "") + ".js";

  return source
    .replace(
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteSpecifier(specifier)}${suffix}`,
    )
    .replace(
      /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteSpecifier(specifier)}${suffix}`,
    );
}

await rm(outDir, { force: true, recursive: true });

for (const file of files) {
  const inputPath = path.join(root, file);
  const outputPath = path.join(outDir, file).replace(/\.tsx?$/, ".js");
  const source = ts.sys.readFile(inputPath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: inputPath,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rewriteRelativeImports(transpiled.outputText));
}

await copyFile(
  path.join(root, "src/api/beginnersCourseTypeSupport.js"),
  path.join(outDir, "src/api/beginnersCourseTypeSupport.js"),
);
await mkdir(path.join(outDir, "shared"), { recursive: true });
await copyFile(path.join(root, "shared/handicapAllowance.js"), path.join(outDir, "shared/handicapAllowance.js"));
await copyFile(path.join(root, "src/presentation/pages/records/handicapLookup.js"),
  path.join(outDir, "src/presentation/pages/records/handicapLookup.js"));

await import(pathToFileURL(path.join(outDir, "src/api/client.test.js")));
await import(pathToFileURL(path.join(outDir, "src/utils/mobileInstall.test.js")));
await import(pathToFileURL(path.join(outDir, "src/utils/memberClassification.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/home/committeeApprovalSummaryUtils.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/reportingUtils.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/reportingTime.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/reportingPresentation.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/rangeVisitPeriods.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/reportingInsights.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/reportingExportBuilder.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/ReportingSharedSections.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/records/HandicapReferencePanel.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/home/HomeTickers.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/range-usage/rangeUsageUtils.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/reporting/dashboard/reportingDashboard.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/roles/rolePermissionsUtils.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/coachingHubModel.test.js")));
await import(pathToFileURL(path.join(outDir, "src/presentation/pages/courseCoachRequirements.test.js")));
await import(pathToFileURL(path.join(outDir, "src/api/memberProfileApi.test.js")));
await import(pathToFileURL(path.join(outDir, "src/api/beginnersCoursesApi.test.js")));
await import(
  pathToFileURL(
    path.join(outDir, "src/presentation/pages/home/committeeApprovalsCardUtils.test.js"),
  )
);
await import(
  pathToFileURL(
    path.join(
      outDir,
      "src/presentation/pages/home/committeeApprovedCoursesUtils.test.js",
    ),
  )
);
await import(
  pathToFileURL(path.join(outDir, "src/presentation/pages/home/homeActivityFilters.test.js"))
);
await import(
  pathToFileURL(path.join(outDir, "src/data/repositories/RoleRepositoryImpl.test.js"))
);
await import(pathToFileURL(path.join(root, "src/utils/localRfidBridge.test.js")));
await import(pathToFileURL(path.join(root, "server/domain/services/rfidScanIdentity.test.js")));
await import(pathToFileURL(path.join(root, "server/infrastructure/rfidBridgeConsumer.test.js")));
await import(pathToFileURL(path.join(root, "server/presentation/http/registerAuthRoutes.rfid.test.js")));
await import(
  pathToFileURL(
    path.join(root, "src/presentation/pages/profile/rfidAgentInstall.test.js"),
  ),
);
await import(new URL("./lib/liveSyncWatcher.test.mjs", import.meta.url));
await import(pathToFileURL(path.join(root, "server/security/csrf.test.js")));
await import(pathToFileURL(path.join(root, "server/security/rateLimit.test.js")));
await import(
  pathToFileURL(path.join(root, "server/observability/securityEventLogger.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/runPostgresMigrations.test.js"))
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/infrastructure/persistence/postgresMigrations/010_member_signoff_committee_sync.test.js",
    ),
  ),
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/infrastructure/persistence/postgresMigrations/014_tournament_sync.test.js",
    ),
  ),
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/infrastructure/persistence/postgresMigrations/011_committee_minutes_sync.test.js",
    ),
  ),
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/infrastructure/persistence/committeeMinutesSyncPublication.test.js",
    ),
  ),
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/phase2a1PostgresIntegrationGuards.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/rfidAgentDistribution.test.js"))
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/infrastructure/persistence/createSqliteReportingStatements.test.js",
    ),
  )
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/handicapTableGateway.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/localRebaselineMaintenanceGate.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/syncGateway.test.js"))
);
await import("../server/infrastructure/persistence/auditLogGateway.test.js");
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/syncPublicationGateway.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/sqliteToPostgresMigration.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/domain/services/memberPersistenceService.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/domain/services/localDatabaseSyncService.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/domain/services/tournamentSync.test.js"))
);
await import(
  pathToFileURL(
    path.join(
      root,
      "server/domain/services/committeeMinutesLocalSync.test.js",
    ),
  ),
);
await import("../server/domain/services/localSyncBrowserEvents.test.js");
await import("../server/infrastructure/persistence/memberProfileGateway.test.js");
await import(
  pathToFileURL(path.join(root, "server/domain/services/tournamentEngine.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/domain/services/tournamentEligibilityService.test.js"))
);
await import(pathToFileURL(path.join(root, "server/index.test.js")));
await import(
  pathToFileURL(path.join(root, "server/domain/services/goldenRecordsMemberSyncService.test.js"))
);
await import(
  pathToFileURL(
    path.join(root, "server/domain/services/goldenRecordsMemberSyncService.partial-failure.test.js"),
  )
);
await import(
  pathToFileURL(path.join(root, "server/presentation/http/securedRoutes.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/presentation/http/registerSyncRoutes.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/presentation/http/registerScheduleRoutes.test.js"))
);
await import(
  pathToFileURL(
    path.join(root, "server/presentation/http/registerRfidAgentDistributionRoutes.test.js"),
  )
);
await import(new URL("../server/domain/services/goldenRecordsAchievements.test.js", import.meta.url));
await import(new URL("../server/infrastructure/golden-records/goldenRecordsCurrentHandicapService.test.js", import.meta.url));
await import("../server/domain/services/goldenRecordsIndoorSync.test.js");
await import("../server/infrastructure/persistence/indoorTableGateway.test.js");
await import("../server/presentation/http/registerIndoorTableRoutes.test.js");
await import(new URL("../server/infrastructure/persistence/bootstrapSqliteBaseSchema.test.js", import.meta.url));
await import(new URL("../server/infrastructure/golden-records/goldenRecordsIntegrationService.test.js", import.meta.url));
await import("../server/domain/services/tournamentPairings.test.js");
await import("../server/presentation/http/workflowEnhancements.test.js");
await import("../server/domain/services/goldenRecordsSyncJob.test.js");
await import("../server/domain/services/goldenRecordsNightlySchedule.test.js");
await import("../server/infrastructure/golden-records/goldenRecordsHttpClient.retry.test.js");
await import("../server/infrastructure/golden-records/goldenRecordsManualTaskQueue.test.js");
await import("../server/presentation/http/goldenRecordsSyncJobRoutes.test.js");
await import("../server/presentation/http/registerGoldenRecordsNightlySyncRoute.test.js");
await import("../server/presentation/http/registerGoldenRecordsManualSyncRoute.test.js");
await import("../server/presentation/http/goldenRecordsProfileWiring.test.js");
await import("../server/presentation/http/registerEquipmentRoutes.expectedReturn.test.js");
