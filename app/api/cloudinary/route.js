import crypto from 'node:crypto';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

function getFirebaseAdminApp() {
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin environment variables are missing.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    const missing = [
      !cloudName ? 'CLOUDINARY_CLOUD_NAME' : '',
      !apiKey ? 'CLOUDINARY_API_KEY' : '',
      !apiSecret ? 'CLOUDINARY_API_SECRET' : '',
    ].filter(Boolean);
    const error = new Error(`Cloudinary is not configured on this deployment. Missing: ${missing.join(', ')}`);
    error.code = 'CLOUDINARY_CONFIG_MISSING';
    throw error;
  }

  return { cloudName, apiKey, apiSecret };
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function requireUser(request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Missing Firebase authentication token.');

  const app = getFirebaseAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  return { app, decoded };
}

async function requireAdmin(request) {
  const { app, decoded } = await requireUser(request);
  const db = getFirestore(app);
  const snap = await db.collection('users').doc(decoded.uid).get();
  const profile = snap.exists ? snap.data() : {};

  if (profile?.role !== 'admin' || profile?.disabled === true) {
    throw new Error('Administrator access required.');
  }

  return { app, decoded, db };
}

function signCloudinaryParams(params, apiSecret) {
  const serialized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex');
}

function validateFolder(folder, uid, isAdmin) {
  const normalized = String(folder || '').replace(/\\/g, '/').replace(/\/+$/, '');

  if (!normalized.startsWith('kaelhax/')) {
    throw new Error('Invalid Cloudinary folder.');
  }

  const isOwnProfile = normalized === `kaelhax/profiles/${uid}`;
  const isProductLibrary = isAdmin && normalized === 'kaelhax/products';
  const isPaymentAsset = isAdmin && normalized === 'kaelhax/payment';

  if (!isOwnProfile && !isProductLibrary && !isPaymentAsset) {
    throw new Error('You are not allowed to upload to this Cloudinary folder.');
  }

  return normalized;
}

function jsonError(error, status = 500) {
  return Response.json(
    { ok: false, error: error?.message || 'Cloudinary request failed.' },
    { status }
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'images';

    if (action === 'signature') {
      const { decoded } = await requireUser(request);
      const app = getFirebaseAdminApp();
      const profileSnap = await getFirestore(app).collection('users').doc(decoded.uid).get();
      const profile = profileSnap.exists ? profileSnap.data() : {};
      const isAdmin = profile?.role === 'admin' && profile?.disabled !== true;
      const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
      const folder = validateFolder(url.searchParams.get('folder'), decoded.uid, isAdmin);
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        folder,
        public_id_prefix: folder,
        tags: 'kaelhax',
        timestamp,
      };

      return Response.json({
        ok: true,
        cloudName,
        apiKey,
        timestamp,
        signature: signCloudinaryParams(params, apiSecret),
        folder,
        publicIdPrefix: folder,
        tags: 'kaelhax',
      });
    }

    await requireAdmin(request);
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();

    const endpoint = new URL(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload`
    );
    endpoint.searchParams.set('prefix', 'kaelhax/products/');
    endpoint.searchParams.set('max_results', '100');

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Cloudinary library request failed (HTTP ${response.status}).`);
    }

    const assets = (payload?.resources || [])
      .filter((item) => {
        if (!search) return true;
        const haystack = [
          item.public_id,
          item.display_name,
          item.format,
          ...(item.tags || []),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      })
      .map((item) => ({
        publicId: item.public_id,
        secureUrl: item.secure_url,
        url: item.url,
        width: item.width,
        height: item.height,
        bytes: item.bytes,
        format: item.format,
        createdAt: item.created_at,
        folder: item.asset_folder || item.folder || '',
        displayName: item.display_name || item.public_id.split('/').pop(),
        tags: item.tags || [],
      }));

    return Response.json({ ok: true, assets });
  } catch (error) {
    const message = error?.message || 'Cloudinary request failed.';
    const status =
      error?.code === 'CLOUDINARY_CONFIG_MISSING' ? 503 :
      /authentication|token/i.test(message) ? 401 :
      /missing|required/i.test(message) ? 400 :
      500;
    return jsonError(error, status);
  }
}
