import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from './firebase-admin';

export async function verifyBearerToken(request) {
  const authorization = request.headers.get('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization bearer token.');
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    throw new Error('Missing bearer token.');
  }

  return getAdminAuth().verifyIdToken(token);
}

export async function getAdminUserFromRequest(request) {
  const decoded = await verifyBearerToken(request);
  const db = getAdminDb();

  const snap = await db.collection('users').doc(decoded.uid).get();

  if (!snap.exists) {
    throw new Error('Admin profile not found.');
  }

  const profile = snap.data() || {};

  if (profile.role !== 'admin') {
    throw new Error('Admin access required.');
  }

  if (profile.disabled === true) {
    throw new Error('This admin account is disabled.');
  }

  return {
    uid: decoded.uid,
    auth: decoded,
    profile,
  };
}

export function jsonError(error, status = 500) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred.';

  return NextResponse.json(
    { ok: false, error: message },
    { status }
  );
}
