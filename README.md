# MyRepairUnder100

**Reliable Repairs. Right at Your Door.** — a complete home-appliance repair booking platform for Delhi NCR (AC, washing machine, refrigerator, microwave).

| Part | Folder | Tech |
|---|---|---|
| Customer app | `apps/customer` | Expo SDK 57 (Android, iOS, web preview) |
| Technician app ("MRU Partner") | `apps/technician` | Expo SDK 57 |
| Admin dashboard | `apps/admin` | Next.js 16 |
| API | `server` | Node 22, TypeScript, Express 5, Drizzle ORM, PostgreSQL, Socket.IO |
| Shared mobile UI kit | `packages/mobile-kit` | Design system, API client, secure storage |

**Want to change something?** Read [HOW_TO_CHANGE.md](HOW_TO_CHANGE.md) first — most changes are switches in the admin panel.

**Put it online for phone testing:** Render blueprint (`render.yaml`) + GitHub Actions APK build (`.github/workflows/android-apk.yml`). Going live: [docs/GO_LIVE.md](docs/GO_LIVE.md).

Docs: [Architecture, flows, schema, design system](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [Deployment](docs/DEPLOYMENT.md) · [Production checklist](docs/PRODUCTION_CHECKLIST.md)

## Run it locally (about 10 minutes)

Prerequisites: Node 20+ (22 recommended), PostgreSQL 15+ (or Docker), the **Expo Go** app on your phone.

```bash
# 1. Database
docker compose up -d db                  # or use your own Postgres and edit DATABASE_URL

# 2. API
cd server
cp .env.example .env                     # then fill the secrets (commands are in the file)
npm install
npm run db:migrate
npm run db:seed                          # DEMO catalog, pincodes, 3 demo technicians, dev admin
npm run dev                              # http://localhost:4000/health

# 3. Admin  (new terminal, from repo root)
npm install
npm run dev:admin                        # http://localhost:3000/admin

# 4. Customer app  (new terminal)
cd apps/customer && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:4000 npx expo start      # scan the QR with Expo Go

# 5. Technician app  (new terminal)
cd apps/technician && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:4000 npx expo start --port 8082
```
On Windows PowerShell set the variable first: `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000"; npx expo start`.

### Development logins (local only — never in production)
* **Admin:** `admin@myrepairunder100.local` / `ChangeMe-Dev-2026` (forced password change on first login). In production create the first admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
* **Customer:** any Indian mobile number. With `SMS_PROVIDER=mock` + `OTP_DEV_ECHO=true` the OTP is shown in the app and printed in the API log.
* **Technicians (demo):** `9000000001`, `9000000002`, `9000000003` — same OTP behaviour.
* **Payments:** the mock gateway shows "Simulate successful / failed payment" buttons. Add Razorpay keys to use the real checkout.

### Try the whole flow
1. Customer: log in → allow location (or enter pincode `110084`) → AC Repair → add *AC Checkup* → Proceed → add address → pick a slot → apply `WELCOME50` → Book.
2. Technician 1 or 3 (AC skill, serve 110084): the job appears under *New job requests* → Accept → Start travelling → I have arrived → enter the customer's start code → Add service → Complete.
3. Customer: approve the add-on, watch live status, pay, rate, download the invoice.
4. Admin: see it all on the dashboard, bookings, wallet and audit log.

## Tests
```bash
cd server
npm test        # e2e lifecycle (OTP → booking → payment webhook → assignment race → tracking → add-ons → payment → referral → admin) + pricing unit tests
npm run typecheck
```
Mobile/admin: `npm run typecheck` in each app; `npx next build` in `apps/admin`.

## What is configurable in Admin (nothing business-critical is hard-coded)
Prices & offer prices · services, categories, sub-types · popular services · search keywords · warranty per service · tax (on/off, inclusive/exclusive, rate) · time slots & capacity · booking window, ASAP, working days · cities/zones/pincodes · coupons & home offer banners · wallet limits & promo expiry · referral rewards & fraud rules · cancellation window & fee · payment options (pay now / after / cash) · assignment rules · company contact details & public stats · admin users & roles.
