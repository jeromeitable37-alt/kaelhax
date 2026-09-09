import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let cachedApp = null;

function cleanEnv(value) {
  if (typeof value !== 'string') return '';

  let result = value.trim();

  if (result.length >= 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      result = result.slice(1, -1).trim();
    }
  }

  return result;
}

function normalizePrivateKey(value) {
  return cleanEnv(value)
    .replace(/\\r?\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function getServiceAccount() {
  const json = cleanEnv(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);

  if (json) {
    let parsed;

    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(
        'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not valid JSON.'
      );
    }

    const projectId = cleanEnv(parsed.project_id);
    const clientEmail = cleanEnv(parsed.client_email);
    const privateKey = normalizePrivateKey(parsed.private_key);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Firebase service-account JSON is missing project_id, client_email, or private_key.'
      );
    }

    return { projectId, clientEmail, privateKey };
  }

  const projectId = cleanEnv(process.env.FIREBASE_ADMIN_PROJECT_ID);
  const clientEmail = cleanEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
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
      'FIREBASE_ADMIN_PRIVATE_KEY does not contain a valid PEM header.'
    );
  }

  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      'FIREBASE_ADMIN_PRIVATE_KEY does not contain a valid PEM footer.'
    );
  }

  return { projectId, clientEmail, privateKey };
}

export function getAdminApp() {
  if (cachedApp) return cachedApp;

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const { projectId, clientEmail, privateKey } = getServiceAccount();

  cachedApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${projectId}.firebasestorage.app`,
  });

  return cachedApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

export function getAdminBucket() {
  return getAdminStorage().bucket(
    process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      `${getServiceAccount().projectId}.firebasestorage.app`
  );
}
