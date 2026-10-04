# Production readiness checklist

Legend: ✅ built & tested here · 🔧 built, needs your keys/config · 📋 business/legal action for you

| Area | Status | Notes |
|---|---|---|
| Phone + OTP auth | ✅ 🔧 | HMAC-hashed OTP, 5-min expiry, 30 s resend, 5/hour/phone, 20/hour/IP, 5 attempts, single use. Needs MSG91/Twilio + DLT template. |
| Sessions | ✅ | 15-min JWT + rotating refresh tokens with reuse detection; tokens in OS keychain on device. |
| Authorization | ✅ | Customer/technician/admin token separation; admin RBAC (SUPER_ADMIN/ADMIN/SUPPORT); ownership checks on every booking route. |
| Database | ✅ | Migrations, constraints, indexes, soft deletes. 📋 enable automated backups + PITR on your provider. |
| Pricing | ✅ | Server-side only, unit-tested. 📋 replace DEMO prices. |
| Payments | ✅ 🔧 | Orders, signed webhooks, replay protection, server verification, refunds, auto-refund if paid after cancel. Needs Razorpay keys + webhook. |
| Wallet | ✅ | Row-locked, idempotent, non-negative, FIFO expiring lots, audited admin adjustments. Concurrency tested. |
| Referral | ✅ | One per referee, self/same-device blocks, monthly cap, reward only after qualifying completed booking. |
| Coupons | ✅ | Dates, global + per-user limits, new-user, category/service scope, min order, max discount; reserve/release on cancel. |
| Booking lifecycle | ✅ | Idempotent create, slot capacity, state machine with optimistic locking, history. |
| Technician assignment | ✅ | Auto (scored batches, TTL, rounds) + manual; race-safe accept (tested). |
| Location & maps | ✅ 🔧 | Sharing only while ON_THE_WAY/ARRIVED; server enforces. Needs Google keys (server + Android). |
| Notifications | ✅ 🔧 | Stored + socket + Expo push. Needs EAS project + FCM/APNs credentials. SMS/WhatsApp templates optional. |
| Admin | ✅ | 21 screens, audit log on every sensitive change. 📋 change the dev admin password / create real admins. |
| Error handling | ✅ | Loading/empty/error/retry on every screen; friendly server messages; 20 s client timeouts. |
| Security | ✅ | Helmet, CORS allow-list, rate limits, Zod validation, parameterised SQL, AES-GCM encrypted addresses, magic-byte upload checks, signed file URLs, CSP on admin. 📋 put API behind HTTPS/WAF (Cloudflare). |
| Privacy | ✅ 📋 | Account deletion, data minimisation, masked phones for SUPPORT role. Policies are templates — get them reviewed (DPDP Act 2023) and add grievance officer details. |
| Performance | ✅ | One-call home endpoint with cache headers, pagination, indexes, skeleton loading. 📋 add a CDN for images. |
| Observability | 🔧 | Structured pino logs + /health. 📋 add Sentry (apps + API) and uptime monitoring. |
| SEO pages (/ac-repair, /ref/CODE landing) | 📋 | Not in this build — next step is a small Next.js marketing site using `GET /v1/categories/:slug` (SEO fields already in the schema). |
| Store listing | 📋 | Play Console + App Store accounts, privacy labels, screenshots. |
