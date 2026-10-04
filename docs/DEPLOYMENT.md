# Deployment

## 1. Database
Any managed PostgreSQL 15+ (Neon, Supabase, Railway, AWS RDS, DigitalOcean). Set `DATABASE_URL` and `DATABASE_SSL=true`.

```bash
cd server
npm install
npm run db:migrate            # applies server/drizzle/*.sql
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='a-strong-password' npm run db:seed   # first run only
```
The seed loads **DEMO** prices, pincodes and three demo technicians (+91 90000 0000x). Review/replace them in the admin before launch, then clear the banner in Settings → Launch.

## 2. API server (Railway / Render / AWS)
* Build: `npm install && npm run build` · Start: `npm start` (or use `server/Dockerfile`, which runs migrations on boot).
* Set every variable from `server/.env.example`. Generate secrets with the commands in that file.
* `NODE_ENV=production`, `SMS_PROVIDER=msg91|twilio`, `PAYMENT_PROVIDER=razorpay` — the server refuses to start with mock providers in production.
* `STORAGE_PROVIDER=s3` with an S3/R2/Spaces bucket (private; files are served through short-lived signed URLs).
* Health check: `GET /health`.
* Run one instance with `RUN_JOBS=true`; extra replicas with `RUN_JOBS=false`. For more than one replica, add the Socket.IO Redis adapter.

### Razorpay
1. Dashboard → Settings → API keys → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. Webhooks → URL `https://<api>/v1/payments/webhook`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, secret → `RAZORPAY_WEBHOOK_SECRET`.

### SMS OTP (India)
DLT registration is mandatory. Create an OTP template with MSG91 (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`) or use Twilio Verify/Messaging.

### Google Maps
Create two keys: a **server** key (Geocoding, Places, Distance Matrix — restricted by IP) → `GOOGLE_MAPS_SERVER_KEY`; an **Android** key (Maps SDK for Android, restricted to the app package + SHA-1) → `apps/*/app.json → android.config.googleMaps.apiKey`.

## 3. Admin dashboard (Vercel)
Root `apps/admin`, env `NEXT_PUBLIC_API_URL=https://<api>`. Add the admin URL to the API's `CORS_ORIGINS`.

## 4. Mobile apps (EAS)
```bash
cd apps/customer            # same for apps/technician
npm install
npx eas-cli@latest login
npx eas-cli@latest init     # writes extra.eas.projectId (needed for push)
# set "extra.apiUrl" in app.json (or EXPO_PUBLIC_API_URL in eas.json) to your API URL
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android
```
Push notifications: upload your FCM V1 service-account key in the EAS dashboard (Credentials) and an APNs key for iOS. Then set `PUSH_PROVIDER=expo` on the server.

## 5. After deploy
* Run the e2e test against staging: `DATABASE_URL=<staging> npm test` (uses mock providers — run it on a staging DB, never production).
* Work through `docs/PRODUCTION_CHECKLIST.md`.
