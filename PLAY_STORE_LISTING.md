# Play Store submission — status and handoff

## Corrected status (some of this was already done in earlier work)

| Item | Status |
|---|---|
| Web app manifest + icons | ✅ Done — `public/manifest.json`, `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`. Icons are generated from the actual in-app hexagon+truck Logo. Already deployed with every `firebase deploy --only hosting` you've run. |
| Privacy Policy (public link) | ✅ Done — `public/privacy.html`, deployed at `https://sarthi-transport-74865.web.app/privacy.html`. Bilingual (EN summary + HI), covers everything the app actually collects. **Open that link once yourself to confirm it loads** — this sandbox's network policy blocks it from fetching your live domain, so I can't verify it from here. |
| Google Maps API key | ✅ Live, already wired in |
| .aab file | ❌ Still to do — this is the PWABuilder step below, on you |
| Demo account for Google's reviewer | 🔧 Exact steps below — needs ~10 min of setup on your end, no code |
| Store listing copy (name/short/full description) | ✅ Drafted below, EN + HI |
| 512×512 icon for the listing | ✅ Same file already in the repo: `public/icons/icon-512.png` |
| Screenshots (4–5) | 👤 Still needs a real phone/browser — screen list below |
| Data Safety form answers | ✅ Drafted below, matches privacy.html exactly |
| Developer account ($25 + ID) | 👤 Purely yours — start this in parallel, ID verification is the slowest step |

---

## Next step, in order

1. **Start today, in parallel:** Play Console developer signup ($25 + PAN/DL verification) — no dependency on anything else below.
2. **Confirm the two links load** in your own browser:
   - `https://sarthi-transport-74865.web.app/manifest.json`
   - `https://sarthi-transport-74865.web.app/privacy.html`
3. **Set up the reviewer demo accounts** (steps below) — 10 minutes, Firebase Console + Admin panel only.
4. **Run PWABuilder**: go to [pwabuilder.com](https://www.pwabuilder.com), enter `https://sarthi-transport-74865.web.app`, let it audit the site, then generate the signed Android package → download the `.aab`.
5. **Play Console listing**: paste in the copy below, upload the icon, add screenshots, paste the Privacy Policy URL, fill the content rating questionnaire and Data Safety form (answers below).
6. **Upload the `.aab` to Internal Testing first**, confirm it opens and logs in correctly on your own device, then promote to Production and submit for review.

---

## Reviewer demo account setup

The app requires phone OTP to log in, and normally a new driver needs KYC documents approved by an admin before they can bid — neither of those works for a reviewer who's just clicking through once. Skip both using two things already built into the app:

**1. Firebase test phone numbers** (Firebase Console → Authentication → Sign-in method → Phone → "Phone numbers for testing"):
- Add `+91 9999999901` with code `123456` → this will be the demo **Customer**.
- Add `+91 9999999902` with code `123456` → this will be the demo **Driver**.
These numbers never send a real SMS and always accept that fixed code — safe to hand to Google's reviewer.

**2. Pre-fill both profiles from the Admin panel** so the reviewer never has to fill in a registration form or wait for KYC approval:
- Log in as Admin → **Customers** tab → **Add Manual Customer** → mobile `9999999901`, any name/address.
- Log in as Admin → **Drivers** tab → **Add Manual Driver** → mobile `9999999902`, any name/vehicle details. This path sets KYC to **Approved** automatically and gives the driver a starting wallet balance — so the demo driver can bid immediately, no document upload needed.

**Hand this to the reviewer** (Play Console → App content → App access → "All or some functionality is restricted" → add instructions):

> This app requires phone OTP login. Use these test credentials (no real SMS is sent):
> - Customer: role "Customer" → mobile `9999999901` → OTP `123456` → post a load and view bids.
> - Driver: role "Driver" → mobile `9999999902` → OTP `123456` → already KYC-approved, can view and bid on open loads.
> - Admin (optional, to see the operator side): [use one of your real admin accounts, or create a throwaway one via `scripts/setupAdmin.js` and give the reviewer that email/password].

---

## Store listing copy

**App name:** Apna Transport
**Category suggestion:** Business (or Maps & Navigation — either fits; Business is the more accurate fit for a load-bidding marketplace)
**Contact email:** sarthitransport726@gmail.com
**Contact phone:** +91 7972399892
**Privacy Policy URL:** `https://sarthi-transport-74865.web.app/privacy.html`

### Short description (English, ≤80 chars)
> Post a load or bid as a driver — instant truck/tempo booking, all India.

### Short description (Hindi, ≤80 chars)
> लोड पोस्ट करें या ड्राइवर बनकर बोली लगाएं — पूरे भारत में तुरंत ट्रक/टेम्पो बुकिंग।

### Full description (English)
Apna Transport connects customers who need goods transported with independent truck/tempo drivers, all across India.

**For customers:**
- Post what you need moved — pickup, drop, material, weight — and get bids from nearby verified drivers within minutes.
- Compare bids by price, driver rating, and vehicle type, then pick the one that suits you.
- Track your load live on the map from pickup to drop.
- Pay the driver directly (cash/UPI) — no card details ever stored in the app.

**For drivers:**
- See open loads near you and bid your own price — no fixed routes, no forced dispatch.
- Get paid directly by the customer, with a small platform commission only on completed trips.
- Simple KYC: license + vehicle photos, approved by our team before you start bidding.
- Track your earnings and trip history in one place.

**Built for trust:**
- Every driver is KYC-verified before they can accept a load.
- Live GPS sharing between customer and driver, only during an active trip.
- Ratings on both sides after every trip.
- In-app SOS/helpline for support during a trip.

Available in Hindi and English — switch anytime with the toggle at the top of the app.

### Full description (Hindi)
अपना ट्रांसपोर्ट सामान भेजने वाले ग्राहकों को पूरे भारत के स्वतंत्र ट्रक/टेम्पो ड्राइवरों से जोड़ता है।

**ग्राहकों के लिए:**
- अपना सामान पोस्ट करें — पिकअप, ड्रॉप, सामान का प्रकार, वजन — और मिनटों में पास के सत्यापित ड्राइवरों से बोली पाएं।
- कीमत, रेटिंग और गाड़ी के प्रकार के आधार पर बोली की तुलना करें और अपनी पसंद चुनें।
- पिकअप से ड्रॉप तक अपने सामान को लाइव मैप पर ट्रैक करें।
- ड्राइवर को सीधे भुगतान करें (नकद/UPI) — ऐप में कभी भी कार्ड की जानकारी सेव नहीं होती।

**ड्राइवरों के लिए:**
- अपने आसपास के खुले लोड देखें और अपनी कीमत पर बोली लगाएं — कोई तय रूट नहीं, कोई जबरदस्ती डिस्पैच नहीं।
- ग्राहक से सीधे भुगतान पाएं, पूरी हुई ट्रिप पर सिर्फ एक छोटा कमीशन।
- आसान KYC: लाइसेंस और गाड़ी की फोटो, बोली लगाने से पहले हमारी टीम द्वारा अप्रूव।
- अपनी कमाई और ट्रिप हिस्ट्री एक ही जगह देखें।

**भरोसे पर बना:**
- हर ड्राइवर लोड स्वीकार करने से पहले KYC-सत्यापित होता है।
- ट्रिप के दौरान ही ग्राहक और ड्राइवर के बीच लाइव GPS शेयरिंग।
- हर ट्रिप के बाद दोनों तरफ से रेटिंग।
- ट्रिप के दौरान सपोर्ट के लिए इन-ऐप SOS/हेल्पलाइन।

हिंदी और अंग्रेज़ी दोनों में उपलब्ध — ऐप के ऊपर मौजूद टॉगल से कभी भी भाषा बदलें।

---

## Screenshots to capture (4–5, phone in portrait)

1. Role selection screen (Customer / Driver choice)
2. Customer's "post a load" screen (Pickup/Drop boxes)
3. Customer's active ride / bidding screen with a couple of driver bids visible
4. Driver's open-loads / bidding screen
5. Live tracking map mid-trip

Capture these from a real phone browser (or Chrome DevTools device emulation) at the live URL, logged in with the demo credentials above.

---

## Data Safety form answers

Matches `public/privacy.html` exactly — update both together if data collection ever changes.

| Data type | Collected? | Shared with third parties? | Purpose |
|---|---|---|---|
| Name | Yes | No | Account management, app functionality |
| Phone number | Yes | No | Account management (OTP login) |
| Email | Yes, optional | No | Account management |
| Physical address | Yes | No | App functionality (pickup/drop, KYC) |
| Precise location (GPS) | Yes, only during an active trip | No | App functionality (live trip tracking) |
| Photos (profile, license, vehicle) | Yes | No | App functionality (KYC verification) |
| App activity (bookings, bids, ratings) | Yes | No | App functionality, analytics |
| Financial info | No card/bank data collected — wallet balances and commission are computed in-app only; the actual fare is paid outside the app (cash/UPI) directly between customer and driver | — | — |

Declare: data is encrypted in transit (Firebase default), users can request deletion (contact details in Privacy Policy), no data is sold or used for advertising.
