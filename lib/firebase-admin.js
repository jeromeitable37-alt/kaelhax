import {
  cert,
  getApps,
  getApp,
  initializeApp,
} from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let cachedApp = null;

function normalizePrivateKey(value) {
  if (!value) return '';

  let key = String(value).trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, '\n').trim();
}

function getFirebaseAdminApp() {
  if (cachedApp) return cachedApp;

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  if (!projectId) {
    throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID.');
  }

  if (!clientEmail) {
    throw new Error('Missing FIREBASE_ADMIN_CLIENT_EMAIL.');
  }

  if (!privateKey) {
    throw new Error('Missing FIREBASE_ADMIN_PRIVATE_KEY.');
  }

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      'FIREBASE_ADMIN_PRIVATE_KEY is not a valid PEM private key.'
    );
  }

  cachedApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });

  return cachedApp;
}

export function getAdminApp() {
  return getFirebaseAdminApp();
}

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}

export function getAdminStorage() {
  return getStorage(getFirebaseAdminApp());
}

export function getAdminBucket() {
  return getAdminStorage().bucket(
    process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  );
}

/*
 * Backward-compatible lazy exports.
 * Existing API routes that still import adminDb/adminAuth/adminStorage/
 * adminBucket will continue to work without initializing Firebase Admin
 * during the Next.js build phase.
 */
function lazyService(getter) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        const service = getter();
        const value = service[property];
        return typeof value === 'function'
          ? value.bind(service)
          : value;
      },
      has(_target, property) {
        return property in getter();
      },
    }
  );
}

export const adminAuth = lazyService(getAdminAuth);
export const adminDb = lazyService(getAdminDb);
export const adminStorage = lazyService(getAdminStorage);
export const adminBucket = lazyService(getAdminBucket);
