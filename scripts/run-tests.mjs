import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const outDir = path.join(root, ".test-dist");
const files = [
  "src/api/client.ts",
  "src/api/client.test.ts",
  "src/api/memberProfileApi.ts",
  "src/api/memberProfileApi.test.ts",
  "src/presentation/pages/home/committeeApprovalsCardUtils.ts",
  "src/presentation/pages/home/committeeApprovalsCardUtils.test.ts",
  "src/presentation/pages/home/committeeApprovedCoursesUtils.ts",
  "src/presentation/pages/home/committeeApprovedCoursesUtils.test.ts",
  "src/presentation/pages/home/homeActivityFilters.ts",
  "src/presentation/pages/home/homeActivityFilters.test.ts",
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
  const outputPath = path.join(outDir, file).replace(/\.ts$/, ".js");
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

await import(pathToFileURL(path.join(outDir, "src/api/client.test.js")));
await import(pathToFileURL(path.join(outDir, "src/api/memberProfileApi.test.js")));
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
      "server/infrastructure/persistence/createSqliteReportingStatements.test.js",
    ),
  )
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/handicapTableGateway.test.js"))
);
await import(
  pathToFileURL(path.join(root, "server/infrastructure/persistence/syncGateway.test.js"))
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
