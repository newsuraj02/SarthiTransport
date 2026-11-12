// ADMIN BOOKS ON BEHALF OF A CUSTOMER (owner 2026-11-12: "add a book button and call button to personally call the driver from Admin, and if they accept it on the
// call then we book on behalf of the customer -- but the customer has to pay for themselves").
//
// Admin phones a driver; if the driver agrees, Admin presses Book and the trip is created ALREADY ASSIGNED to that driver (status Ongoing, driver + vehicle filled in,
// pickup OTP made, exactly what a driver's own Accept produces) -- nobody else is rung. The customer pays the driver directly, as on every other trip: nothing is
// charged to Admin / Apna Transport, and the booking is marked `adminBooked` + `paymentBy: "customer"` so every screen can say so.
//
// Also (owner 2026-11-12, second step): a ROUND TRIP (fare = one-way + return, the customer's own rule) and a TRANSPORTER's vehicle (a fleet booking: the trip belongs to the
// owner's account, the vehicle's driver -- who has no app -- gets the trip on WhatsApp).
//
// This file holds only the pure decisions (validation, who may be booked, the document shape) so they can be tested without Firebase. The callable that uses them is
// `adminBookForCustomer` in functions/index.js (Admin SDK: it writes the booking and the OTP itself, so firestore.rules need no change).

const MAX_FARE = 1000000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function cleanMobile(v) {
  const s = String(v == null ? "" : v).replace(/\D/g, "");
  return s.length === 10 ? s : "";
}

// "YYYY-MM-DD HH:MM" (what the app's Advance bookings carry) or nothing.
function validScheduledFor(v) {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) return { ok: false };
  const d = new Date(v.replace(" ", "T") + ":00");
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: v };
}

// -> { ok: true, v } | { ok: false, reason, message }
function validateAdminBookingInput(data) {
  const d = data || {};
  const customerMobile = cleanMobile(d.customerMobile);
  if (!customerMobile) return { ok: false, reason: "customer_mobile", message: "A 10-digit customer mobile number is required." };
  const fleetVehicleId = text(d.fleetVehicleId, 120) || null;
  const driverMobile = cleanMobile(d.driverMobile);
  if (!fleetVehicleId && !driverMobile) return { ok: false, reason: "driver_mobile", message: "Choose the driver who agreed on the call." };
  if (driverMobile && driverMobile === customerMobile) return { ok: false, reason: "same_number", message: "The customer and the driver cannot be the same number." };
  const customerName = text(d.customerName, 60);
  if (customerName.length < 2 || /^[\d\s]+$/.test(customerName)) return { ok: false, reason: "customer_name", message: "Enter the customer's name (letters only)." };
  const pickup = text(d.pickup, 300), drop = text(d.drop, 300);
  if (!pickup || !drop) return { ok: false, reason: "places", message: "Pickup and Drop are both required." };
  if (![d.pickupLat, d.pickupLng, d.dropLat, d.dropLng].every(isNum)) return { ok: false, reason: "coords", message: "Pick the Pickup and Drop from the suggestions so their places are known." };
  if (!isNum(d.fare) || d.fare <= 0 || d.fare > MAX_FARE) return { ok: false, reason: "fare", message: "The fare is missing." };
  if (!isNum(d.tierMaxKg) || d.tierMaxKg <= 0) return { ok: false, reason: "category", message: "Choose the vehicle category." };
  if (!isNum(d.listCategoryKg) || d.listCategoryKg <= 0) return { ok: false, reason: "category", message: "Choose the vehicle category." };
  if (!isNum(d.distance) || d.distance < 0) return { ok: false, reason: "distance", message: "The distance is missing." };
  const sched = validScheduledFor(d.scheduledFor);
  if (!sched.ok) return { ok: false, reason: "schedule", message: "The Advance date is not valid." };
  // ROUND TRIP: the booking's `fare` is the TOTAL = one-way + return (the customer's own rule), so the three numbers must agree.
  const returnTrip = d.returnTrip === true;
  let oneWayFare = null, returnFare = null, returnPct = null;
  if (returnTrip) {
    if (!isNum(d.oneWayFare) || d.oneWayFare <= 0 || !isNum(d.returnFare) || d.returnFare <= 0) return { ok: false, reason: "fare", message: "The Round trip fare is missing." };
    if (!isNum(d.returnPct) || d.returnPct < 0 || d.returnPct > 100) return { ok: false, reason: "fare", message: "The return discount is not valid." };
    oneWayFare = Math.round(d.oneWayFare); returnFare = Math.round(d.returnFare); returnPct = d.returnPct;
    if (Math.abs(Math.round(d.fare) - (oneWayFare + returnFare)) > 1) return { ok: false, reason: "fare", message: "The Round trip fare does not add up." };
  }
  return {
    ok: true,
    v: {
      customerMobile, customerName, driverMobile, fleetVehicleId, pickup, drop,
      pickupLat: d.pickupLat, pickupLng: d.pickupLng, dropLat: d.dropLat, dropLng: d.dropLng,
      pickupPlaceId: text(d.pickupPlaceId, 200) || null, dropPlaceId: text(d.dropPlaceId, 200) || null,
      placeLang: ["en", "hi", "mr"].includes(d.placeLang) ? d.placeLang : "en",
      fare: Math.round(d.fare), tierMaxKg: d.tierMaxKg,
      listCategory: isNum(d.listCategory) ? d.listCategory : null, listCategoryKg: d.listCategoryKg,
      distance: d.distance, scheduledFor: sched.value,
      returnTrip, oneWayFare, returnFare, returnPct,
    },
  };
}

// The driver must be someone Admin can really put a trip on: Approved, not blocked, has a vehicle, not a transporter (a transporter's trip needs a vehicle picked
// from his fleet -- that stays in his own app), and not already on a trip that clashes. `conflict` = whether the driver's own running trips clash with this one
// (the caller works that out with the same availability rule the ring uses). Returns a reason code or null.
function driverBlockReason(driver, conflict) {
  if (!driver) return "driver_not_found";
  if (driver.kyc !== "Approved") return "driver_not_approved";
  if (driver.blacklisted) return "driver_blocked";
  if (driver.fleetOwner) return "driver_is_transporter";
  if (!driver.vehicleSpec || !(Number(driver.vehicleSpec.capacityKg) > 0)) return "driver_no_vehicle";
  if (conflict) return "driver_busy";
  return null;
}

// A transporter's vehicle (owner 2026-11-12): the vehicle must be Approved + active with a capacity and driver details, its OWNER must be an Approved, unblocked transporter,
// and the VEHICLE (not the owner -- he may have several) must not be on a clashing trip. Returns a reason code or null.
function fleetBlockReason(vehicle, priv, owner, conflict) {
  if (!vehicle) return "vehicle_not_found";
  if (vehicle.kyc !== "Approved") return "vehicle_not_approved";
  if (vehicle.active === false) return "vehicle_inactive";
  if (!(Number(vehicle.capacityKg) > 0)) return "driver_no_vehicle";
  if (!priv || !String(priv.driverName || "").trim()) return "vehicle_no_driver_details";
  if (!owner) return "driver_not_found";
  if (owner.kyc !== "Approved") return "driver_not_approved";
  if (owner.blacklisted) return "driver_blocked";
  if (!owner.fleetOwner) return "owner_not_transporter";
  if (conflict) return "driver_busy";
  return null;
}

// The booking document -- the same shape the customer app writes for a request (requestByCategory) after the driver's Accept (driverRespondBooking). `stamp` is the
// server timestamp value (FieldValue.serverTimestamp() in the callable, a plain stand-in in tests).
function buildAdminBookingDoc(v, driver, stamp, fleet = null) {
  return {
    pickup: v.pickup, drop: v.drop,
    vehicle: fleet ? (fleet.vehicleName || "fleet") : ((driver.vehicleSpec && driver.vehicleSpec.type) || null),
    tierMaxKg: v.tierMaxKg,
    ...(v.listCategory != null ? { listCategory: v.listCategory } : {}),
    listCategoryKg: v.listCategoryKg,
    weight: v.listCategoryKg, weightIsCapacity: true,
    distance: v.distance, status: "Ongoing", bids: [], fare: v.fare,
    pendingDriverName: null, pendingDriverMobile: null, pendingBidId: null,
    hours: 0, extraHourRate: 0, acceptedAt: stamp, createdAt: stamp,
    declinedBy: [],
    // A transporter's vehicle: the trip is the OWNER's (his phone, wallet, OTP, End Trip); driverName is the real driver's, and the fleet* fields say which vehicle
    // (exactly what the owner's own Accept -> "Which vehicle?" writes, App.jsx fleetClaimWithVehicle).
    driverName: fleet ? fleet.driverName : (driver.name || ""), driverMobile: fleet ? fleet.ownerMobile : v.driverMobile, progress: 0,
    scheduledFor: v.scheduledFor || null,
    returnTrip: !!v.returnTrip, ...(v.returnTrip ? { oneWayFare: v.oneWayFare, returnFare: v.returnFare, returnPct: v.returnPct } : {}),
    ...(fleet ? { fleetBooking: true, fleetVehicleId: fleet.vehicleId, fleetDriverName: fleet.driverName, fleetDriverMobile: fleet.driverMobile || null, fleetVehicleNumber: fleet.vehicleNumber || null, ownerName: fleet.ownerName || "" } : {}),
    customerMobile: v.customerMobile, customerName: v.customerName,
    pickupLat: v.pickupLat, pickupLng: v.pickupLng, dropLat: v.dropLat, dropLng: v.dropLng,
    pickupPlaceId: v.pickupPlaceId, dropPlaceId: v.dropPlaceId, placeLang: v.placeLang,
    driverLocation: null,
    // Booked by Admin after a phone call with the driver. The customer pays the driver directly (cash / UPI, as on every trip) -- nothing is charged to Admin.
    adminBooked: true, paymentBy: "customer", adminBookedAt: stamp,
  };
}

module.exports = { validateAdminBookingInput, driverBlockReason, fleetBlockReason, buildAdminBookingDoc, cleanMobile, MAX_FARE };
