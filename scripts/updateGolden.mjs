// Regenerates scripts/golden/fares.json from the CURRENT fare engine. Run ONLY after a deliberate fare change, then also run
//   npm run criteria:accept -- "why the fares changed"
// The invariants fail while the golden file and the engine disagree, so a fare can never change without someone seeing the diff.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFareEngine, goldenGrid } from "./fareEngine.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const grid = goldenGrid(loadFareEngine(root));
writeFileSync(join(root, "scripts/golden/fares.json"), JSON.stringify(grid, null, 0).replace(/,"/g, ',\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}") + "\n");
console.log(`golden fares written: ${Object.keys(grid).length} values`);
