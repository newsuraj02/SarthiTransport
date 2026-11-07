import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectCriteria } from "./scripts/criteria.mjs";
import { gitDirtyState } from "./scripts/dirtyState.mjs";

// Writes dist/build.json on every build (2026-11-03, "the app seems to get back to its older self"): WHICH commit this build came from,
// whether the folder had uncommitted edits, when it was built, and the fingerprint of every criterion (scripts/criteria.mjs). The
// morning/evening scan (functions/healthAudit.js) fetches the LIVE /build.json, tells Admin when the live app is not the latest commit
// or was built from edited code, and lists exactly which criteria changed since the previous scan.
function buildStamp() {
  let outDir = "dist";
  const git = (c) => { try { return execSync(c, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
  return {
    name: "build-stamp",
    apply: "build",
    configResolved(cfg) { outDir = cfg.build.outDir; },
    closeBundle() {
      const { criteria } = collectCriteria(process.cwd());
      const stamp = {
        commit: git("git rev-parse --short HEAD") || "unknown",
        commitFull: git("git rev-parse HEAD") || "unknown",
        branch: git("git rev-parse --abbrev-ref HEAD") || "unknown",
        // tracked WEBSITE files edited but not committed (scripts/dirtyState.mjs: lock files, native Android files, docs and tests do not count; the files are named)
        ...(({ dirty, dirtyFiles }) => ({ dirty, dirtyFiles }))(gitDirtyState(process.cwd(), "web")),
        builtAt: new Date().toISOString(),
        criteria,
        // open issues the owner has been told about (scripts/knownIssues.json) -- the scan lists them every run so they are not forgotten
        knownIssues: (() => { try { return JSON.parse(readFileSync(join(process.cwd(), "scripts/knownIssues.json"), "utf8")); } catch { return []; } })(),
      };
      mkdirSync(join(process.cwd(), outDir), { recursive: true });
      writeFileSync(join(process.cwd(), outDir, "build.json"), JSON.stringify(stamp, null, 1));
    },
  };
}

// The commit this bundle was built from, baked INTO the JavaScript so the running app can compare itself with the live /build.json
// (Admin scan tile: "this device runs an older build -- tap Refresh").
const bundleCommit = (() => { try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown"; } catch { return "unknown"; } })();

export default defineConfig({
  define: { __BUNDLE_COMMIT__: JSON.stringify(bundleCommit) },
  plugins: [react(), buildStamp()],
  server: {
    host: true,
  },
});
