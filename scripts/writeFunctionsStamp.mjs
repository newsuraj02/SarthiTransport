// Runs automatically before `firebase deploy --only functions` (firebase.json -> functions.predeploy). Writes functions/build.json so the
// deployed Cloud Functions know WHICH commit they came from; the morning/evening scan compares it with the live hosting build and the
// latest commit on GitHub (functions/healthAudit.js auditDeployment). functions/build.json is git-ignored (generated at deploy time).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCriteria } from "./criteria.mjs";
import { gitDirtyState } from "./dirtyState.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (c) => { try { return execSync(c, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const { criteria } = collectCriteria(root);
const fnCriteria = Object.fromEntries(Object.entries(criteria).filter(([k]) => k.startsWith("fns:") || k.startsWith("fn:") || k.startsWith("file:functions/") || k === "file:firestore.rules"));
writeFileSync(join(root, "functions/build.json"), JSON.stringify({
  commit: git("git rev-parse --short HEAD") || "unknown", commitFull: git("git rev-parse HEAD") || "unknown", branch: git("git rev-parse --abbrev-ref HEAD") || "unknown",
  ...gitDirtyState(root, "functions"), builtAt: new Date().toISOString(), criteria: fnCriteria,
}, null, 1));
console.log("functions/build.json written");
