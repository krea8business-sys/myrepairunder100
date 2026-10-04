# MyRepairUnder100 — Technical architecture

## 1. Product architecture

```
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Customer app (Expo)  │   │ Technician app (Expo)│   │ Admin web (Next.js)  │
 │ Android · iOS · web  │   │ "MRU Partner"        │   │ RBAC dashboard       │
 └─────────┬────────────┘   └─────────┬────────────┘   └─────────┬────────────┘
           │ HTTPS REST + Socket.IO (JWT)  │                          │ HTTPS REST + Socket.IO (admin JWT)
           └───────────────┬───────────────┴──────────────┬───────────┘
                           ▼                              ▼
                ┌─────────────────────────────────────────────────────┐
                │ API server  (Node 22 · TypeScript · Express 5)      │
                │  modules: auth · catalog/search · location · cart · │
                │  pricing · bookings · assignment · payments ·       │
                │  wallet · referral · coupons · notifications ·      │
                │  support · reviews · warranty · invoices · admin    │
                │  realtime (Socket.IO) · background jobs             │
                └──┬──────────┬─────────┬─────────┬─────────┬─────────┘
                   │          │         │         │         │
              PostgreSQL   Razorpay   SMS/OTP   Maps      Expo Push    S3-compatible
              (Drizzle)    (orders,   (MSG91 /  (Google:  (→ FCM /     storage (photos,
                           webhooks,  Twilio)   geocode,  APNs)        documents)
                           refunds)             places,
                                                ETA)
```

Every third-party service sits behind a provider interface in `server/src/providers/` with a clearly labelled **mock** implementation for local development (mock SMS prints the OTP, mock gateway signs its own webhooks, mock maps approximates Delhi NCR). `env.ts` refuses to start in production with a mock SMS or payment provider.

## 2. User flows

**Customer (target: Home → Appliance → Service → Add → Cart → Location → Slot → Payment → Confirm)**

```
Splash → Onboarding (first run) → Phone → OTP (+ optional referral code) → Location permission (GPS / search / pincode)
→ Home (categories, search, offers, popular, refer banner)
→ Category (sub-type chips) → Service list / detail → Add  (cart bar is always one tap away)
→ Cart → Address (saved / add, serviceability check) → Date & slot (or ASAP) → Review (coupon, wallet, pay now / after)
→ [Pay now → gateway → server verifies] → Confirmed → Tracking (technician, start code, live map while travelling)
→ Approve/reject add-ons → Final bill → Pay (online or cash) → Warranty active → Rate → Referral reward (if referred)
```

**Technician**: Phone OTP → (first time) registration → pending approval (upload documents) → Available/Busy/Offline → job request (area + time only, countdown) → Accept (atomic) → Start travelling (location sharing starts) → Arrived → Start with customer's 4-digit code → before photos → recommend service / spare part (customer approves) → after photos → Complete → collect cash or customer pays in app → earnings.

**Admin**: Login → dashboard (metrics, charts, manual-assignment alerts) → bookings (filter, phone booking, assign/reassign, cancel, reschedule, refund, notes, invoice) → technicians (approve, documents, skills, pincodes) → catalog & pricing → areas → coupons/offers → wallet/referrals/payments → support/warranty/reviews → settings → audit log.

### Booking state machine

```
PENDING ──(payment captured)──► CONFIRMED ──(tech accepts / admin assigns)──► TECHNICIAN_ASSIGNED
   │  (pay-after-service bookings start at CONFIRMED)                             │
   │                                                                              ▼
   └─(30 min unpaid → auto-cancel)                                    TECHNICIAN_ON_THE_WAY ─► TECHNICIAN_ARRIVED
                                                                                                   │ start code
                                                                                                   ▼
COMPLETED ◄──(paid in full)── PAYMENT_PENDING ◄──(amount due)── SERVICE_COMPLETED ◄────────── SERVICE_STARTED
     ▲                                                                   │ (nothing due)            (add-ons here)
     └───────────────────────────────────────────────────────────────────┘
Any pre-service state ──► CANCELLED (customer / technician-release → back to CONFIRMED / admin / system)
```
Every transition is a conditional `UPDATE … WHERE version = $v` plus a row in `booking_status_history`.

## 3. Database schema

PostgreSQL, defined in `server/src/db/schema.ts` (single source of truth) → SQL migration in `server/drizzle/`. Conventions: UUID PKs, `created_at/updated_at`, `deleted_at` soft deletes on catalog/addresses/coupons, **money as integer paise**, percentages as basis points, CHECK constraints for non-negative money and wallet balance.

| Area | Tables |
|---|---|
| Identity | `users` (phone+role unique, referral code, hashed device id), `otp_requests` (HMAC-hashed code, attempts, expiry), `refresh_tokens` (hashed, rotation family), `admin_users` (bcrypt, lockout), `push_tokens` |
| Geography | `cities` → `zones` → `pincodes` (serviceability), `addresses` |
| Catalog | `categories` → `subcategories` → `services` (base/offer price, tax override, warranty, duration, keywords), `service_price_history`, `time_slots`, `offers`, `settings` (JSONB per section, validated by Zod) |
| Cart | `cart_items` (unique user+service) |
| Technicians | `technicians`, `technician_skills`, `technician_service_areas`, `technician_documents` |
| Bookings | `bookings` (encrypted address snapshot, money breakdown, version, start code, client request id), `booking_items` (price snapshot), `booking_addons` (approval status), `booking_status_history`, `booking_photos`, `booking_messages`, `job_offers` (assignment offers, unique booking+tech) |
| Money | `payments` (unique gateway order id), `payment_events` (unique event id → webhook replay protection), `refunds`, `wallets` (balance ≥ 0), `wallet_transactions` (unique idempotency key, FIFO lots with expiry), `coupons`, `coupon_redemptions` (reserve → redeem / release) |
| Growth & care | `referrals` (unique referee), `notifications`, `support_tickets`, `ticket_messages`, `reviews` (unique per booking, 1–5 check), `warranty_claims` |
| Governance | `audit_logs`, `analytics_events`, `counters` |

Key indexes: bookings by (customer, created), (technician, status), (status, date), pincode; job offers by (technician, status) and (status, expiry); wallet transactions by (user, created); OTP by (phone, created) and (ip, created).

## 4. API architecture

REST under `/v1`, grouped by actor (full list: [API.md](API.md)). Express 5 (async errors propagate), Zod validation on every input, a single error format, helmet, CORS allow-list, global + auth-specific rate limits, pino logs with secrets redacted.

Correctness-critical paths:

* **Pricing** — `modules/pricing/pricing.ts` is a pure function; the client only sends service ids/quantities. Coupons, tax (inclusive/exclusive), wallet caps are all computed there and unit-tested.
* **Booking create** — idempotent on `clientRequestId`; slot capacity serialised with `SELECT … FOR UPDATE`; coupon row locked and usage re-checked; wallet debited inside the same transaction.
* **Wallet** — row lock on `wallets`, unique idempotency key per operation, DB-level `balance >= 0`. Tested with two concurrent bookings spending the same balance.
* **Assignment** — scoring (distance · workload · rating), batch offers with TTL, rounds, admin queue. Acceptance locks the booking row first (consistent lock order) and claims it with `UPDATE … WHERE technician_id IS NULL` → exactly one winner (tested with a race).
* **Payments** — server creates the order for the server-computed amount; success is accepted only from a signature-verified webhook or a server-to-server status check; webhook events are de-duplicated; payments arriving after cancellation are auto-refunded.
* **Side effects** (push, sockets, assignment) run *after* the DB transaction commits (`withAfter`).

## 5. Folder structure

```
myrepairunder100/
├─ server/                 API (Express + Drizzle + Socket.IO)
│  ├─ src/config           env validation (fails fast, blocks mocks in prod)
│  ├─ src/db               schema.ts, client, migrate, seed (DEMO data)
│  ├─ src/lib              auth/RBAC, crypto (AES-GCM, HMAC), errors, validation, audit, dates, money
│  ├─ src/providers        sms, payments, maps, push, storage (+ mocks)
│  ├─ src/realtime         Socket.IO rooms & location relay
│  ├─ src/modules          auth, catalog, location, customer, pricing, bookings, payments,
│  │                       wallet, referral, technician, support, notifications, analytics, settings, admin/*
│  ├─ src/jobs             offer expiry, unpaid-booking expiry, assignment retry, promo expiry
│  ├─ drizzle/             SQL migrations
│  └─ test/                e2e lifecycle test + pricing unit tests
├─ apps/customer           Expo (SDK 57, expo-router) customer app
├─ apps/technician         Expo technician app ("MRU Partner")
├─ apps/admin              Next.js 16 admin dashboard
├─ packages/mobile-kit     shared design system, API client, secure token storage, socket hook
├─ assets/brand            logo cut-out, app icon, splash
└─ docs/                   this file, API.md, DEPLOYMENT.md, PRODUCTION_CHECKLIST.md
```

## 6. Design system

* **Brand**: deep navy `#0B2559` + service blue `#1747D6` (trust, primary CTAs — 7:1 contrast with white) with the logo's orange `#F25A0C` as the accent (offers, highlights, live status). Font: Plus Jakarta Sans.
* **Tokens** (`packages/mobile-kit/src/theme.ts`, mirrored in `apps/admin/src/app/globals.css`): colours, radii (8/12/16/22), spacing (4-pt), type scale (display → tiny), two shadows.
* **Components** (`packages/mobile-kit/src/ui.tsx`): Text, Screen, Header, Card, Section, Button (primary/secondary/ghost/danger/accent/success, loading), IconButton (badge), Badge/StatusBadge, Chip, Field, OtpInput, QtyStepper, Toggle, Radio, Skeleton/SkeletonList, EmptyState, ErrorState (retry), Banner, Sheet (bottom sheet), Confirm dialog, PriceText, BillRow, Timeline, ListRow, StickyFooter, Toast. App-level: ServiceCard, CartBar, BookingCard, TrackingMap (native map / web fallback), JobCard, DocumentsCard.
* **Accessibility**: 44 pt+ tap targets, roles/labels/states on every pressable, `maxFontSizeMultiplier` to respect large text without breaking layouts, colour never the only signal, keyboard-navigable admin with visible focus rings.
* Every data screen has loading (skeleton), empty, error + retry states.

## 7. Stack choices (and one deliberate change)

| Layer | Choice | Why |
|---|---|---|
| Mobile | Expo SDK 57 + expo-router | One codebase for Android/iOS (+ web preview), OTA updates via EAS, Expo push. |
| Backend | Node 22 + TypeScript + Express 5 | As requested; small, well understood, easy to host. |
| ORM | **Drizzle ORM** instead of Prisma | Pure TypeScript (no native query-engine binary to download/ship), SQL-level control needed for `SELECT … FOR UPDATE` row locking in wallet/assignment/slot logic, fast cold starts on Railway/Render. Migrations are plain SQL you can read. |
| DB | PostgreSQL 16 | Transactions, row locks, CHECK constraints, JSONB settings. |
| Realtime | Socket.IO | Rooms per booking/user/technician; REST fallback for location. |
| Payments | Razorpay (Standard Checkout + webhooks) | UPI, cards, net banking; orders API; refunds API. |
| Push | Expo push service | Delivers to FCM/APNs without managing device credentials per platform in the API. |
| Admin | Next.js 16 | As requested; static pages calling the API with an in-memory/sessionStorage bearer token. |
