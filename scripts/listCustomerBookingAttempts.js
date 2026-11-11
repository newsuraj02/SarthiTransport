// READ-ONLY admin script (owner 2026-11-11): lists the customers who tried to book, booked, or cancelled a ride -- name + phone number --
// so they can be contacted personally. It writes NOTHING.
//
// Usage:
//   cd scripts
//   npm install
//   node listCustomerBookingAttempts.js /path/to/serviceAccountKey.json                    (everyone who ever pressed Book)
//   node listCustomerBookingAttempts.js /path/to/serviceAccountKey.json --days 7           (only bookings made in the last 7 days)
//   node listCustomerBookingAttempts.js /path/to/serviceAccountKey.json --followup         (only customers who may still need a ride: never got a driver)
//   node listCustomerBookingAttempts.js /path/to/serviceAccountKey.json --csv > customers.csv   (spreadsheet-friendly)
//
// What counts (every time a customer presses "Book now" the app saves ONE booking record, so this is exactly "tried to book"):
//   NO DRIVER   the request was sent but no driver ever accepted: still searching, or cancelled (by the customer or by the system) before any driver had it
//   CANCELLED   the customer cancelled after a driver had accepted
//   ONGOING     a driver accepted and the trip is running
//   COMPLETED   the trip finished
// "FOLLOW-UP = YES" marks a customer whose LATEST request ended with NO DRIVER (searching, or cancelled with no driver) -- the ones you would call to book for them.
// Limit: a customer who only looked at the vehicle list and never pressed Book leaves no record, so cannot appear here.

const path = require("path");

const IST = { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true };
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : Number(v) || 0);
const when = (ms) => (ms ? new Date(ms).toLocaleString("en-IN", IST) : "-");

// One booking record -> what happened to that request.
function outcomeOf(b) {
  if (b.status === "Completed") return "COMPLETED";
  if (b.status === "Ongoing") return "ONGOING";
  if (b.status === "Cancelled") return b.driverName ? "CANCELLED" : "NO DRIVER";
  return "NO DRIVER"; // AwaitingDriver / Searching / anything else not yet accepted
}

// Pure: bookings + customers -> one row per customer, most recent request first. `sinceMs` filters by booking time.
function summarize(bookings, customers, sinceMs = 0) {
  const nameByMobile = {};
  (customers || []).forEach((c) => { if (c.mobile) nameByMobile[String(c.mobile)] = c.name || ""; });
  const byMobile = {};
  (bookings || []).forEach((b) => {
    const mobile = String(b.customerMobile || "").replace(/\D/g, "").slice(-10);
    if (!mobile) return;
    const ms = tsMs(b.createdAt) || tsMs(b.acceptedAt);
    if (sinceMs && ms < sinceMs) return;
    (byMobile[mobile] = byMobile[mobile] || []).push({ b, ms, outcome: outcomeOf(b) });
  });
  return Object.entries(byMobile).map(([mobile, list]) => {
    list.sort((x, y) => y.ms - x.ms);
    const latest = list[0];
    const count = (o) => list.filter((x) => x.outcome === o).length;
    return {
      mobile,
      name: nameByMobile[mobile] || latest.b.customerName || list.map((x) => x.b.customerName).find(Boolean) || "",
      tried: list.length, noDriver: count("NO DRIVER"), cancelled: count("CANCELLED"), ongoing: count("ONGOING"), completed: count("COMPLETED"),
      lastAt: latest.ms, lastOutcome: latest.outcome,
      lastRoute: `${latest.b.pickup || "?"} -> ${latest.b.drop || "?"}`, lastFare: latest.b.fare ?? null, lastWhen: latest.b.scheduledFor ? `Advance ${latest.b.scheduledFor}` : "Current",
      followUp: latest.outcome === "NO DRIVER",
    };
  }).sort((a, b) => b.lastAt - a.lastAt);
}

async function main() {
  const [, , keyPathArg, ...flagArgs] = process.argv;
  if (!keyPathArg) { console.error("Usage: node listCustomerBookingAttempts.js <serviceAccountKey.json> [--days N] [--followup] [--csv]"); process.exit(1); }
  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPathArg))) });
  const db = admin.firestore();
  const di = flagArgs.indexOf("--days");
  const days = di >= 0 ? Number(flagArgs[di + 1]) : 0;
  const sinceMs = days > 0 ? Date.now() - days * 86400000 : 0;
  const [bSnap, cSnap] = await Promise.all([db.collection("bookings").get(), db.collection("customers").get()]);
  const bookings = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const customers = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let rows = summarize(bookings, customers, sinceMs);
  if (flagArgs.includes("--followup")) rows = rows.filter((r) => r.followUp);
  if (flagArgs.includes("--csv")) {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    console.log(["Name", "Phone", "Requests", "No driver", "Cancelled", "Ongoing", "Completed", "Last request", "Last outcome", "Last route", "Last fare", "Type", "Follow-up"].join(","));
    rows.forEach((r) => console.log([r.name, r.mobile, r.tried, r.noDriver, r.cancelled, r.ongoing, r.completed, when(r.lastAt), r.lastOutcome, r.lastRoute, r.lastFare, r.lastWhen, r.followUp ? "YES" : "no"].map(esc).join(",")));
    return;
  }
  console.log(`Customers who pressed Book${days ? ` in the last ${days} day(s)` : ""}${flagArgs.includes("--followup") ? " (follow-up only)" : ""}: ${rows.length}`);
  console.log(`  of them, latest request had NO DRIVER: ${rows.filter((r) => r.followUp).length}\n`);
  rows.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(3)}. ${r.name || "(no name)"}  |  ${r.mobile}  |  requests ${r.tried} (no driver ${r.noDriver}, cancelled ${r.cancelled}, ongoing ${r.ongoing}, completed ${r.completed})  |  last: ${when(r.lastAt)} ${r.lastOutcome}${r.followUp ? "  <-- FOLLOW UP" : ""}`);
    console.log(`       ${r.lastRoute}  |  ₹${r.lastFare ?? "-"}  |  ${r.lastWhen}`);
  });
}

module.exports = { summarize, outcomeOf };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
