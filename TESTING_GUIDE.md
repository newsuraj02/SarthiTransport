# अपना ट्रांसपोर्ट — Pilot Testing Guide (10-15 users)

Send everyone the deployed URL (see `DEPLOYMENT.md`). Everyone shares the same live backend — a customer's posted load, a driver's quote, and admin's approvals all show up on each other's screens in real time.

## Suggested role split

- **1 person — Admin.** Usually whoever is running the pilot. Logs in via "एडमिन लॉगिन" with password `admin123`.
- **~6-7 people — Drivers.**
- **~6-7 people — Customers.**

A few people can try both roles from the same device — the app remembers each phone number's role separately.

## ⚠️ One important rule for this pilot

**Every driver must use a distinct real name** during KYC (e.g. "Ramesh Patel", not just "Driver" or "Test"). Internally, a driver's active trip is currently matched by their *name*, not phone number — two drivers with the same name would see each other's trips. This is a known shortcut for a short trusted pilot (see `README.md`); a real launch would need to fix this properly.

## Driver script

1. Open the link → **ड्राइवर**.
2. Enter your real mobile number → wait for the SMS → enter the 6-digit OTP you receive.
3. Fill the KYC form: **your real name**, a vehicle type, a vehicle number (anything, e.g. `MH14AB1234`). Document photo uploads are optional for this pilot — you can skip them and still submit.
4. You'll land on a "KYC pending" screen. **Ping the admin** — they need to approve you from their KYC desk before you can see loads. This should happen within a minute or two if the admin is watching.
5. Once approved, reload the page. You'll see your home screen with an online/offline toggle.
6. Go **online**. Wait for a customer to post a load matching your vehicle type — you'll get a beep + banner the instant one appears.
7. Open it, enter your quote (fare, allowed hours, waiting rate/hr), send it.
8. If a customer accepts your quote, you'll see "ट्रिप जारी है" (trip in progress) with the customer's phone number.
9. Ask the customer for their 4-digit pickup OTP, enter it — the loading timer starts.
10. Try the "+1 hour" test button a couple of times to see the overtime/waiting-charge alert kick in.
11. Tap "End Trip" to complete it. Check your wallet — commission should be deducted (or not, if the admin has trial mode on).
12. Try requesting a wallet recharge and a bonus withdrawal — both should show as "pending admin approval" until the admin approves them.

## Customer script

1. Open the link → **कस्टमर**.
2. Mobile number → wait for the SMS → enter the 6-digit OTP → fill your name/address once (remembered after that — you stay logged in on this device until you log out).
3. Tap "तुरंत गाड़ी चाहिए" (need a vehicle now), fill pickup/drop/material/weight, post it.
4. Go to "मेरी राइड्स" (My Rides) and wait — quotes from online drivers should start appearing within a few seconds, cheapest first.
5. Accept a quote. You'll get a 4-digit OTP — read it out to the driver when they arrive.
6. Watch the trip progress bar move (simulated), then rate the driver and download the invoice once it's marked complete.
7. Try posting a load with material "प्लास्टिक" (plastic) or "बॉक्स / कार्टन" (box/carton) and a low weight — you should get a popup suggesting a bigger vehicle.
8. Try the hamburger menu → SOS/Helpline → file a test complaint, and confirm with the admin that it shows up on their Alerts tab.

## Admin script (the organizer)

1. Log in with `admin123`.
2. **KYC Desk** — approve/reject drivers as they submit (check this often near the start, since drivers are blocked until you approve them).
3. **Live Dashboard** — watch the booked-today and online-driver counts move as testers act.
4. **Driver List** — search by name/vehicle number/mobile, try blocking and unblocking a driver.
5. **System Settings** — toggle trial mode off to see real commission/bonus percentages kick in; note the "days left" countdown.
6. **Reports** — download the CSV commission report once a few trips complete.
7. **Notify** — send a test message to all drivers.
8. **Alerts** — approve wallet recharge and bonus withdrawal requests as they come in; review any SOS/complaint alerts.

## What to watch for / report back

- Anything that doesn't show up on another tester's screen within ~10-15 seconds (real-time sync should be near-instant, but there can be a short lag).
- Anything you expected to be in English but showed up in Hindi (or vice versa) after toggling the EN/हिं button.
- Any step above that's confusing or where you got stuck.

## Known limitations for this pilot (not bugs)

- The map location-picker and the sample vehicle photo won't load if your network blocks OpenStreetMap/Google Maps — this doesn't affect anything else.
- Login OTP is a real SMS now (Firebase Phone Authentication) — make sure you enter a mobile number you actually have access to.
- The 60-day free-trial clock started the first time anyone opened the deployed app, and is shared by everyone (see admin settings for days left).
- Payments, KYC document storage, and the ₹200 referral reward are all simulated — nothing real is charged or paid out.
