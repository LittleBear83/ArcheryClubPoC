import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);
const baseRef = process.argv[2] ?? "origin/main";

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getChangedFiles() {
  const mergeBase = runGit(["merge-base", baseRef, "HEAD"]).trim();
  const output = runGit([
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
    `${baseRef}...HEAD`,
  ]);

  const files = output
    .split("\0")
    .filter(Boolean)
    .filter((file) => supportedExtensions.has(path.extname(file)))
    .filter((file) => existsSync(path.resolve(process.cwd(), file)));

  return { mergeBase, files };
}

function runEslint(files) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const eslintBin = path.resolve(scriptDir, "..", "node_modules", "eslint", "bin", "eslint.js");

  if (!existsSync(eslintBin)) {
    console.error(`Unable to find local ESLint binary at ${eslintBin}`);
    process.exit(1);
  }

  const child = spawn(process.execPath, [eslintBin, ...files], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`Failed to start ESLint: ${error.message}`);
    process.exit(1);
  });

  child.on("close", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

try {
  const { mergeBase, files } = getChangedFiles();

  console.log(`Using merge base ${mergeBase} for ${baseRef}...HEAD`);

  if (files.length === 0) {
    console.log("No changed ESLint-supported source files detected; skipping ESLint.");
    process.exit(0);
  }

  console.log("Linting changed files:");
  for (const file of files) {
    console.log(`- ${file}`);
  }

  runEslint(files);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to determine changed files for ${baseRef}...HEAD: ${message}`);
  process.exit(1);
}
