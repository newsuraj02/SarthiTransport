// In-app helper: the approved facts the assistant may answer from (owner 2026-11-24: "an AI agent inside the app to answer all the app related queries, FAQs";
// owner 2026-11-24 later: "improve the knowledge base ... add all the knowledge you have of the app, formal with users and spot on").
// EDIT THIS FILE to change what it knows. It answers ONLY from these lines; anything else it hands over to a person. Keep every line a true statement about the app as it works TODAY
// (when a rule changes in the app -- radius, categories, flow -- change the matching line here in the same commit).
// Plain English on purpose -- the helper translates into the user's own language (Hindi / Marathi / English).
// Layout: COMMON = both apps; CUSTOMER = customer app only; DRIVER = partner (driver / vehicle owner) app only. A customer never receives the DRIVER text and the reverse.

const COMMON = `
ABOUT APNA TRANSPORT
- Apna Transport is a goods-transport booking app for Pune. Customers book trucks and other goods vehicles; Partners (vehicle drivers and vehicle owners) receive the booking requests and carry the goods.
- The role-choice screen has two cards: "Customer / Grahak" (for people who need to send goods) and "Partner (Driver and Owner)" (for people who drive a truck or vehicle, or own vehicles).
- A mobile number can be registered as a Customer or as a Partner, not both. A number already registered in one role cannot sign up in the other.
- The app is available in English, Hindi and Marathi. The language chosen at sign-up is used throughout; it can be changed from the app's language option.
- The orange round button at the top right of the screen refreshes the app. If something looks outdated or stuck, tapping it reloads the app.
- The Android Back button goes back one step (for example from a sub-screen to the previous screen); on the main screen it minimises the app rather than closing it.

LOGIN AND ACCOUNT
- Sign-up and login use the mobile number and a one-time password (OTP) sent by SMS. There is no PIN.
- If the OTP does not arrive: confirm the mobile number is correct, confirm the phone has network coverage, wait about a minute, and request the OTP again. If it still does not arrive, contact the support team.
- A user who logs in stays logged in on that phone until they tap Logout. The OTP is asked again only after a Logout or on a new phone.
- Never share an OTP with anyone, including anyone who claims to be from Apna Transport. The helper itself never needs an OTP.
- Name boxes accept letters only; mobile number, OTP and amount boxes accept digits only.
- Account deletion is done by the Apna Transport team on request through support; the privacy policy states that deletion is completed within 7 days.
- A customer who has been blocked by Apna Transport sees a red notice and cannot book. A blocked partner is not given loads. In either case the person should contact support.

SERVICE AREA AND PLACES
- Pickup locations are accepted only inside Pune (the Pune area including Pimpri-Chinchwad, Hinjewadi, Hadapsar and Chakan). Outside Pune the app shows "Currently unavailable here".
- The Drop location can be anywhere in India.
- Pickup and Drop must be a specific place: an area, landmark, building or street. A city name alone (for example "Pune, India") is not accepted.
- Place suggestions appear as the user types and show the distance of each place; typing a few letters of the place name is enough. The suggestion list scrolls.

VEHICLE CATEGORIES (capacity limit and name, light to heavy)
- 500 kg: 3 wheeler. 700 kg: Mini truck. 1000 kg: Mini pickup. 1200 kg: Pickup. 1700 kg: Pickup 8ft. 2000 kg: Pickup 9ft. 2500 kg: 10ft truck. 4000 kg: 14ft truck. 7500 kg: 20ft container. 10000 kg: 6 wheeler. 20000 kg: 20 ton container. 25000 kg: 12/14 wheeler. 32000 kg: 16 wheeler. Above 32000 kg: 32t+ truck.
- A vehicle belongs to the category whose limit it fits (for example a 750 kg vehicle is in the 700 kg category; a 5000 kg vehicle is in the 4000 kg category). The maximum load Apna Transport handles is 35 tons (35000 kg).

SUPPORT AND SAFETY
- "Talk to a person" in this chat reaches the Apna Transport support team by phone call or WhatsApp.
- The Help (Helpline) screen offers Police Help, Emergency Call, WhatsApp Support and a Complaint form.
- For personal account matters, payments, refunds, cancellation charges, commission, compensation, insurance, GST or invoices beyond what the app shows, disputes, or the status of a particular trip, the helper does not have the information and refers the user to "Talk to a person".
`;

const CUSTOMER = `
CUSTOMER: BOOKING STEP BY STEP
- The top of the customer screen has two options: "Current Booking" (green, for immediate trips) and "Advance Booking" (blue, for a later date). The app always opens on Current Booking.
- Step 1 - Pickup: type the Pickup place and choose a suggestion, or tap "Use Current Location". Recent trips appear below the Pickup box and can be tapped to fill both places.
- Step 2 - Drop: type the Drop place and choose a suggestion.
- Step 3 (Advance only) - choose the day: Tomorrow, Day after tomorrow or In 3 days (in Hindi: कल, परसों, परसों के बाद; in Marathi: उद्या, परवा, परवा नंतर). Advance trips start at 8:00 in the morning. A vehicle category may need a minimum notice; if so the app asks for a later date.
- Step 4 - the vehicle list: it is shown below the boxes but stays greyed out until Pickup and Drop (and the day, for Advance) are filled in. Each row shows the vehicle category, its weight limit, the nearest vehicle's distance in minutes ("N min away") and the fare.
- Step 5 - tap the vehicle category, then press "Select vehicle" (Hindi: गाड़ी चुनें; Marathi: गाडी निवडा). The next screen shows the vehicle, the fare and the distance, with "Change vehicle" and "Change pickup / drop" options.
- Step 6 - press "Confirm booking". The request is sent to nearby drivers of that vehicle category and the screen says that the message has gone to drivers.
- The first driver who accepts gets the trip. The customer then sees the driver, the vehicle and a pickup OTP on the ride screen.
- If no suitable vehicle is near the Pickup, the app shows a note and "Confirm booking" stays disabled. Choosing another vehicle category or an Advance booking may help.
- If a customer cannot fill in Pickup or Drop, the row "Can't fill Pickup / Drop? Call us" with a Call button (Hindi: पिकअप / ड्रॉप नहीं भर पा रहे? फोन करें) reaches the Apna Transport team, who can book on the customer's behalf. For such a booking the customer pays the driver directly.

CUSTOMER: WHICH VEHICLES ARE SHOWN
- For an immediate (Current) booking the app lists vehicles whose last known location is within about 15 km of the Pickup. For an Advance booking the distance is about 50 km. Only vehicles that are on duty, approved by Apna Transport, not blocked and free for that time are shown.
- A vehicle that is already on a trip is not shown for an overlapping time. An Advance booking blocks a vehicle only for the trip's own time window, not for the whole day.
- If the phone's location is off, the app shows all vehicle categories without the "N min away" figure; allowing the phone's location permission gives better results.
- No vehicles in an area at a given moment is possible; trying again later, choosing another category, or booking in Advance can help.

CUSTOMER: FARE, DISTANCE AND PAYMENT
- The fare is fixed per vehicle category and route and is shown on the vehicle list before booking. The same fare is shown to the driver, in Ride History and on the bill. It depends on the road distance and the vehicle category and can change with the current diesel price and Apna Transport's market rate setting.
- The distance shown ("Distance: N km") is the road distance between Pickup and Drop and is the same on every screen.
- The app does not collect any payment at the time of booking. The fare is settled directly with the driver as shown on the final bill. For any payment dispute or question about how to pay, "Talk to a person".
- Waiting (halting) charges, if any, are shown as separate lines on the final bill. For a normal trip one day is included in a city trip; for an outstation trip the included days depend on the distance, and extra days are charged per day at the vehicle's per-day rate. A Round trip never carries a halting charge.

CUSTOMER: ROUND TRIP
- Tick the "Book Round trip" box at the bottom of the main screen before entering the Pickup. Once ticked it stays on until the booking is made or the form is cleared, and the same box unticks it.
- With Round trip, every fare shown is the one-way fare plus the return fare. The return fare carries a discount set by Apna Transport (or a saved return rate for that route). A green note "Return fare included" shows the saving.
- The driver takes the goods to the Drop, taps "Reached drop - start return", and ends the trip when back at the Pickup. There is one End Trip and no second OTP.

CUSTOMER: AFTER THE DRIVER ACCEPTS
- The ride screen shows the driver's name, the vehicle, the vehicle category and weight, and a map. Before the trip starts the map shows the driver coming to the Pickup; the distance to Pickup is shown.
- The pickup OTP is shown on the customer's ride screen. The customer gives this OTP to the driver at the Pickup point; the driver enters it to start the trip. It should not be given before the driver arrives.
- A "Call driver" button connects the customer to the driver; the call can be connected through Apna Transport so that numbers are not shared, and otherwise falls back to a normal phone call.
- For an Advance booking the driver arrives on the chosen day; Advance bookings are listed under "Advance (N)" at the top of the screen.
- Ride History lists earlier trips with the fare and distance, and a bill is available for completed trips.
- The booking screen mentions that a booking can be cancelled. If the customer cannot find how to cancel, "Talk to a person".

CUSTOMER: COMMON PROBLEMS
- "The vehicle list is greyed out": enter both Pickup and Drop first (and the day for Advance).
- "Pickup not accepted": the Pickup must be a specific place inside Pune; type an area or landmark and choose a suggestion.
- "I chose the wrong place": tap "Change pickup / drop".
- "No driver accepted": the request is sent first to drivers of the chosen category near the Pickup and, if nobody accepts, to the next larger vehicle categories after a couple of minutes. If still no driver, the customer may try another category, or call the support team. A request that no driver has accepted within one hour is removed automatically (Current and Advance, Round trip included); the customer is welcome to book again.
- "I cannot see the Round trip box": it is on the main screen before the cursor is placed in the Pickup box; once the Pickup has text it is hidden unless it was already ticked.
`;

const DRIVER = `
PARTNER: SIGN-UP AND DOCUMENTS (KYC)
- Sign-up: name, mobile number and the SMS OTP, then the documents form, then "Create Account". The account is created only when the whole form is complete.
- Every item of the documents form is mandatory: driver photo, driving licence photo, the vehicle (chosen from the "Select vehicle" list), the vehicle registration number, a vehicle side photo, and the tick box accepting responsibility for the documents.
- The vehicle registration number must be in the form AB12AB1234 (two letters, two digits, two letters, four digits). Only this form is accepted.
- The vehicle is chosen from the "Select vehicle" drop-down, where each option reads "Company Model - N kg". The vehicle weight is set automatically from the choice. If the vehicle is not in the list, the driver should contact support so it can be added.
- Photo boxes offer "Take Photo" (camera) or "Choose from Library" (gallery).
- After submission the documents are checked by Apna Transport. The status is Pending, Approved or Rejected. A rejected partner can correct the documents and submit again.
- Until the KYC is complete, a red row "Incomplete KYC. Kindly fill first to accept loads" with a Fill button appears under the top row of the home screen. A partner with incomplete KYC cannot accept loads; tapping Fill opens the form.
- New partner accounts start with a wallet credit of Rs 500.

PARTNER: HOME SCREEN AND DUTY
- The home screen shows the Duty switch, My Wallet and WhatsApp Support at the bottom, and the top row with the menu. The message "Loads available in Pune Hub" shows while the partner is available.
- The Duty switch must be ON to receive loads. With duty off no loads ring. Duty switches on again after a trip ends.
- A partner on a trip is not given another trip that overlaps it.
- One account can be logged in on one phone at a time. Logging in on a new phone logs the old phone out.
- Set Fare (home screen button) lets the partner enter his own rate for a route for his vehicle category, by kilometre or by ton, with a system suggestion shown.

PARTNER: HOW LOADS REACH A PARTNER
- A new booking rings the partners whose vehicle category is the one the customer chose, who are on duty, approved, not blocked, not on a trip, and whose last known location is within about 15 km of the Pickup (about 50 km for an Advance booking). The location may be old and the phone's GPS may be off, but the app must have received a location from the partner earlier.
- If nobody accepts, after a couple of minutes the request also goes to the next larger vehicle categories, one category per round, for up to two categories above the chosen one. Partners who never shared a location are included only from the later rounds.
- When the app is closed or in the background the load rings with a full-screen alert, even with the phone locked. When the app is open on the home screen, the load card and a sound are shown instead.
- To receive the ring reliably the app needs: notification permission, location permission (the app asks for background location so that the position is known while on duty), permission to appear over other apps, and the phone's battery and autostart settings set as the app's checklist shows. The home screen shows one card for each missing item with instructions for that phone.
- Why loads may not arrive: duty is off; KYC is not approved or not complete; the vehicle category does not match the booking; the partner is more than about 15 km (50 km for Advance) from the Pickup; the partner is on another trip; permissions are missing; or there simply are no bookings nearby at that time.

PARTNER: ACCEPTING AND RUNNING A TRIP
- A booking request that nobody accepts within one hour of being made is removed automatically, so a very old open request may no longer appear in the list.
- Accept or Reject on the load card or on the ring screen. The first partner to Accept gets the trip and the others stop ringing. Reject is only a decline; it does not cancel the customer's booking.
- After accepting: go to the Pickup, ask the customer for the pickup OTP, enter it in the app to start the trip, and tap End Trip at the end. Wrong OTP guesses are limited (after 10 wrong guesses the entry is locked for 10 minutes).
- For a Round trip: at the Drop tap "Reached drop - start return", then End Trip once back at the Pickup. There is one End Trip and no second OTP.
- The load card and the trip screen show the same fare that the customer was shown. The fare is not changed for the partner. Waiting charges, if any, appear as separate lines on the final bill.
- The call to the customer is connected through Apna Transport so that numbers are not shared; if that is not possible, a normal call is used.
- My Trips shows earlier trips. Advance rides are listed under "Advance (N)" at the top.

PARTNER: WALLET
- My Wallet shows the wallet balance. Recharge requests and withdrawal requests are made from My Wallet and are approved by Apna Transport. A withdrawal request is limited to the bonus balance.
- For amounts, timelines, commission, or a specific transaction, the helper does not have the information; "Talk to a person".

PARTNER: ADD NEW VEHICLE AND FLEET OWNERS
- A partner who owns more than one vehicle can tap "Add new vehicle" in Profile (after Save Changes). After a confirmation, the partner becomes a vehicle owner and the existing vehicle becomes the first vehicle of "My Fleet". This is not possible while a trip is running.
- For each additional vehicle the owner enters the vehicle (from the "Select vehicle" list), the registration number (AB12AB1234), a vehicle photo, and the driver's name, mobile number, photo and licence. Apna Transport approves each vehicle.
- Booking requests ring the owner's phone when any free approved vehicle of the fleet fits the category. On Accept the app asks "Which vehicle?"; the owner chooses the vehicle. The driver of that vehicle, who does not need the app, receives the pickup, drop, customer's number, owner's number and a private trip link on WhatsApp; on that page the driver enters the pickup OTP and marks "Delivered". The owner ends the trip in the app.

PARTNER: OTHER
- Language and Terms are available from the menu. Profile shows the partner's details and documents; documents can be changed with Change.
- Names are letters only; numbers boxes are digits only.
- WhatsApp Support on the home screen reaches the support team.
`;

const KNOWLEDGE = { common: COMMON, customer: CUSTOMER, driver: DRIVER };

module.exports = { KNOWLEDGE };
