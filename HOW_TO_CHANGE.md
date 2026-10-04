# How to change MyRepairUnder100

Most changes need **no code at all**. Start at level 1 and only go further down if you need to.

| Level | What you change | Where | Need to rebuild the app? |
|---|---|---|---|
| 1 | Turn features on/off, edit app texts | Admin → **Features** | No — phones update within 15 seconds |
| 2 | Prices, services, areas, coupons, rules | Admin → the matching menu page | No |
| 3 | Colours, app name, logo, server address | One small file each (below) | Yes (rebuild APK) |
| 4 | Bigger changes (new screens, new rules) | The code files listed below | Server: auto. App: rebuild APK |

Admin address: `https://<your-server>/admin` (log in with the email and password you set on Render).

---

## Level 1 — Admin → Features (switches)

| Switch | When it is OFF |
|---|---|
| ASAP bookings | Customers must pick a time slot |
| Pay online before service | Only "pay after service" is offered |
| Pay after service | Customers must pay online to book |
| Cash to technician | Technician can't mark a bill as paid in cash |
| Coupons | Coupon box and Offers screen disappear; the server rejects codes |
| Wallet | Wallet tab disappears; wallet can't be used at checkout |
| Refer & Earn | Refer tab and banner disappear; no new rewards |
| Add GST to bills | No tax line on bills |
| Automatic technician assignment | Every booking waits for you in Admin → Bookings → "Needs assignment" |
| Live technician tracking | No map / live location; technicians' phones stop sending location |
| In-app chat | Chat buttons disappear (calling still works) |
| Start code | Technician can start the job without the customer's 4-digit code |
| Ratings & reviews | No "Rate your technician" |
| Warranty requests in app | Customers are told to call you |
| Search bar / Offer banners / Popular services / "Why choose us" | That part of the home screen is hidden |
| Technicians can sign up from the app | Only you can add technicians (Admin → Technicians → Add) |

Texts you can edit on the same page: **home notice** (e.g. "Closed on Diwali"), tagline, search-bar text, Refer banner title, "Why choose us" points.

## Level 2 — Other admin pages

| I want to… | Go to |
|---|---|
| Change a price / add or remove a service / mark "popular" | Categories, services & pricing |
| Add a new appliance category or machine type | Categories, services & pricing → Categories tab |
| Start or stop serving a pincode / add a city | Service areas & pincodes |
| Create a coupon or a home-screen offer banner | Coupons & offers |
| Change booking time slots or how many bookings per slot | Settings → Time slots |
| Change cancellation fee / free-cancellation window | Settings → Cancellation |
| Change wallet limits, referral reward amounts | Settings → Wallet / Referral |
| Add your support phone, WhatsApp, GST number | Settings → Company |
| Add/approve technicians, set their areas and skills | Technicians |
| Give a customer wallet credit | Customers → open customer → Adjust wallet |
| Add another admin or support person | Settings → Admin users |

Every change here is recorded in **Audit logs** (who changed what, and the old value).

## Level 3 — Branding and app setup files

| What | File | Then |
|---|---|---|
| Colours used by both apps | `packages/mobile-kit/src/theme.ts` → `colors` | Rebuild APKs |
| Colours of the admin panel | `apps/admin/src/app/globals.css` → `:root` | Push to GitHub (Render redeploys) |
| App name shown under the icon | `apps/customer/app.json` → `"name"` (technician: `apps/technician/app.json`) | Rebuild APK |
| App icon / splash / logo | Replace the PNGs in `apps/customer/assets/images/` (same file names) | Rebuild APK |
| Policies (terms, privacy, refunds) | `apps/customer/src/lib/legal.ts` | Rebuild APK |
| FAQ in Help & support | `server/src/modules/support/support.routes.ts` → `faq` | Push to GitHub |
| Server address the apps connect to | Typed when you run the APK build (no file) | Rebuild APK |
| Google Maps on Android | GitHub → Settings → Secrets → `GOOGLE_MAPS_ANDROID_KEY` | Rebuild APK |

**Rebuild the APKs:** GitHub → your repository → **Actions** → **Build Android APKs** → **Run workflow** → paste your server address → about 20 minutes later the new APKs are under **Releases**.

**Update the server or admin panel:** push your change to GitHub. Render rebuilds and restarts it automatically (about 5 minutes).

## Level 4 — Where the code lives

**Customer app** (`apps/customer/src/app/` — one file per screen):

| Screen | File |
|---|---|
| Home | `(tabs)/index.tsx` |
| Bookings / Wallet / Refer / Profile tabs | `(tabs)/bookings.tsx`, `wallet.tsx`, `refer.tsx`, `profile.tsx` |
| Bottom tab bar | `(tabs)/_layout.tsx` |
| Login, OTP, location | `login.tsx`, `otp.tsx`, `location.tsx` |
| Category / service | `category/[slug].tsx`, `service/[id].tsx` |
| Cart → address → slot → review | `cart.tsx`, `checkout/address.tsx`, `checkout/slot.tsx`, `checkout/review.tsx` |
| Payment | `payment.tsx` |
| Booking tracking & bill | `booking/[id]/index.tsx` |
| Shared buttons, cards, inputs (both apps) | `packages/mobile-kit/src/ui.tsx` |

**Technician app** (`apps/technician/src/app/`): home `(tabs)/index.tsx`, job screen `job/[id]/index.tsx`, earnings `(tabs)/earnings.tsx`, sign-up `register.tsx`.

**Server rules** (`server/src/modules/`):

| Rule | File |
|---|---|
| How a bill is calculated (coupon, GST, wallet) | `pricing/pricing.ts` (has tests in `server/test/pricing.test.ts`) |
| Booking steps, cancellation fee, add-ons | `bookings/booking.service.ts` |
| Which technician gets a job | `bookings/assignment.service.ts` (weights also in Settings → Assignment) |
| Referral rewards & fraud rules | `referral/referral.service.ts` |
| A new feature switch | add it to `features` in `settings/settings.service.ts`, add a row to `apps/admin/src/app/(panel)/features/page.tsx`, then read it in the app with `useFeatures()` |
| Payment gateway / SMS / maps / push | `server/src/providers/` |

After changing server code, run the tests before pushing: `cd server && npm test`.

> Tip: when asking Claude (or a developer) for a change, mention the file from these tables — the change will be faster and safer.
