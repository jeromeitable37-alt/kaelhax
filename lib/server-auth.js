import { cert, getApps, getApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin environment variables are missing."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const adminApp = getFirebaseAdminApp();

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

export async function verifyBearerToken(request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization bearer token.");
  }

  const token = authorization.substring(7).trim();

  if (!token) {
    throw new Error("Missing bearer token.");
  }

  return await adminAuth.verifyIdToken(token);
}

export async function getAdminUserFromRequest(request) {
  const decoded = await verifyBearerToken(request);

  const snap = await adminDb
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!snap.exists) {
    throw new Error("Admin profile not found.");
  }

  const profile = snap.data();

  if (profile?.role !== "admin") {
    throw new Error("Admin access required.");
  }

  if (profile?.disabled === true) {
    throw new Error("This admin account is disabled.");
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
      : typeof error === "string"
        ? error
        : "An unexpected error occurred.";

  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status }
  );
}

export { adminAuth, adminDb };