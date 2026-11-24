// In-app helper: the approved facts the assistant may answer from (owner 2026-11-24: "an AI agent inside the app to answer all the app related queries, FAQs").
// EDIT THIS FILE to change what the helper knows. It answers ONLY from these lines; anything else it hands over to a person. Keep every line a true statement about the app as it works TODAY.
// Plain English on purpose -- the helper translates into the user's own language (Hindi / Marathi / English).

const COMMON = `
ABOUT THE APP
- Apna Transport connects customers who need to move goods with truck / vehicle owners and drivers ("Partners"). Service area for pickups: Pune. Drop can be anywhere in India.
- Login is by mobile number + an SMS OTP. There is no PIN. After logging in once, the user stays logged in until they tap Logout themselves.
- The OTP comes by SMS to the number entered. If it does not arrive: check the number is right, check the phone has network, wait a minute, then ask for the OTP again. Never share an OTP with anyone who calls or messages.
- One mobile number can be a Customer OR a Partner (driver), not both.
- The app language is the one chosen at sign-up. It can be changed from the app's language setting.
- For anything the helper cannot answer, the user can tap "Talk to a person" (call or WhatsApp to the Apna Transport support team).
`;

const CUSTOMER = `
CUSTOMER: HOW TO BOOK
1. Type the Pickup place (or tap "Use Current Location"). Pickup is accepted only inside Pune for now; outside Pune the app shows "Currently unavailable here".
2. Type the Drop place. Drop can be anywhere in India.
3. Pickup and Drop must be a specific place -- an area, landmark, building or street -- not just a city name like "Pune, India".
4. For an Advance booking, switch to "Advance Booking" at the top and choose Tomorrow, Day after tomorrow or In 3 days. Advance trips start at 8:00 in the morning.
5. The list of vehicles is shown below. It stays greyed out until Pickup and Drop (and the day, for Advance) are filled in.
6. Tap the vehicle type you want, then press "Select vehicle". The next screen shows the vehicle, the fare and the distance. Press "Confirm booking" to send the request.
7. Nearby drivers of that vehicle type get a ringing alert. The first driver who accepts gets the trip. You then see the driver and vehicle details.

CUSTOMER: FARE AND PAYMENT
- The fare shown on the vehicle list is the fare for the trip. The same fare is shown to the driver and in the history. It is based on the road distance and the vehicle type.
- Halting / waiting charges, if any, are shown as separate lines on the final bill.
- The app does not take any payment at the time of booking.
- Round trip: tick the "Book Round trip" box before entering Pickup. The fare shown is the one-way fare plus the return fare, with a return discount.

CUSTOMER: DURING THE TRIP
- When a driver accepts, the customer sees a pickup OTP on the ride screen. Give this OTP to the driver at pickup; the driver enters it to start the trip. Do not share it earlier.
- The ride screen shows the driver on a map once the trip is running.
- Ride History shows earlier trips.

CUSTOMER: COMMON PROBLEMS
- No vehicles in the list / "no driver": for an instant booking the app shows vehicles that are within about 15 km of the pickup point and on duty. Advance bookings look within about 50 km. Try a different vehicle type or an Advance booking, or call support.
- Pickup suggestions not showing: type more letters of the place name, or pick one of the suggestions; the suggestion list scrolls.
- Wrong place chosen: tap "Change pickup / drop".
- If the customer cannot fill Pickup / Drop, the "Call us" button on the booking screen reaches Apna Transport, who can book on their behalf.
`;

const DRIVER = `
PARTNER (DRIVER / VEHICLE OWNER): GETTING STARTED
- Sign up with name, mobile number and the SMS OTP, then fill the documents form: driver photo, driving licence photo, vehicle (pick it from the "Select vehicle" list), vehicle registration number in the form AB12AB1234, and a vehicle side photo, and tick the responsibility box. Every item is mandatory. The account is created only when the whole form is complete and "Create Account" is tapped.
- Until the KYC (documents) is complete, the app shows a red "Incomplete KYC" row with a Fill button, and loads cannot be accepted.
- Admin checks the documents. KYC status can be Pending, Approved or Rejected. A rejected driver can correct the documents and submit again.
- The vehicle weight is set automatically from the vehicle chosen in the list.

PARTNER: GETTING LOADS
- Turn the Duty switch ON on the home screen to receive loads. With duty off, no loads ring.
- Loads ring on the phone for drivers whose vehicle type matches and who are within about 15 km of the pickup (for instant bookings; about 50 km for Advance bookings). If nobody accepts, the alert widens to the next vehicle types.
- Keep the location (GPS) permission and notifications allowed, and the battery / autostart settings as the app asks, otherwise the alert may not ring when the app is closed. The app shows a checklist of missing permissions.
- Accept or Reject on the load card or on the ring screen. The first driver to Accept gets the trip; the others stop ringing.
- A driver who is already on a trip is not rung for another trip that overlaps.
- After accepting: go to the pickup, get the OTP from the customer, enter it in the app to start the trip, and tap End Trip at the end.
- For a Round trip the driver taps "Reached drop - start return" at the drop, then End Trip when back at the pickup.

PARTNER: OTHER FEATURES
- Set Fare (home screen): lets the driver enter his own rate for a route.
- My Wallet shows wallet balance. For recharge, withdrawal or bonus questions the helper cannot give amounts -- send the user to support.
- Add new vehicle (Profile): a driver who owns more than one vehicle can add vehicles there and then manage them as an owner (My Fleet); each vehicle needs its documents and Admin approval.
- A driver can be logged in on one phone at a time; logging in on a new phone logs out the old one.
- WhatsApp Support is on the home screen.
`;

const KNOWLEDGE = { common: COMMON, customer: CUSTOMER, driver: DRIVER };

module.exports = { KNOWLEDGE };
