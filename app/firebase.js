import {
  initializeApp,
  getApps,
  getApp,
} from 'firebase/app';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';


/* =========================================================
   FIREBASE CONFIG
   ========================================================= */

const config = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,

  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,

  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,

  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,

  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};


/* =========================================================
   CONFIG STATUS
   ========================================================= */

export const firebaseConfigured =
  Object.values(config).every(Boolean);


/* =========================================================
   FIREBASE APP
   ========================================================= */

const app =
  firebaseConfigured
    ? (
        getApps().length
          ? getApp()
          : initializeApp(config)
      )
    : null;


/* =========================================================
   FIREBASE SERVICES
   ========================================================= */

export const auth =
  app ? getAuth(app) : null;

export const db =
  app ? getFirestore(app) : null;

export const storage =
  app ? getStorage(app) : null;

export const googleProvider =
  app
    ? new GoogleAuthProvider()
    : null;


/* =========================================================
   AUTH EXPORTS
   ========================================================= */

export {
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
};


/* =========================================================
   FIRESTORE EXPORTS
   ========================================================= */

export {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,

  collection,
  getDocs,

  /* IMPORTANT */
  addDoc,

  query,
  orderBy,
  where,
  serverTimestamp,
};


/* =========================================================
   STORAGE EXPORTS
   ========================================================= */

export {
  ref,
  uploadBytes,
  getDownloadURL,
};