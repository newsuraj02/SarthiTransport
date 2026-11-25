/**
 * DELETING A RIDE REMOVES IT EVERYWHERE (owner 2026-11-25: "ride history is deleted but it still shows some rides in the Earnings section ... deleting the ride doesn't mean
 * only the entry, it must be removed from everywhere").
 *
 * A ride is one `bookings` document, and every screen that lists rides (Customer Ride History, Driver Trip History, Admin Bookings, Earnings / commission totals, the
 * finance chart, the invoice) reads that one document -- so deleting it clears all of them. What can be left behind are the things that hang off it, and those go with it:
 *   - `bookingOtps/{id}`        the pickup OTP
 *   - `bookingExtras`           extra charges / requests on the trip (field bookingId)
 *   - `ringDeliveries`          the ring receipts (field bookingId)
 *   - Storage `bookings/{id}/`  the uploaded bill / e-way bill / invoice documents
 *   - `customerFlow`            (only when EVERY ride is wiped) the customer-activity tries that ended "Booked"
 * Children go first and the booking document LAST, so a failed run leaves the booking visible and the Admin can simply run it again.
 *
 * modes:  "all"       every booking of every status (open requests and running trips included)
 *         "finished"  only Completed / Cancelled -- the given ids if any (re-checked against the stored status), otherwise every finished booking
 * Admin SDK based (db = Firestore, bucket = Storage bucket), so it also reaches bookings the Admin app's own list cannot show (no createdAt).
 */
const FINISHED = ["Completed", "Cancelled"];
const CHUNK = 400;

async function deleteBookingsCascade({ db, bucket, mode, ids }) {
  if (mode !== "all" && mode !== "finished") throw new Error("mode must be 'all' or 'finished'");
  // 1. which bookings
  let targets = [];
  if (mode === "all") {
    targets = (await db.collection("bookings").get()).docs.map((d) => d.id);
  } else if (Array.isArray(ids)) { // an explicit list (even an empty one means "nothing"), never "everything"
    for (const id of [...new Set(ids.map(String))].slice(0, 5000)) {
      const s = await db.collection("bookings").doc(id).get();
      if (s.exists && FINISHED.includes(String(s.data().status || ""))) targets.push(id);
    }
  } else {
    const [a, b] = await Promise.all(FINISHED.map((st) => db.collection("bookings").where("status", "==", st).get()));
    targets = [...a.docs, ...b.docs].map((d) => d.id);
  }
  if (!targets.length) return { deleted: 0, extras: 0, rings: 0, files: 0, activity: 0 };
  const set = new Set(targets);

  // 2. the things that hang off them
  let extras = 0, rings = 0, files = 0, activity = 0;
  const delRefs = async (refs) => { for (let i = 0; i < refs.length; i += CHUNK) { const batch = db.batch(); refs.slice(i, i + CHUNK).forEach((r) => batch.delete(r)); await batch.commit(); } };
  await delRefs(targets.map((id) => db.collection("bookingOtps").doc(id)));
  const ex = (await db.collection("bookingExtras").get()).docs.filter((d) => set.has(String(d.data().bookingId)));
  await delRefs(ex.map((d) => d.ref)); extras = ex.length;
  const rg = (await db.collection("ringDeliveries").get()).docs.filter((d) => set.has(String(d.data().bookingId)));
  await delRefs(rg.map((d) => d.ref)); rings = rg.length;
  if (bucket) {
    if (mode === "all") { try { await bucket.deleteFiles({ prefix: "bookings/", force: true }); files = -1; } catch (e) { console.error("[rideDelete] storage", e.message); } }
    else for (const id of targets) { try { await bucket.deleteFiles({ prefix: `bookings/${id}/`, force: true }); files += 1; } catch (e) { console.error("[rideDelete] storage", id, e.message); } }
  }
  if (mode === "all") {
    const fl = (await db.collection("customerFlow").where("booked", "==", true).get()).docs;
    await delRefs(fl.map((d) => d.ref)); activity = fl.length;
  }

  // 3. the bookings themselves, last
  await delRefs(targets.map((id) => db.collection("bookings").doc(id)));
  return { deleted: targets.length, extras, rings, files, activity };
}

module.exports = { deleteBookingsCascade, FINISHED };
