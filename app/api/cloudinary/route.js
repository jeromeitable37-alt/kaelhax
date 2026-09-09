import crypto from 'node:crypto';

export const runtime = 'nodejs';

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY;

  const missing = [
    !projectId ? 'FIREBASE_ADMIN_PROJECT_ID' : '',
    !clientEmail ? 'FIREBASE_ADMIN_CLIENT_EMAIL' : '',
    !privateKey ? 'FIREBASE_ADMIN_PRIVATE_KEY' : '',
    !apiKey ? 'NEXT_PUBLIC_FIREBASE_API_KEY (or FIREBASE_WEB_API_KEY)' : '',
  ].filter(Boolean);

  if (missing.length) {
    const error = new Error(`Firebase server configuration is incomplete. Missing: ${missing.join(', ')}`);
    error.code = 'FIREBASE_CONFIG_MISSING';
    throw error;
  }

  return { projectId, clientEmail, privateKey, apiKey };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createServiceAccountAssertion({ clientEmail, privateKey, scope }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

async function getGoogleAccessToken() {
  const { clientEmail, privateKey } = getFirebaseConfig();
  const assertion = createServiceAccountAssertion({
    clientEmail,
    privateKey,
    scope: 'https://www.googleapis.com/auth/datastore',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || `Google OAuth token request failed (HTTP ${response.status}).`);
  }
  return payload.access_token;
}

async function getFirestoreUser(uid) {
  const { projectId } = getFirebaseConfig();
  const accessToken = await getGoogleAccessToken();
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 404) return {};
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Firestore request failed (HTTP ${response.status}).`);
  }
  return firestoreFieldsToObject(payload?.fields || {});
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(firestoreValueToJs);
  if ('mapValue' in value) return firestoreFieldsToObject(value.mapValue?.fields || {});
  return undefined;
}

function firestoreFieldsToObject(fields) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, firestoreValueToJs(value)])
  );
}

async function requireUser(request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Missing Firebase authentication token.');

  const { apiKey } = getFirebaseConfig();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      cache: 'no-store',
    }
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(payload?.users) || !payload.users[0]?.localId) {
    throw new Error(payload?.error?.message || 'Invalid or expired Firebase authentication token.');
  }

  return { decoded: { uid: payload.users[0].localId, email: payload.users[0].email || '' } };
}

async function requireAdmin(request) {
  const { decoded } = await requireUser(request);
  const profile = await getFirestoreUser(decoded.uid);

  if (profile?.role !== 'admin' || profile?.disabled === true) {
    throw new Error('Administrator access required.');
  }

  return { decoded, profile };
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
      const profile = await getFirestoreUser(decoded.uid);
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
      error?.code === 'CLOUDINARY_CONFIG_MISSING' || error?.code === 'FIREBASE_CONFIG_MISSING' ? 503 :
      /authentication|token|invalid or expired/i.test(message) ? 401 :
      /missing|required/i.test(message) ? 400 :
      500;
    return jsonError(error, status);
  }
}
