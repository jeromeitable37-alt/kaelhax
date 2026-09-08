import {
  cert,
  getApps,
  getApp,
  initializeApp,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    .trim();

  if (!projectId) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PROJECT_ID."
    );
  }

  if (!clientEmail) {
    throw new Error(
      "Missing FIREBASE_ADMIN_CLIENT_EMAIL."
    );
  }

  if (!privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "FIREBASE_ADMIN_PRIVATE_KEY is not a valid PEM private key."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const app = getFirebaseAdminApp();

export const adminDb = getFirestore(app);

export const adminStorage = getStorage(app);

export const adminBucket = adminStorage.bucket(
  process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
);

export const getAdminAuth = () => {
  return getAuth(app);
};

export const getAdminApp = () => app;