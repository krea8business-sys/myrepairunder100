# API reference

Base URL: `https://<api-host>/v1`. JSON in/out. Money is **integer paise** (₹1 = 100). Auth: `Authorization: Bearer <accessToken>` (customer/technician JWT, 15 min, rotating refresh tokens) or admin JWT (8 h).

Errors: `{ "error": { "code": "SLOT_FULL", "message": "human readable" } }` with a proper HTTP status.

Realtime: Socket.IO on the API host, `auth: { token }` (admins add `admin: true`). Events: `booking:update`, `addon:requested`, `addon:decided`, `payment:update`, `tech:location`, `chat:message`, `notification`, `job:offer`, `job:taken`, `job:expired`, `job:assigned`, `job:cancelled`. Clients emit `booking:join <id>` (authorised: owner/assigned tech/admin) and technicians emit `tech:location {lat,lng}` (ignored unless they have a job in ON_THE_WAY/ARRIVED).

## Authentication

| Method | Path |
|---|---|
| `POST` | `/v1/auth/admin/login` |
| `POST` | `/v1/auth/logout` |
| `POST` | `/v1/auth/push-token` |
| `POST` | `/v1/auth/refresh` |
| `POST` | `/v1/auth/send-otp` |
| `POST` | `/v1/auth/verify-otp` |

## Public catalog (no auth)

| Method | Path |
|---|---|
| `GET` | `/v1/categories` |
| `GET` | `/v1/categories/:id/services` |
| `GET` | `/v1/categories/:idOrSlug` |
| `GET` | `/v1/config` |
| `GET` | `/v1/home` |
| `GET` | `/v1/offers` |
| `GET` | `/v1/search` |
| `GET` | `/v1/services/:idOrSlug` |

## Location & serviceability

| Method | Path |
|---|---|
| `GET` | `/v1/location/autocomplete` |
| `GET` | `/v1/location/place` |
| `GET` | `/v1/location/reverse-geocode` |
| `GET` | `/v1/location/serviceability` |

## Customer — profile, addresses, cart, slots, wallet, referral, notifications

| Method | Path |
|---|---|
| `DELETE` | `/v1/me` |
| `GET` | `/v1/me` |
| `PATCH` | `/v1/me` |
| `GET` | `/v1/me/addresses` |
| `POST` | `/v1/me/addresses` |
| `DELETE` | `/v1/me/addresses/:id` |
| `PUT` | `/v1/me/addresses/:id` |
| `POST` | `/v1/me/cart` |
| `PUT` | `/v1/me/cart` |
| `GET` | `/v1/me/cart` |
| `DELETE` | `/v1/me/cart` |
| `DELETE` | `/v1/me/cart/item/:serviceId` |
| `POST` | `/v1/me/cart/quote` |
| `GET` | `/v1/me/notifications` |
| `POST` | `/v1/me/notifications/read` |
| `GET` | `/v1/me/referral` |
| `POST` | `/v1/me/referral/apply` |
| `GET` | `/v1/me/referral/history` |
| `GET` | `/v1/me/slots` |
| `GET` | `/v1/me/wallet` |
| `POST` | `/v1/me/wallet/apply` |
| `GET` | `/v1/me/wallet/transactions` |

## Bookings (customer)

| Method | Path |
|---|---|
| `GET` | `/v1/bookings` |
| `POST` | `/v1/bookings` |
| `GET` | `/v1/bookings/:id` |
| `POST` | `/v1/bookings/:id/addons/:addonId/decision` |
| `POST` | `/v1/bookings/:id/cancel` |
| `GET` | `/v1/bookings/:id/cancel-preview` |
| `GET` | `/v1/bookings/:id/invoice-link` |
| `GET` | `/v1/bookings/:id/invoice-signed.pdf` |
| `GET` | `/v1/bookings/:id/invoice.pdf` |
| `GET` | `/v1/bookings/:id/messages` |
| `POST` | `/v1/bookings/:id/messages` |
| `POST` | `/v1/bookings/:id/reschedule` |
| `POST` | `/v1/bookings/:id/review` |
| `GET` | `/v1/bookings/:id/tracking` |
| `POST` | `/v1/bookings/:id/warranty-claim` |

## Payments

| Method | Path |
|---|---|
| `POST` | `/v1/payments/create` |
| `POST` | `/v1/payments/mock/complete` |
| `POST` | `/v1/payments/verify` |
| `POST` | `/v1/payments/webhook` |

## Technician app

| Method | Path |
|---|---|
| `POST` | `/v1/technician/availability` |
| `GET` | `/v1/technician/catalog` |
| `GET` | `/v1/technician/dashboard` |
| `POST` | `/v1/technician/documents` |
| `GET` | `/v1/technician/earnings` |
| `GET` | `/v1/technician/jobs` |
| `GET` | `/v1/technician/jobs/:id` |
| `POST` | `/v1/technician/jobs/:id/accept` |
| `POST` | `/v1/technician/jobs/:id/addons` |
| `POST` | `/v1/technician/jobs/:id/arrived` |
| `POST` | `/v1/technician/jobs/:id/collect-cash` |
| `POST` | `/v1/technician/jobs/:id/complete` |
| `POST` | `/v1/technician/jobs/:id/on-the-way` |
| `POST` | `/v1/technician/jobs/:id/photos` |
| `POST` | `/v1/technician/jobs/:id/reject` |
| `POST` | `/v1/technician/jobs/:id/release` |
| `POST` | `/v1/technician/jobs/:id/start` |
| `POST` | `/v1/technician/location` |
| `GET` | `/v1/technician/me` |
| `GET` | `/v1/technician/notifications` |
| `POST` | `/v1/technician/notifications/read` |
| `GET` | `/v1/technician/onboarding-options` |
| `POST` | `/v1/technician/register` |

## Support (customer & technician)

| Method | Path |
|---|---|
| `GET` | `/v1/support/info` |
| `POST` | `/v1/support/tickets` |
| `GET` | `/v1/support/tickets` |
| `GET` | `/v1/support/tickets/:id` |
| `POST` | `/v1/support/tickets/:id/messages` |

## Analytics

| Method | Path |
|---|---|
| `POST` | `/v1/analytics/events` |

## Admin (RBAC: SUPER_ADMIN / ADMIN / SUPPORT — see server/src/lib/auth.ts)

| Method | Path |
|---|---|
| `POST` | `/v1/admin/admins` |
| `GET` | `/v1/admin/admins` |
| `PATCH` | `/v1/admin/admins/:id` |
| `GET` | `/v1/admin/analytics` |
| `GET` | `/v1/admin/areas` |
| `GET` | `/v1/admin/audit-logs` |
| `GET` | `/v1/admin/bookings` |
| `POST` | `/v1/admin/bookings` |
| `PATCH` | `/v1/admin/bookings/:id` |
| `GET` | `/v1/admin/bookings/:id` |
| `POST` | `/v1/admin/bookings/:id/assign` |
| `POST` | `/v1/admin/bookings/:id/auto-assign` |
| `POST` | `/v1/admin/bookings/:id/cancel` |
| `GET` | `/v1/admin/bookings/:id/eligible-technicians` |
| `GET` | `/v1/admin/bookings/:id/invoice.pdf` |
| `POST` | `/v1/admin/bookings/:id/refund` |
| `POST` | `/v1/admin/bookings/:id/reschedule` |
| `GET` | `/v1/admin/categories` |
| `POST` | `/v1/admin/categories` |
| `DELETE` | `/v1/admin/categories/:id` |
| `PUT` | `/v1/admin/categories/:id` |
| `POST` | `/v1/admin/cities` |
| `PATCH` | `/v1/admin/cities/:id` |
| `POST` | `/v1/admin/coupons` |
| `GET` | `/v1/admin/coupons` |
| `DELETE` | `/v1/admin/coupons/:id` |
| `PUT` | `/v1/admin/coupons/:id` |
| `GET` | `/v1/admin/customers` |
| `GET` | `/v1/admin/customers/:id` |
| `POST` | `/v1/admin/customers/:id/status` |
| `GET` | `/v1/admin/dashboard` |
| `GET` | `/v1/admin/me` |
| `POST` | `/v1/admin/me/password` |
| `POST` | `/v1/admin/notifications/broadcast` |
| `GET` | `/v1/admin/offers` |
| `POST` | `/v1/admin/offers` |
| `DELETE` | `/v1/admin/offers/:id` |
| `PUT` | `/v1/admin/offers/:id` |
| `GET` | `/v1/admin/payments` |
| `POST` | `/v1/admin/pincodes` |
| `PATCH` | `/v1/admin/pincodes/:pincode` |
| `GET` | `/v1/admin/referrals` |
| `POST` | `/v1/admin/referrals/:id/block` |
| `POST` | `/v1/admin/referrals/:id/unblock` |
| `GET` | `/v1/admin/reviews` |
| `POST` | `/v1/admin/reviews/:id/visibility` |
| `POST` | `/v1/admin/services` |
| `GET` | `/v1/admin/services` |
| `DELETE` | `/v1/admin/services/:id` |
| `PUT` | `/v1/admin/services/:id` |
| `PATCH` | `/v1/admin/services/:id` |
| `GET` | `/v1/admin/services/:id` |
| `POST` | `/v1/admin/services/:id/image` |
| `GET` | `/v1/admin/settings` |
| `PUT` | `/v1/admin/settings/:section` |
| `GET` | `/v1/admin/slots` |
| `POST` | `/v1/admin/slots` |
| `PUT` | `/v1/admin/slots/:id` |
| `POST` | `/v1/admin/subcategories` |
| `PUT` | `/v1/admin/subcategories/:id` |
| `DELETE` | `/v1/admin/subcategories/:id` |
| `POST` | `/v1/admin/technicians` |
| `GET` | `/v1/admin/technicians` |
| `GET` | `/v1/admin/technicians/:id` |
| `PUT` | `/v1/admin/technicians/:id` |
| `POST` | `/v1/admin/technicians/:id/documents/:docId` |
| `POST` | `/v1/admin/technicians/:id/status` |
| `GET` | `/v1/admin/tickets` |
| `GET` | `/v1/admin/tickets/:id` |
| `POST` | `/v1/admin/tickets/:id/reply` |
| `POST` | `/v1/admin/tickets/:id/status` |
| `POST` | `/v1/admin/wallet/adjust` |
| `GET` | `/v1/admin/wallet/transactions` |
| `GET` | `/v1/admin/warranty-claims` |
| `POST` | `/v1/admin/warranty-claims/:id/decision` |
| `POST` | `/v1/admin/zones` |
| `PATCH` | `/v1/admin/zones/:id` |
