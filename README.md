# KAELHAX — NEXORIUM CHANNEL

This production build keeps the supplied NEXORIUM storefront UI intact. The changes are additive: dark/light mode, cinematic neon effects, AI support, a real separate `/admin` console, Firebase-backed users/site/orders, the supplied GCash QR, and Telegram receipt verification.

## UI preserved
- Existing neon/cyber storefront, hero, sidebar, mobile slide-out, product cards, FAQ, login/register modal, checkout and typography.
- Supplied payment QR is included unchanged at `public/gcash-payment-qr.png`.
- Payment checkout shows the configured merchant display name plus the supplied QR; no extra personal payment fields are added by the application.

## User features
- Firebase Email/Password and Google sign-in.
- Registration creates a `users/{uid}` profile with `role: member` and `disabled: false`.
- Checkout uses the supplied GCash merchant QR.
- Customer can upload a receipt image and optional GCash reference number.
- Order is written to Firestore as `pending` and sent to the configured Telegram admin chat for manual review.
- Signed-in customers can open **My Orders** from the existing sidebar to see order status and receipt link.
- AI Support floats above the storefront and uses the current site/product/FAQ context.
- Dark/light theme is remembered locally.

## Admin features
A separate production route is available at `/admin` and uses the same NEXORIUM visual language rather than changing the public storefront.

- Overview dashboard with product/order/user counts.
- Content editor for brand, hero, announcement and Telegram link.
- Product manager with add/edit/delete, price, duration, status, description, delivery URL, and image upload.
- Payment manager using the supplied GCash QR by default.
- Order queue with receipt image link, reference, Confirm and Reject actions.
- Confirming an order from web or Telegram generates a branded PNG receipt and sends it to the configured Telegram admin chat.
- User manager for role and disabled status.
- JSON export for storefront backup.

Admin access is controlled by Firestore `users/{uid}` role data. A public visitor cannot promote themselves to admin.

## Firebase setup
1. Create a Firebase Web App and copy its values to `.env.local`.
2. Enable Authentication: Email/Password and Google.
3. Create Firestore Database.
4. Create Storage.
5. Deploy `firestore.rules` and `storage.rules`.
6. Register an account, then set that account's Firestore document to:
```text
users/{USER_UID}
role: admin
disabled: false
```

## Server environment
Copy `.env.example` to `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna

TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=
TELEGRAM_ADMIN_USER_ID=
TELEGRAM_WEBHOOK_SECRET=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=kael210bot
NEXT_PUBLIC_SITE_URL=http://localhost:3000

FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=
FIREBASE_STORAGE_BUCKET=
```

Never commit `.env.local`, a Telegram bot token, or a Firebase service-account JSON.

## Telegram verification
The customer submits a receipt to:
```text
POST /api/telegram/order
```
The server verifies the Firebase ID token, stores the receipt in Firebase Storage, creates an order in Firestore, then forwards the image to Telegram with:
```text
✅ CONFIRM   ❌ REJECT
```

When confirmed, the webhook or Admin Console generates a branded PNG receipt and sends it with an optional **BUY / GET KEY** button using the product's `deliveryUrl`.

Register the webhook after deployment by sending a POST to `/api/telegram/setup` with header:
```text
x-telegram-setup-secret: YOUR_TELEGRAM_WEBHOOK_SECRET
```

The webhook expects Telegram's `secret_token` header and also checks the configured admin chat/user IDs before processing confirmation buttons.

### Bot token safety
If a Telegram bot token has ever been posted in a chat, screenshot, repository, or other shared location, revoke/regenerate it in BotFather before using the production site. This project intentionally does not hard-code the token.

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Production behavior
- Firebase is the source of truth for auth, roles, storefront configuration and orders.
- Local storage is only used for theme preference and limited UI fallback behavior; it is not trusted for production authorization.
- Payment screenshots are evidence for manual review. The site does not claim a payment is valid merely because an image was uploaded.
