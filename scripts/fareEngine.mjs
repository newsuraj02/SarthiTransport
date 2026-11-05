// Loads the REAL fare / trip-money engine out of src/App.jsx (pure JS between two markers, no JSX) so it can be tested on its own.
// Used by scripts/verifyInvariants.mjs (behaviour + golden checks) and scripts/updateGolden.mjs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractBlock } from "./criteria.mjs";

export function loadFareEngine(root) {
  const app = readFileSync(join(root, "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
  const a = app.indexOf("export const FARE_TIER_MAX_KG_UNCAPPED");
  const bStart = app.indexOf("function resolveFareForTier");
  const bEnd = app.indexOf("\n}\n", bStart) + 3;
  if (a < 0 || bStart < 0) throw new Error("fare engine markers not found");
  const region = app.slice(a, bEnd).replace(/^export\s+/gm, "");
  const hav = extractBlock(app, "haversineKm").replace(/^export\s+/, "");
  return new Function(hav + "\n" + region + `; return { calculateFare, priceOutstation, DEFAULT_FARE_TIERS, zoneFor, findFareTier, enforceMonotonicFares, haltOf, includedDays,
    daysUsed, buildBill, getAdminRouteOverride, findExactAdminRoute, getRouteScaleRatio, resolveFareForTier, applyDieselToSavedRates, findFareOutliers,
    applyMarketAdjustPct, clampMarketAdjustPct, marketAdjustFactor,
    PORTER_OUTSTATION_RAW, PRICE_CORRECTOR_ANCHORS, priceCorrectionFactor, haltPerDayFor, KM_PER_DAY, DIESEL_BASELINE_PRICE_PER_LITRE, DIESEL_MILEAGE_BY_TIER_MAX_KG };`)();
}

// The golden grid: what the app charges, tier x distance x diesel price, as of the last deliberate update.
export const GOLDEN_KMS = [3, 10, 13, 25, 30, 31, 60, 113, 200, 400, 800];
export const GOLDEN_DIESEL = [98, 110];
export function goldenGrid(engine) {
  const out = {};
  for (const t of engine.DEFAULT_FARE_TIERS) for (const km of GOLDEN_KMS) for (const d of GOLDEN_DIESEL) out[`t${t.maxKg}|${km}km|d${d}`] = engine.calculateFare(t.maxKg, km, engine.DEFAULT_FARE_TIERS, null, 0, d);
  return out;
}
