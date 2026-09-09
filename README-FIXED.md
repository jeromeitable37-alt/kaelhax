KAELHAX NEXORIUM deployment patch

Replace/copy the files from this folder into the existing Next.js project:
- app/admin/page.js
- app/page.js
- app/api/admin/order/route.js
- app/api/telegram/order/route.js
- lib/firebase-admin.js
- lib/server-auth.js
- lib/telegram.js
- lib/receipt.js
- app/firebase.js
- app/layout.js
- app/globals.css
- firebase.json
- firestore.rules
- storage.rules
- .gitignore

Keep .env.local OUT of GitHub. Configure the same environment variables in Vercel.
For Firebase Admin, use a newly generated service-account key (do not reuse a key that was exposed in chat).

The Firebase Admin initializer is lazy, so missing/malformed server credentials do not crash the Next.js build phase; requests fail with a clear configuration error instead.
