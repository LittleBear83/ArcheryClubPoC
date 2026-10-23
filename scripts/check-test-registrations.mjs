import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const runner = await readFile(path.join(root, "scripts/run-tests.mjs"), "utf8");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const postgresRunner = packageJson.scripts["test:postgres-integration"] ?? "";

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(entryPath);
    return /\.test\.(?:js|mjs|ts|tsx)$/u.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

const testFiles = (await Promise.all(
  ["server", "src", "shared", "scripts"].map((directory) =>
    findTests(path.join(root, directory))),
)).flat();
const names = new Set();
for (const file of testFiles) {
  const name = path.basename(file);
  if (names.has(name)) {
    throw new Error(`Duplicate test filename needs explicit path registration: ${name}`);
  }
  names.add(name);
}
const missing = testFiles.filter((file) => {
  const name = path.basename(file);
  if (name.endsWith("PostgresIntegration.test.js")) {
    return !postgresRunner.includes(name);
  }
  if (!runner.includes(name.replace(/\.test\.tsx?$/u, ".test.js"))) {
    return true;
  }
  return /\.test\.tsx?$/u.test(name) && !runner.includes(name);
});

if (missing.length) {
  throw new Error(`Tests missing from npm test or test:postgres-integration:\n${missing
    .map((file) => path.relative(root, file))
    .sort()
    .join("\n")}`);
}
