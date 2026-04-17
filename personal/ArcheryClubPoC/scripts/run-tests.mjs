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
  pathToFileURL(path.join(outDir, "src/data/repositories/RoleRepositoryImpl.test.js"))
);
