import crypto from 'node:crypto';

export const runtime = 'nodejs';

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY;
  const missing = [
    !projectId ? 'FIREBASE_ADMIN_PROJECT_ID/NEXT_PUBLIC_FIREBASE_PROJECT_ID' : '',
    !apiKey ? 'NEXT_PUBLIC_FIREBASE_API_KEY/FIREBASE_WEB_API_KEY' : '',
  ].filter(Boolean);
  if (missing.length) {
    const error = new Error(`Firebase configuration is incomplete. Missing: ${missing.join(', ')}`);
    error.code = 'FIREBASE_CONFIG_MISSING';
    throw error;
  }
  return { projectId, apiKey };
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const missing = [
    !cloudName ? 'CLOUDINARY_CLOUD_NAME' : '',
    !apiKey ? 'CLOUDINARY_API_KEY' : '',
    !apiSecret ? 'CLOUDINARY_API_SECRET' : '',
  ].filter(Boolean);
  if (missing.length) {
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

async function verifyFirebaseToken(request) {
  const token = bearerToken(request);
  if (!token) {
    const error = new Error('Missing Firebase authentication token.');
    error.code = 'AUTH_MISSING';
    throw error;
  }

  const { apiKey } = getFirebaseConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      cache: 'no-store',
    },
  );

  const payload = await response.json().catch(() => null);
  const uid = payload?.users?.[0]?.localId;
  if (!response.ok || !uid) {
    const error = new Error(payload?.error?.message || 'Firebase token verification failed.');
    error.code = 'AUTH_INVALID';
    throw error;
  }

  return { uid, token };
}

async function getUserProfile(uid, token) {
  const { projectId } = getFirebaseConfig();
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}`;

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (response.status === 404) return {};
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Firestore profile lookup failed (HTTP ${response.status}).`);
  }

  const fields = payload?.fields || {};
  const readField = (name) => {
    const value = fields[name];
    if (!value) return undefined;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.integerValue !== undefined) return Number(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    return undefined;
  };

  return {
    role: readField('role'),
    disabled: readField('disabled'),
  };
}

async function requireUser(request) {
  const auth = await verifyFirebaseToken(request);
  const profile = await getUserProfile(auth.uid, auth.token);
  return { ...auth, profile };
}

async function requireAdmin(request) {
  const auth = await requireUser(request);
  if (auth.profile?.role !== 'admin' || auth.profile?.disabled === true) {
    const error = new Error('Administrator access required.');
    error.code = 'ADMIN_REQUIRED';
    throw error;
  }
  return auth;
}

function signCloudinaryParams(params, apiSecret) {
  const serialized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex');
}

function validateFolder(folder, uid, isAdmin) {
  const normalized = String(folder || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized.startsWith('kaelhax/')) throw new Error('Invalid Cloudinary folder.');

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
    { status },
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'images';

    if (action === 'signature') {
      const { uid, profile } = await requireUser(request);
      const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
      const isAdmin = profile?.role === 'admin' && profile?.disabled !== true;
      const folder = validateFolder(url.searchParams.get('folder'), uid, isAdmin);
      const timestamp = Math.floor(Date.now() / 1000);
      const params = { folder, public_id_prefix: folder, tags: 'kaelhax', timestamp };

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
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload`,
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
    const status =
      error?.code === 'CLOUDINARY_CONFIG_MISSING' || error?.code === 'FIREBASE_CONFIG_MISSING' ? 503 :
      error?.code === 'AUTH_MISSING' || error?.code === 'AUTH_INVALID' ? 401 :
      error?.code === 'ADMIN_REQUIRED' ? 403 :
      500;

    console.error('Cloudinary API error:', error);
    return jsonError(error, status);
  }
}
