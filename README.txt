KAELHAX IMAGE FIX V5

This patch changes product image handling so selecting an image:
1. uploads to Firebase Storage
2. immediately publishes the new product image URL to Firestore site/config
3. updates admin state after the Firestore write
4. clears the storefront image error state when fresh site data arrives
5. no longer silently replaces a failed Firebase product image with the default asset

Replace:
- app/admin/page.js
- app/page.js
- firebase.js only if your current file matches the uploaded firebase(1).js

No Firestore/Storage rule changes are required by this patch.
