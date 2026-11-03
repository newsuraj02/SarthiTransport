import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { collectCriteria } from "./scripts/criteria.mjs";

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
        // tracked files edited but not committed (the untracked scripts/package-lock.json is expected and ignored)
        dirty: git("git status --porcelain --untracked-files=no").length > 0,
        builtAt: new Date().toISOString(),
        criteria,
      };
      mkdirSync(join(process.cwd(), outDir), { recursive: true });
      writeFileSync(join(process.cwd(), outDir, "build.json"), JSON.stringify(stamp, null, 1));
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  server: {
    host: true,
  },
});
