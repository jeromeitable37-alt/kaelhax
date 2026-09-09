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
    !apiKey ? 'NEXT_PUBLIC_FIREBASE_API_KEY/FIREBASE_WEB_API_KEY' : '',
  ].filter(Boolean);

  if (missing.length) {
    const error = new Error(`Firebase configuration is incomplete. Missing: ${missing.join(', ')}`);
    error.code = 'FIREBASE_CONFIG_MISSING';
    throw error;
  }
  return { projectId, clientEmail, privateKey, apiKey };
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

  const { apiKey, projectId } = getFirebaseConfig();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.users?.[0]?.localId) {
    const message = payload?.error?.message || 'Firebase token verification failed.';
    const error = new Error(message);
    error.code = 'AUTH_INVALID';
    throw error;
  }
  const user = payload.users[0];
  if (user.firebase?.sign_in_provider === 'anonymous') {
    // Anonymous users are allowed to authenticate, but cannot administer the media library.
  }
  return { uid: user.localId, projectId, token, user };
}

async function getFirestoreUserProfile(uid, token) {
  const { projectId } = getFirebaseConfig();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === 404) return {};
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Firestore profile lookup failed (HTTP ${response.status}).`);
  const fields = payload?.fields || {};
  const value = (field) => {
    const item = fields[field];
    if (!item) return undefined;
    if (item.stringValue !== undefined) return item.stringValue;
    if (item.booleanValue !== undefined) return item.booleanValue;
    if (item.integerValue !== undefined) return Number(item.integerValue);
    return undefined;
  };
  return { role: value('role'), disabled: value('disabled') };
}

async function requireUser(request) {
  const auth = await verifyFirebaseToken(request);
  return { ...auth, profile: await getFirestoreUserProfile(auth.uid, auth.token) };
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
  if (!isOwnProfile && !isProductLibrary && !isPaymentAsset) throw new Error('You are not allowed to upload to this Cloudinary folder.');
  return normalized;
}

function jsonError(error, status = 500) {
  return Response.json({ ok: false, error: error?.message || 'Cloudinary request failed.' }, { status });
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
      return Response.json({ ok: true, cloudName, apiKey, timestamp, signature: signCloudinaryParams(params, apiSecret), folder, publicIdPrefix: folder, tags: 'kaelhax' });
    }

    await requireAdmin(request);
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const endpoint = new URL(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image/upload`);
    endpoint.searchParams.set('prefix', 'kaelhax/products/');
    endpoint.searchParams.set('max_results', '100');
    const response = await fetch(endpoint, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || `Cloudinary library request failed (HTTP ${response.status}).`);
    const assets = (payload?.resources || []).filter((item) => {
      if (!search) return true;
      return [item.public_id, item.display_name, item.format, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(search);
    }).map((item) => ({ publicId: item.public_id, secureUrl: item.secure_url, url: item.url, width: item.width, height: item.height, bytes: item.bytes, format: item.format, createdAt: item.created_at, folder: item.asset_folder || item.folder || '', displayName: item.display_name || item.public_id.split('/').pop(), tags: item.tags || [] }));
    return Response.json({ ok: true, assets });
  } catch (error) {
    const status = error?.code === 'CLOUDINARY_CONFIG_MISSING' || error?.code === 'FIREBASE_CONFIG_MISSING' ? 503 : error?.code === 'AUTH_MISSING' || error?.code === 'AUTH_INVALID' ? 401 : error?.code === 'ADMIN_REQUIRED' ? 403 : 500;
    console.error('Cloudinary API error:', error);
    return jsonError(error, status);
  }
}
