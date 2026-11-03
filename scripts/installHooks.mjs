// Points git at the repository's own hooks folder (.githooks) so the guard runs before every push. Runs automatically before
// `npm run build` (npm "prebuild") and on `npm install` ("prepare"). Silent and harmless outside a git checkout.
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const cur = execSync("git config core.hooksPath", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  if (cur !== ".githooks") throw new Error("not set");
} catch {
  try { execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "ignore" }); console.log("[hooks] git hooks installed (.githooks)"); } catch { /* not a git checkout */ }
}
