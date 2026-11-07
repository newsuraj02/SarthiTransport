// "Was this deployment built from UNCOMMITTED code?" -- used by vite.config.js (website stamp) and scripts/writeFunctionsStamp.mjs (functions stamp).
// Owner 2026-11-07: the Admin Change Log kept reporting "Cloud Functions / the live app were built from UNCOMMITTED code" although nothing that is
// deployed had changed: ANY edited tracked file counted -- a package-lock.json that `npm install` rewrote, a native Android file (strings.xml with the real
// Facebook ID), docs, tests. Now only files that really go INTO that deployment count, and the stamp NAMES them so the alert says what to commit.
import { execSync } from "node:child_process";

// Files whose edits change what is deployed.
const WEB = [/^src\//, /^public\//, /^index\.html$/, /^vite\.config\.js$/, /^tailwind\.config\.js$/, /^postcss\.config\.js$/, /^package\.json$/, /^firebase\.json$/];
const FUNCTIONS = [/^functions\//, /^firestore\.rules$/, /^storage\.rules$/, /^firebase\.json$/];
// Never code: lock files npm rewrites, generated stamps.
const IGNORED = [/(^|\/)package-lock\.json$/, /^functions\/build\.json$/, /^dist\//];

export function dirtyFilesFromPorcelain(porcelain, scope) {
  const patterns = scope === "functions" ? FUNCTIONS : WEB;
  return String(porcelain || "").split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim())
    .map((l) => l.slice(3).replace(/^"|"$/g, "").split(" -> ").pop())
    .filter((f) => patterns.some((r) => r.test(f)) && !IGNORED.some((r) => r.test(f)));
}

// -> { dirty, dirtyFiles } for "web" (the website build) or "functions" (the Cloud Functions deploy).
export function gitDirtyState(root, scope) {
  let out = "";
  try { out = execSync("git status --porcelain --untracked-files=no", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { out = ""; }
  const files = dirtyFilesFromPorcelain(out, scope);
  return { dirty: files.length > 0, dirtyFiles: files.slice(0, 10) };
}
