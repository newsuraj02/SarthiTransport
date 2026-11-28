// ADMIN SEES THE PICKUP OTP OF A TRIP IT BOOKED / RANG (owner 2026-11-28: "for the customer who doesn't exist in the customer list, where did he get the OTP to start the ride ... a dead end").
// The pickup OTP (bookingOtps/{id}, made by the server) is readable only by the customer's OWN app (firestore.rules) -- a customer Admin booked for who has no account / no app could never
// tell the driver the code, so the ride could not start. Admin may read it (the rules always allowed that), so the code is now shown here: Admin tells the customer on the phone, the customer
// tells the driver, or Admin tells the driver. Shown only while the pickup OTP is still needed (Ongoing, loading not started) and only for a trip Admin made (`adminBooked`).
import React, { useEffect, useState } from "react";
import { subscribeDoc } from "./firestoreStore";

const T = (lang, en, hi, mr) => (lang === "en" ? en : lang === "mr" ? (mr || hi) : hi);

// pure: does this booking still need its pickup OTP shown to Admin?
export function needsAdminPickupOtp(b) {
  return !!b && b.adminBooked === true && b.status === "Ongoing" && !b.loadingStartedAt;
}

export default function AdminPickupOtp({ bookingId, lang = "en" }) {
  const [otp, setOtp] = useState(null);
  useEffect(() => {
    if (!bookingId) return undefined;
    return subscribeDoc("bookingOtps", bookingId, (d) => setOtp(d && d.otp ? String(d.otp) : null));
  }, [bookingId]);
  return (
    <div data-admin-pickup-otp={bookingId} className="mt-2 rounded-lg px-3 py-2 text-center" style={{ background: "#FFF8E1", border: "1px solid #E8A317" }}>
      <div className="text-[11px] font-bold" style={{ color: "#8A5A00" }}>{T(lang, "Pickup OTP — the driver needs this to start the ride", "पिकअप OTP — राइड शुरू करने के लिए ड्राइवर को यह चाहिए", "पिकअप OTP — राइड सुरू करण्यासाठी ड्रायव्हरला हा हवा")}</div>
      <div data-admin-pickup-otp-code className="text-2xl font-black tracking-[0.3em]" style={{ color: "#0F1B2D" }}>{otp || "····"}</div>
      <div className="text-[10px]" style={{ color: "#475569" }}>{T(lang, "Tell the customer (or the driver) on the phone. The customer may not have the app.", "फ़ोन पर ग्राहक (या ड्राइवर) को बताएँ। ग्राहक के पास ऐप नहीं हो सकता।", "फोनवर ग्राहकाला (किंवा ड्रायव्हरला) सांगा. ग्राहकाकडे अ‍ॅप नसू शकते.")}</div>
    </div>
  );
}
