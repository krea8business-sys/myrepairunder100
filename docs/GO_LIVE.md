# Going live (after phone testing)

The Render setup starts in **TEST MODE**: OTPs are shown on screen and payments are simulated. Before real customers use the app:

1. **SMS OTP** — create an MSG91 account, complete DLT registration (mandatory in India), create an OTP template. In Render → your service → Environment set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`, `OTP_DEV_ECHO=false`.
2. **Payments** — Razorpay account with KYC. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; add the webhook `https://<server>/v1/payments/webhook` (events payment.captured, payment.failed, order.paid, refund.processed).
3. **Turn off test mode** — set `TEST_MODE=false`. The server refuses to start if anything above is still a test provider.
4. **Paid hosting** — Render's free server sleeps after 15 minutes (first request then takes ~50 s) and the free database expires after 30 days. Switch the service to *Starter* and the database to a paid plan, or move the database to Neon/Supabase.
5. **Photos & documents** — set `STORAGE_PROVIDER=s3` with an S3 / Cloudflare R2 bucket (files on the free server's disk are lost on restart).
6. **Maps & push** — Google Maps keys (see DEPLOYMENT.md), Expo/EAS for push notifications.
7. **Play Store** — build an `.aab` with EAS (`npx eas-cli build --platform android --profile production`) and upload to Play Console.
8. Replace demo prices/technicians, fill Settings → Company, get the policies reviewed, then clear the demo banner in Settings → Launch.
