# DLT SMS — PARKED, ready to switch on (owner 2026-11-25)

**To recall this: tell Claude "activate SMS" (or "continue the SMS setup"). Claude must read THIS file first, then follow the standing rule in CLAUDE.md
("BRUTAL HONESTY + FULL CONSEQUENCES BEFORE ANY PLAN") before touching anything.**

## 1. Where things stand (2026-11-25)
- Code: finished, pushed, 239 invariants pass. Tested ONLY against a FAKE gateway (`scripts/serverTests/smsGateway.cjs`, `smsOtp.cjs`). **Never sent a real SMS.**
- Cloud Functions DEPLOYED (2026-11-25): `requestSmsOtp`, `verifySmsOtp`, `sendBulkDriverSms`, `sendTestSms`, `smsBookingConfirmed`, `smsNewLoad` are live. The old MSG91 functions
  (+ the two old PIN functions) were deleted. **Hosting + `firestore:rules` were still to be deployed after that — CONFIRM they were** (`firebase deploy --only hosting`, then
  `--only firestore:rules`; without them Admin still calls the deleted WhatsApp function and the SMS card cannot save).
- Gateway login = Firebase secrets `SMS_API_USER` / `SMS_API_PASSWORD`, currently the PLACEHOLDER `not-set-yet`. No SMS can go out.
- Admin -> Settings -> "SMS (DLT)" card: prefilled, NOT saved yet. The OTP switch is OFF and LOCKED until a test OTP SMS succeeds.
- Login keeps using the Firebase OTP. A failed / disabled SMS never blocks login, a booking or the ring.
- MSG91: removed from the code (owner terminated the plan). The frozen ring function still LISTS four inert MSG91 secrets (`MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`,
  `MSG91_DIRECT_REQUEST_TEMPLATE`, `MSG91_WHATSAPP_NAMESPACE`) — they must stay in Secret Manager or functions deploys fail.

## 2. The registered DLT data (Airtel DLT portal, entity APNA TRANSPORT)
- Entity ID (RegistrationId): `1001728310189530441`   Header: `APTRNS` (header ID 1005077324585170581, not used by the API)
- OTP_LOGIN_V3 — `1077167510003843516` — Transactional — `{#numeric#} is your OTP for Apna Transport. Do not share it with anyone. Valid for 10 minutes.`
- DRIVER_KYC_REMINDER_V2 — `1077200630014989738` — Service Implicit — `Dear {#alphanumeric#}, your Apna Transport KYC is incomplete. Complete it in the app to start getting loads.`
- BOOKING_CONFIRMED_V2 — `1077397930014615345` — Service Implicit — `Your Apna Transport booking is confirmed. Driver {#alphanumeric#} and vehicle {#alphanumeric#}. Open the app to track your trip.`
- DRIVER_NEW_LOAD_V2 — `1077583850014046823` — Service Implicit — `New load on Apna Transport: pickup {#alphanumeric#}, drop {#alphanumeric#}. Open the app to accept.`
- The DLT portal showed 5 REJECTED templates (reasons not read yet) and Credits 5,000 total / 5,000 consumed / balance 0 (what those credits are: UNKNOWN).

## 3. The open blocker — a SENDING account (DLT alone cannot send SMS)
The owner asked Airtel Business support, in writing, on 2026-11-25. Questions: (1) is a separate prepaid recharge needed for Airtel IQ SMS? (2) can the DLT portal credits be
used? (3) how do we get the API username / password (or key)? (4) price per SMS + minimum recharge. **Waiting for the reply.** Until it comes nothing below can start.
If Airtel is a dead end (vague answer, "contact your account manager", long wait): another provider with online sign-up (Fast2SMS was suggested; its DLT route and API-key login are
different from the Airtel adapter — `buildRequest` / `judgeGatewayReply` in `functions/smsGateway.js` and the login style would be changed). The owner said "I won't do this" to a new provider on
2026-11-25 — do NOT push another provider; only offer it again if Airtel fails.

## 4. Activation procedure (do in this order; each step can fail — see the right-hand column)
| # | Step | Who | What can go wrong |
|---|---|---|---|
| 1 | Read Airtel's written reply; check: recharge amount / price per SMS / API login type / DLT linking / time. | owner + Claude | Reply may need an executive, a contract, a minimum recharge, or give an API KEY instead of user + password (then the login style in `buildRequest` / the two secrets must change). |
| 2 | Owner sends Claude a SCREENSHOT of Airtel's API doc (never the password). Claude checks the request format in `functions/smsGateway.js` `buildRequest` / `judgeGatewayReply` (currently a GUESS from Airtel IQ's public listing: POST `https://iqsms.airtel.in/api/v1/send-prepaid-sms`, Basic login, JSON `{customerId, destinationAddress:["91…"], message, sourceAddress, messageType, dltTemplateId, entityId}`) and fixes it BEFORE any money is spent. | Claude | Field names / URL / auth may differ -> a small edit + redeploy functions. |
| 3 | Ensure the DLT entity + header + 4 templates are linked to the sending account (Airtel / provider side). Telemarketer chain binding on the DLT portal may be required (unknown for Airtel). | owner | Messages blocked / "template not found" until linked. |
| 4 | Recharge the sending account. | owner | Balance 0 = every SMS fails. |
| 5 | `firebase functions:secrets:set SMS_API_USER` and `SMS_API_PASSWORD` with the REAL values, THEN `firebase deploy --only functions` (a changed secret is only picked up by a new deploy). Answer N to any prompt about deleting functions you do not recognise; the four MSG91 secrets must NOT be deleted. | owner | Forgetting the redeploy = the functions still use `not-set-yet`. Secrets are never pasted in chat. |
| 6 | Admin -> Settings -> "SMS (DLT)": check the prefilled Entity ID / header / template IDs / texts (the ✓ under each box), add the gateway customer ID if the gateway gave one, press Save. | owner | A text that differs by one character from the registered template is rejected by scrubbing. |
| 7 | Press "Send test SMS" on each of the 4 messages (own mobile). A failure prints the gateway's own reply: send it to Claude. | owner + Claude | Wrong field / unlinked template / no balance / non-whitelisted wording. |
| 8 | Only after the test OTP SMS arrived, the OTP switch unlocks: tick it, Save, log in on a second phone. | owner | If the SMS ever fails people still get the Firebase OTP. |
| 9 | Watch the first day: Cloud Functions logs for `[smsNewLoad]`, `[smsBookingConfirmed]`, `[requestSmsOtp]` errors; the SMS balance. | owner + Claude | Cost climbs fast (see below). |

## 5. What the SMS does once active
OTP at login / sign-up (only with the switch on); "booking confirmed" to the customer when a driver accepts (also Admin-booked and fleet trips — UNTESTED live); "new load" to every driver the ring
chose (each once per booking, later escalation rounds add drivers); KYC reminder only when Admin presses the button. Nothing for cancelled / completed trips, fares, wallet or the pickup OTP.
Hindi / Marathi names and addresses cannot go into `{#alphanumeric#}` slots, so they become plain words ("Dear Driver", "the pickup point").

## 6. Costs, limits and risks to remember
- Every SMS is paid. New load = one SMS per ring target per booking (30 drivers x 100 bookings a day = 3,000 SMS a day). Each message has an "On" box in the Admin card: switch "New load" off first if cost hurts.
- OTP limits: 30 s between texts, 5 / hour / number, 20 / hour / device address, 3,000 / day total (`dailyOtpCap`), 5 wrong guesses burn a code, 10 min lifetime, single use.
- While parked: `smsNewLoad` / `smsBookingConfirmed` still RUN on booking updates (they stop at "not configured") — a tiny, unmeasured invocation cost.
- The Admin bulk buttons for reinstall / GPS off / off duty have no template and answer "no DLT template"; only the KYC reminder is SMS.
- No delivery receipts: Admin shows one tick = "gateway accepted", or a red ! with the reason on hover / tap.
- UNTESTED on a real gateway and real phones — expect the first test SMS to need one fix.

## 7. Rollback / switch off (no code change)
Admin -> SMS (DLT): untick the OTP switch, untick "On" on any message, Save. Or leave the Template IDs empty. Login falls back to Firebase at once.

## 8. Pointers
Contract N57 (`docs/SYSTEM_CONTRACTS.md`), CLAUDE.md "DLT SMS + MSG91 REMOVED", invariants "DLT SMS GATEWAY + TEMPLATES", "DLT SMS OTP, BOOKING CONFIRMED, NEW LOAD",
"ADMIN SETTINGS -> SMS (DLT) CARD", "NO MORE MSG91 CONNECTION"; code `functions/smsGateway.js`, `smsOtp.js`, `smsEvents.js`, `smsFunctions.js`, `src/AdminSmsSettings.jsx`, `src/phoneOtp.js`.
