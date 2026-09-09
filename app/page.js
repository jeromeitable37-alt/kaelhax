'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  firebaseConfigured,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  db,
  storage,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  ref,
  uploadBytes,
  getDownloadURL,
} from './firebase';


const STORAGE_KEY =
  'kaelhax-nexorium-v4';

const ACCOUNTS_KEY =
  'kaelhax-local-accounts-v1';

const SESSION_KEY =
  'kaelhax-local-session-v1';


const DEFAULT = {
  brand: 'KAELHAX',

  subbrand:
    'NEXORIUM CHANNEL',

  telegram:
    'https://t.me/kaelpo21',

  payment: {
    merchantName:
      'EL**N T.',

    qrImage:
      '/gcash-payment-qr.png',

    gcashOpenUrl:
      '',

    note:
      'After paying, keep your GCash reference number. Orders are released only after payment is verified.',
  },

  hero:
    'PREMIUM GAMING HUB',

  heroText:
    'A neon command center for KAELHAX updates, showcases, community support, legitimate gaming utilities, and digital resources.',

  announcement:
    'WELCOME TO NEXORIUM // SYSTEM ONLINE',

  stats: {
    online:
      '24/7',

    community:
      'PH',

    uptime:
      '99%',

    response:
      '< 1m',
  },

  products: [
    {
      name:
        'Nexorium UI Showcase',

      version:
        'SHOWCASE',

      status:
        'LIVE',

      desc:
        'A polished interface preview for channel branding, product presentation, and community landing pages.',

      price:
        'FREE',

      duration:
        'One-time',

      deliveryUrl:
        '',

      image:
        '/panel-showcase.png',
    },

    {
      name:
        'KAELHAX Updates',

      version:
        'LATEST',

      status:
        'ONLINE',

      desc:
        'Release notes, news, previews, and community announcements connected directly to Telegram.',

      price:
        'FREE',

      duration:
        'One-time',

      deliveryUrl:
        '',

      image:
        '/panel-showcase.png',
    },

    {
      name:
        'Gaming Utility Hub',

      version:
        'TOOLS',

      status:
        'READY',

      desc:
        'A landing area for legitimate utilities, guides, presets, downloads, tournaments, and resources.',

      price:
        'FREE',

      duration:
        'One-time',

      deliveryUrl:
        '',

      image:
        '/panel-showcase.png',
    },
  ],

  faq: [
    [
      'How do I get the latest updates?',
      'Use the Telegram button or join the NEXORIUM channel for announcements, release posts, and support.',
    ],

    [
      'Can I change the text and images?',
      'Yes. Open Admin Dashboard, edit the content, then save. Changes are persisted in Firebase when configured.',
    ],

    [
      'Can I create an account?',
      'Yes. Register with email and password, or use Google when Firebase is configured.',
    ],

    [
      'Can this be deployed on Vercel?',
      'Yes. It is a standard Next.js app. Add your Firebase and server environment variables before deployment.',
    ],
  ],
};


const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
  ''
)
  .split(',')
  .map(
    (value) =>
      value.trim().toLowerCase()
  )
  .filter(Boolean);


function Icon({
  children,
}) {
  return (
    <span className="ico">
      {children}
    </span>
  );
}


function readLocalAccounts() {
  try {
    return JSON.parse(
      localStorage.getItem(
        ACCOUNTS_KEY
      ) || '[]'
    );
  } catch {
    return [];
  }
}


function maskUsername(value) {
  const text =
    String(
      value || 'USER'
    ).trim();

  if (
    text.length <= 4
  ) {
    return `${text.slice(
      0,
      2
    )}****`;
  }

  return `${text.slice(
    0,
    2
  )}****${text.slice(
    -2
  )}`;
}


function normalizeSiteData(parsed) {
  const productImages = parsed?.productImages && typeof parsed.productImages === 'object'
    ? parsed.productImages : {};
  const rawProducts = Array.isArray(parsed?.products) ? parsed.products : DEFAULT.products;
  const products = rawProducts.map((product, index) => {
    const id = String(product?.id || `product-${index + 1}`);
    const directImage = String(product?.image || '').trim();
    const mappedImage = String(productImages[id] || '').trim();
    return { ...product, id, image: mappedImage || directImage, imageVersion: product?.imageVersion || 0 };
  });
  return {
    ...DEFAULT,
    ...(parsed || {}),
    productImages,
    products,
    payment: { ...DEFAULT.payment, ...((parsed || {}).payment || {}), qrImage: parsed?.payment?.qrImage || DEFAULT.payment.qrImage },
    stats: { ...DEFAULT.stats, ...((parsed || {}).stats || {}) },
    faq: Array.isArray(parsed?.faq) ? parsed.faq : DEFAULT.faq,
  };
}


/*
 * =========================================================
 * COMPRESS RECEIPT FOR FIRESTORE
 *
 * No Firebase Storage required.
 *
 * Firestore has a document-size limit, so the receipt is
 * resized/compressed before being stored.
 * =========================================================
 */

async function compressReceipt(
  file
) {
  if (!file) {
    throw new Error(
      'Please select a receipt image.'
    );
  }

  return new Promise(
    (
      resolve,
      reject
    ) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          const image =
            new Image();

          image.onload =
            () => {
              const MAX_WIDTH =
                1200;

              const scale =
                Math.min(
                  1,
                  MAX_WIDTH /
                    image.width
                );

              const width =
                Math.round(
                  image.width *
                    scale
                );

              const height =
                Math.round(
                  image.height *
                    scale
                );

              const canvas =
                document.createElement(
                  'canvas'
                );

              canvas.width =
                width;

              canvas.height =
                height;

              const context =
                canvas.getContext(
                  '2d'
                );

              if (!context) {
                reject(
                  new Error(
                    'Could not process receipt image.'
                  )
                );

                return;
              }

              context.drawImage(
                image,
                0,
                0,
                width,
                height
              );

              let quality =
                0.72;

              let result =
                canvas.toDataURL(
                  'image/jpeg',
                  quality
                );

              /*
               * Keep reducing size until the
               * encoded image is comfortably
               * below the Firestore document
               * limit.
               */
              while (
                result.length >
                  700000 &&
                quality > 0.35
              ) {
                quality -=
                  0.05;

                result =
                  canvas.toDataURL(
                    'image/jpeg',
                    quality
                  );
              }

              if (
                result.length >
                850000
              ) {
                reject(
                  new Error(
                    'Receipt image is too large. Please use a smaller screenshot.'
                  )
                );

                return;
              }

              resolve(
                result
              );
            };

          image.onerror =
            () => {
              reject(
                new Error(
                  'Could not read the receipt image.'
                )
              );
            };

          image.src =
            String(
              reader.result
            );
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              'Could not read the receipt file.'
            )
          );
        };

      reader.readAsDataURL(
        file
      );
    }
  );
}


export default function Home() {
  const [data, setData] =
    useState(DEFAULT);

  const [menu, setMenu] =
    useState(false);

  const [community, setCommunity] =
    useState(false);

  const [checkout, setCheckout] =
    useState(null);

  const [paymentStep, setPaymentStep] =
    useState('method');

  const [faq, setFaq] =
    useState(0);

  const [admin, setAdmin] =
    useState(false);

  const [adminTab, setAdminTab] =
    useState('overview');

  const [saved, setSaved] =
    useState(false);

  const [toast, setToast] =
    useState('');

  const [qrPreview, setQrPreview] =
    useState('');

  const [imagePreview, setImagePreview] =
    useState(
      '/panel-showcase.png'
    );

  const [user, setUser] =
    useState(null);

  const [localSession, setLocalSession] =
    useState(null);

  const [authBusy, setAuthBusy] =
    useState(false);

  const [authError, setAuthError] =
    useState('');

  const [authMode, setAuthMode] =
    useState(null);

  const [authForm, setAuthForm] =
    useState({
      name: '',
      email: '',
      password: '',
    });

  const [theme, setTheme] =
    useState('dark');

  const [cloudRole, setCloudRole] =
    useState('member');

  const [cloudDisabled, setCloudDisabled] =
    useState(false);

  const [cloudReady, setCloudReady] =
    useState(false);

  const [orders, setOrders] =
    useState([]);

  const [myOrders, setMyOrders] =
    useState([]);

  const [showMyOrders, setShowMyOrders] =
    useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '' });

  const [receiptFile, setReceiptFile] =
    useState(null);

  const [paymentReference, setPaymentReference] =
    useState('');

  const [orderSubmitting, setOrderSubmitting] =
    useState(false);

  const [submittedOrder, setSubmittedOrder] =
    useState(null);

  const [aiOpen, setAiOpen] =
    useState(false);

  const [aiBusy, setAiBusy] =
    useState(false);

  const [aiInput, setAiInput] =
    useState('');

  const [aiMessages, setAiMessages] =
    useState([
      {
        role:
          'assistant',

        content:
          'NEXORIUM AI is online. Ask about the showcase, registration, checkout, or support.',
      },
    ]);

  const aiEndRef =
    useRef(null);


  const currentUser =
    user ||
    localSession;


  const isAdmin =
    Boolean(
      currentUser &&
        (
          firebaseConfigured
            ? cloudRole ===
                'admin' &&
              !cloudDisabled
            : currentUser.isAdmin ||
              ADMIN_EMAILS.includes(
                (
                  currentUser.email ||
                  ''
                ).toLowerCase()
              )
        )
    );


  const accountLabel =
    currentUser?.displayName ||
    currentUser?.name ||
    currentUser?.email
      ?.split('@')[0] ||
    'ACCOUNT';


  /*
   * =========================================================
   * INITIAL LOCAL DATA
   * =========================================================
   */

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (raw) {
        const parsed =
          JSON.parse(raw);

        const merged =
          normalizeSiteData(
            parsed
          );

        setData(
          merged
        );

        setImagePreview(
          merged.products?.[0]
            ?.image ||
            '/panel-showcase.png'
        );

        setQrPreview(
          merged.payment
            ?.qrImage ||
            '/gcash-payment-qr.png'
        );
      }

      const session =
        localStorage.getItem(
          SESSION_KEY
        );

      if (session) {
        setLocalSession(
          JSON.parse(session)
        );
      }
    } catch {}
  }, []);


  /*
   * =========================================================
   * FIREBASE AUTH
   * =========================================================
   */

  useEffect(() => {
    if (!auth) {
      return undefined;
    }

    return onAuthStateChanged(
      auth,
      async (
        nextUser
      ) => {
        setUser(
          nextUser
        );

        if (nextUser) {
          setLocalSession(
            null
          );

          try {
            await ensureCloudProfile(
              nextUser
            );
          } catch (
            error
          ) {
            console.error(
              'Profile setup failed:',
              error
            );
          }
        }
      }
    );
  }, []);


  /*
   * =========================================================
   * THEME
   * =========================================================
   */

  useEffect(() => {
    try {
      const storedTheme =
        localStorage.getItem(
          'kaelhax-theme-v1'
        );

      const nextTheme =
        storedTheme ===
          'light' ||
        storedTheme ===
          'dark'
          ? storedTheme
          : window
              .matchMedia?.(
                '(prefers-color-scheme: light)'
              )
              .matches
            ? 'light'
            : 'dark';

      setTheme(
        nextTheme
      );

      document.documentElement.dataset.theme =
        nextTheme;
    } catch {}
  }, []);


  useEffect(() => {
    try {
      document.documentElement.dataset.theme =
        theme;

      localStorage.setItem(
        'kaelhax-theme-v1',
        theme
      );
    } catch {}
  }, [theme]);


  /*
   * =========================================================
   * AI AUTO-SCROLL
   * =========================================================
   */

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({
      behavior:
        'smooth',
    });
  }, [
    aiMessages,
    aiOpen,
  ]);


  /*
   * =========================================================
   * USER PROFILE
   * =========================================================
   */

  useEffect(() => {
    if (
      !firebaseConfigured ||
      !currentUser ||
      !db
    ) {
      setCloudRole(
        'member'
      );

      setCloudDisabled(
        false
      );

      setCloudReady(
        firebaseConfigured &&
          Boolean(
            currentUser
          )
      );

      return undefined;
    }

    let active =
      true;

    const userRef =
      doc(
        db,
        'users',
        currentUser.uid
      );

    const unsubscribe =
      onSnapshot(
        userRef,
        (
          snap
        ) => {
          if (!active) {
            return;
          }

          const profile =
            snap.exists()
              ? snap.data()
              : {};

          setCloudRole(
            profile.role ||
              'member'
          );

          setCloudDisabled(
            Boolean(
              profile.disabled
            )
          );

          setCloudReady(
            true
          );
        },
        (
          error
        ) => {
          console.error(
            'User profile listener failed:',
            error
          );

          setCloudReady(
            false
          );
        }
      );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    currentUser?.uid,
  ]);


  useEffect(() => {
    setProfileForm({ name: currentUser?.displayName || currentUser?.name || '' });
  }, [currentUser?.uid, currentUser?.displayName, currentUser?.name]);

  async function saveUserProfile() {
    if (!currentUser || !auth || !db || !firebaseConfigured) { flash('Please sign in with Firebase first.'); return; }
    const name = profileForm.name.trim();
    if (!name) { flash('Please enter a display name.'); return; }
    setProfileBusy(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { displayName: name, updatedAt: serverTimestamp() });
      flash('Profile updated successfully.');
      setShowProfile(false);
    } catch (error) {
      console.error('Profile update failed:', error);
      flash(error?.message || 'Could not update profile.');
    } finally { setProfileBusy(false); }
  }

  async function uploadUserProfilePhoto(file) {
    if (!file || !auth?.currentUser || !storage || !db) return;
    setProfileBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const photoRef = ref(storage, `profiles/${auth.currentUser.uid}/${Date.now()}-${safeName}`);
      await uploadBytes(photoRef, file, { contentType: file.type || 'image/jpeg' });
      const url = await getDownloadURL(photoRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: url, updatedAt: serverTimestamp() });
      flash('Profile photo updated.');
    } catch (error) {
      console.error('Profile photo upload failed:', error);
      flash(error?.message || 'Could not update profile photo.');
    } finally { setProfileBusy(false); }
  }

  async function sendUserPasswordReset() {
    if (!auth?.currentUser?.email) { flash('No email address is available for this account.'); return; }
    setProfileBusy(true);
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      flash(`Password reset email sent to ${auth.currentUser.email}.`);
    } catch (error) {
      console.error('Password reset failed:', error);
      flash(error?.message || 'Could not send password reset email.');
    } finally { setProfileBusy(false); }
  }

  /*
   * =========================================================
   * SITE CONFIG
   * =========================================================
   */

  useEffect(() => {
    if (
      !firebaseConfigured ||
      !db
    ) {
      return undefined;
    }

    const siteRef =
      doc(
        db,
        'site',
        'config'
      );

    return onSnapshot(
      siteRef,
      (
        snap
      ) => {
        if (!snap.exists()) {
          return;
        }

        const merged =
          normalizeSiteData(
            snap.data()
          );

        setData(
          merged
        );

        setImagePreview(
          merged.products?.[0]
            ?.image ||
            '/panel-showcase.png'
        );

        setQrPreview(
          merged.payment?.qrImage ||
            '/gcash-payment-qr.png'
        );
      },
      (
        error
      ) => {
        console.error(
          'Site config error:',
          error
        );
      }
    );
  }, []);


  /*
   * =========================================================
   * ADMIN ORDERS
   * =========================================================
   */

  useEffect(() => {
    if (
      !firebaseConfigured ||
      !db ||
      !isAdmin
    ) {
      setOrders(
        []
      );

      return undefined;
    }

    const ordersRef =
      collection(
        db,
        'orders'
      );

    return onSnapshot(
      ordersRef,
      (
        snap
      ) => {
        const next =
          snap.docs.map(
            (item) => ({
              id:
                item.id,

              ...item.data(),
            })
          );

        next.sort(
          (
            a,
            b
          ) =>
            (
              b.createdAt
                ?.seconds ||
              0
            ) -
            (
              a.createdAt
                ?.seconds ||
              0
            )
        );

        setOrders(
          next
        );
      },
      (
        error
      ) => {
        console.error(
          'Could not read orders:',
          error
        );

        setOrders(
          []
        );
      }
    );
  }, [isAdmin]);


  /*
   * =========================================================
   * MY ORDERS
   * =========================================================
   */

  useEffect(() => {
    if (
      !firebaseConfigured ||
      !db ||
      !currentUser?.uid
    ) {
      setMyOrders(
        []
      );

      return undefined;
    }

    const ownOrders =
      query(
        collection(
          db,
          'orders'
        ),
        where(
          'userId',
          '==',
          currentUser.uid
        )
      );

    return onSnapshot(
      ownOrders,
      (
        snap
      ) => {
        const next =
          snap.docs.map(
            (item) => ({
              id:
                item.id,

              ...item.data(),
            })
          );

        next.sort(
          (
            a,
            b
          ) =>
            (
              b.createdAt
                ?.seconds ||
              0
            ) -
            (
              a.createdAt
                ?.seconds ||
              0
            )
        );

        setMyOrders(
          next
        );
      },
      (
        error
      ) => {
        console.error(
          'Could not read own orders:',
          error
        );

        setMyOrders(
          []
        );
      }
    );
  }, [
    currentUser?.uid,
  ]);


  /*
   * =========================================================
   * CREATE CLOUD PROFILE
   * =========================================================
   */

  async function ensureCloudProfile(
    nextUser
  ) {
    if (
      !firebaseConfigured ||
      !db ||
      !nextUser
    ) {
      return;
    }

    const userRef =
      doc(
        db,
        'users',
        nextUser.uid
      );

    const snap =
      await getDoc(
        userRef
      );

    if (
      !snap.exists()
    ) {
      await setDoc(
        userRef,
        {
          email:
            nextUser.email ||
            '',

          displayName:
            nextUser.displayName ||
            '',

          role:
            'member',

          disabled:
            false,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );
    } else {
      await setDoc(
        userRef,
        {
          email:
            nextUser.email ||
            snap.data()
              .email ||
            '',

          displayName:
            nextUser.displayName ||
            snap.data()
              .displayName ||
            '',

          updatedAt:
            serverTimestamp(),
        },
        {
          merge:
            true,
        }
      );
    }
  }


  /*
   * =========================================================
   * AI
   * =========================================================
   */

  async function sendAiMessage(
    seedText
  ) {
    const text =
      (
        seedText ??
        aiInput
      ).trim();

    if (
      !text ||
      aiBusy
    ) {
      return;
    }

    setAiInput(
      ''
    );

    const nextMessages =
      [
        ...aiMessages,

        {
          role:
            'user',

          content:
            text,
        },
      ];

    setAiMessages(
      nextMessages
    );

    setAiBusy(
      true
    );

    try {
      const response =
        await fetch(
          '/api/ai',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                message:
                  text,

                history:
                  nextMessages.slice(
                    -8
                  ),

                context: {
                  brand:
                    data.brand,

                  products:
                    data.products.map(
                      (
                        product
                      ) => ({
                        name:
                          product.name,

                        version:
                          product.version,

                        status:
                          product.status,

                        price:
                          product.price,

                        desc:
                          product.desc,
                      })
                    ),

                  payment: {
                    merchantName:
                      data.payment
                        .merchantName,

                    note:
                      data.payment.note,
                  },

                  faq:
                    data.faq,

                  support:
                    'Telegram community support',
                },
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
            'AI support is unavailable right now.'
        );
      }

      setAiMessages(
        (
          prev
        ) => [
          ...prev,

          {
            role:
              'assistant',

            content:
              result.answer,
          },
        ]
      );
    } catch (
      error
    ) {
      setAiMessages(
        (
          prev
        ) => [
          ...prev,

          {
            role:
              'assistant',

            content:
              error?.message ||
              'I could not reach NEXORIUM AI. Please use Telegram support instead.',
          },
        ]
      );
    } finally {
      setAiBusy(
        false
      );
    }
  }


  function toggleTheme() {
    setTheme(
      (
        value
      ) =>
        value ===
          'dark'
          ? 'light'
          : 'dark'
    );
  }


  /*
   * =========================================================
   * TOAST
   * =========================================================
   */

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer =
      setTimeout(
        () =>
          setToast(
            ''
          ),
        2600
      );

    return () =>
      clearTimeout(
        timer
      );
  }, [toast]);


  const adminTabs =
    useMemo(
      () => [
        [
          'overview',
          '◈',
          'Overview',
        ],

        [
          'content',
          '✦',
          'Content',
        ],

        [
          'products',
          '▦',
          'Products',
        ],

        [
          'payments',
          '₱',
          'Payments',
        ],

        [
          'orders',
          '◉',
          'Orders',
        ],

        [
          'accounts',
          '◎',
          'Account',
        ],
      ],
      []
    );


  function flash(
    message
  ) {
    setToast(
      message
    );
  }


  /*
   * =========================================================
   * GOOGLE SIGN-IN
   * =========================================================
   */

  async function loginGoogle() {
    setAuthError(
      ''
    );

    if (
      !firebaseConfigured
    ) {
      setAuthError(
        'Google Sign-In is not configured. Enable Firebase Authentication → Google.'
      );

      setAuthMode(
        'login'
      );

      return;
    }

    if (
      !auth ||
      !googleProvider
    ) {
      setAuthError(
        'Firebase Authentication is unavailable.'
      );

      return;
    }

    try {
      setAuthBusy(
        true
      );

      await signInWithPopup(
        auth,
        googleProvider
      );

      setAuthMode(
        null
      );

      flash(
        'Google account connected.'
      );
    } catch (
      error
    ) {
      console.error(
        'Google sign-in failed:',
        error
      );

      setAuthError(
        error?.message ||
          'Google sign-in failed.'
      );
    } finally {
      setAuthBusy(
        false
      );
    }
  }


  /*
   * =========================================================
   * AUTH FORM
   * =========================================================
   */

  async function submitAuth(
    event
  ) {
    event.preventDefault();

    setAuthError(
      ''
    );

    const email =
      authForm.email
        .trim()
        .toLowerCase();

    if (
      !email ||
      authForm.password.length <
        6
    ) {
      setAuthError(
        'Enter a valid email and a password with at least 6 characters.'
      );

      return;
    }

    try {
      setAuthBusy(
        true
      );

      if (
        firebaseConfigured
      ) {
        if (
          authMode ===
          'register'
        ) {
          const credential =
            await createUserWithEmailAndPassword(
              auth,
              email,
              authForm.password
            );

          if (
            authForm.name.trim()
          ) {
            await updateProfile(
              credential.user,
              {
                displayName:
                  authForm.name.trim(),
              }
            );
          }

          flash(
            'Account registered successfully.'
          );
        } else {
          await signInWithEmailAndPassword(
            auth,
            email,
            authForm.password
          );

          flash(
            'Welcome back.'
          );
        }
      } else {
        const accounts =
          readLocalAccounts();

        if (
          authMode ===
          'register'
        ) {
          if (
            accounts.some(
              (
                account
              ) =>
                account.email ===
                email
            )
          ) {
            throw new Error(
              'An account with that email already exists.'
            );
          }

          const localUser =
            {
              id:
                crypto.randomUUID(),

              name:
                authForm.name.trim() ||
                email.split('@')[0],

              email,

              password:
                authForm.password,

              isAdmin:
                accounts.length ===
                0,
            };

          const nextAccounts =
            [
              ...accounts,
              localUser,
            ];

          localStorage.setItem(
            ACCOUNTS_KEY,
            JSON.stringify(
              nextAccounts
            )
          );

          const safeUser =
            {
              id:
                localUser.id,

              name:
                localUser.name,

              email,

              isAdmin:
                localUser.isAdmin,
            };

          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(
              safeUser
            )
          );

          setLocalSession(
            safeUser
          );

          flash(
            safeUser.isAdmin
              ? 'Registered. Admin is enabled for this local demo account.'
              : 'Account registered successfully.'
          );
        } else {
          const match =
            accounts.find(
              (
                account
              ) =>
                account.email ===
                  email &&
                account.password ===
                  authForm.password
            );

          if (!match) {
            throw new Error(
              'Incorrect email or password.'
            );
          }

          const safeUser =
            {
              id:
                match.id,

              name:
                match.name,

              email:
                match.email,

              isAdmin:
                match.isAdmin,
            };

          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(
              safeUser
            )
          );

          setLocalSession(
            safeUser
          );

          flash(
            'Welcome back.'
          );
        }
      }

      setAuthForm({
        name:
          '',

        email:
          '',

        password:
          '',
      });

      setAuthMode(
        null
      );
    } catch (
      error
    ) {
      console.error(
        'Authentication failed:',
        error
      );

      setAuthError(
        error?.message ||
          'Authentication failed.'
      );
    } finally {
      setAuthBusy(
        false
      );
    }
  }


  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */

  async function logout() {
    try {
      if (
        auth &&
        user
      ) {
        await signOut(
          auth
        );
      }
    } catch (
      error
    ) {
      console.error(
        'Logout failed:',
        error
      );
    }

    localStorage.removeItem(
      SESSION_KEY
    );

    setLocalSession(
      null
    );

    setUser(
      null
    );

    setAdmin(
      false
    );

    flash(
      'Signed out.'
    );
  }


  /*
   * =========================================================
   * ADMIN IMAGE UPLOAD
   * =========================================================
   */

  async function uploadAdminFile(
    file,
    folder
  ) {
    if (!file) {
      return '';
    }

    if (
      !firebaseConfigured ||
      !storage ||
      !currentUser
    ) {
      throw new Error(
        'Firebase Storage is required for admin image uploads.'
      );
    }

    if (!isAdmin) {
      throw new Error(
        'Admin access is required for this upload.'
      );
    }

    const safeName =
      file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        '-'
      );

    const objectRef =
      ref(
        storage,
        `${folder}/${currentUser.uid}/${Date.now()}-${safeName}`
      );

    await uploadBytes(
      objectRef,
      file,
      {
        contentType:
          file.type ||
          'image/*',
      }
    );

    return getDownloadURL(
      objectRef
    );
  }


  /*
   * =========================================================
   * SAVE SITE
   * =========================================================
   */

  async function save() {
    try {
      if (
        firebaseConfigured &&
        db
      ) {
        if (!isAdmin) {
          flash(
            'Admin access is required to save cloud content.'
          );

          return;
        }

        await setDoc(
          doc(
            db,
            'site',
            'config'
          ),
          {
            ...data,

            updatedAt:
              serverTimestamp(),
          },
          {
            merge:
              false,
          }
        );

        setQrPreview(
          data.payment?.qrImage ||
            ''
        );

        setImagePreview(
          data.products?.[0]
            ?.image ||
            '/panel-showcase.png'
        );

        setSaved(
          true
        );

        flash(
          'NEXORIUM settings synced to Firebase.'
        );
      } else {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            data
          )
        );

        setQrPreview(
          data.payment?.qrImage ||
            ''
        );

        setImagePreview(
          data.products?.[0]
            ?.image ||
            '/panel-showcase.png'
        );

        setSaved(
          true
        );

        flash(
          'Site settings saved locally.'
        );
      }

      setTimeout(
        () =>
          setSaved(
            false
          ),
        1600
      );
    } catch (
      error
    ) {
      console.error(
        'Save failed:',
        error
      );

      flash(
        error?.message ||
          'Save failed.'
      );
    }
  }


  /*
   * =========================================================
   * PRODUCT IMAGE
   * =========================================================
   */

  async function handleProductImage(
    index,
    file
  ) {
    if (!file) {
      return;
    }

    try {
      const url =
        await uploadAdminFile(
          file,
          'products'
        );

      updateProduct(
        index,
        {
          image:
            url,
        }
      );

      flash(
        'Image uploaded. Save to publish it.'
      );
    } catch (
      error
    ) {
      flash(
        error?.message ||
          'Image upload failed.'
      );
    }
  }


  /*
   * =========================================================
   * PAYMENT QR
   * =========================================================
   */

  async function handleQrImage(
    file
  ) {
    if (!file) {
      return;
    }

    try {
      const url =
        await uploadAdminFile(
          file,
          'payment'
        );

      setQrPreview(
        url
      );

      setData(
        (
          prev
        ) => ({
          ...prev,

          payment: {
            ...prev.payment,

            qrImage:
              url,
          },
        })
      );

      flash(
        'QR uploaded. Save to publish it.'
      );
    } catch (
      error
    ) {
      flash(
        error?.message ||
          'QR upload failed.'
      );
    }
  }


  /*
   * =========================================================
   * RESET
   * =========================================================
   */

  function resetSite() {
    localStorage.removeItem(
      STORAGE_KEY
    );

    setData(
      DEFAULT
    );

    setQrPreview(
      ''
    );

    setImagePreview(
      '/panel-showcase.png'
    );

    flash(
      'Default site content restored.'
    );
  }


  /*
   * =========================================================
   * EXPORT
   * =========================================================
   */

  function exportContent() {
    const blob =
      new Blob(
        [
          JSON.stringify(
            data,
            null,
            2
          ),
        ],
        {
          type:
            'application/json',
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const anchor =
      document.createElement(
        'a'
      );

    anchor.href =
      url;

    anchor.download =
      'kaelhax-nexorium-content.json';

    document.body.appendChild(
      anchor
    );

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(
      url
    );

    flash(
      'Content JSON exported.'
    );
  }


  /*
   * =========================================================
   * IMPORT
   * =========================================================
   */

  function importContent(
    file
  ) {
    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {
        try {
          const parsed =
            JSON.parse(
              reader.result
            );

          const merged =
            normalizeSiteData(
              parsed
            );

          setData(
            merged
          );

          setImagePreview(
            merged.products?.[0]
              ?.image ||
              '/panel-showcase.png'
          );

          setQrPreview(
            merged.payment?.qrImage ||
              '/gcash-payment-qr.png'
          );

          flash(
            'Content imported. Click Save Changes to persist it.'
          );
        } catch {
          flash(
            'That JSON file could not be imported.'
          );
        }
      };

    reader.readAsText(
      file
    );
  }


  /*
   * =========================================================
   * PRODUCT UPDATE
   * =========================================================
   */

  function updateProduct(
    index,
    patch
  ) {
    const products =
      data.products.map(
        (
          product,
          itemIndex
        ) =>
          itemIndex ===
          index
            ? {
                ...product,
                ...patch,
              }
            : product
      );

    setData({
      ...data,
      products,
    });

    if (
      index ===
        0 &&
      patch.image
    ) {
      setImagePreview(
        patch.image
      );
    }
  }


  /*
   * =========================================================
   * ADD PRODUCT
   * =========================================================
   */

  function addProduct() {
    setData({
      ...data,

      products: [
        ...data.products,

        {
          name:
            'New NEXORIUM Module',

          version:
            'NEW',

          status:
            'READY',

          desc:
            'Add a description for this module.',

          price:
            'FREE',

          duration:
            'One-time',

          deliveryUrl:
            '',

          image:
            '',

          imageVersion:
            Date.now(),
        },
      ],
    });
  }


  /*
   * =========================================================
   * DELETE PRODUCT
   * =========================================================
   */

  function deleteProduct(
    index
  ) {
    if (
      data.products.length <=
      1
    ) {
      flash(
        'Keep at least one product card.'
      );

      return;
    }

    setData({
      ...data,

      products:
        data.products.filter(
          (
            _,
            itemIndex
          ) =>
            itemIndex !==
            index
        ),
    });
  }


  /*
   * =========================================================
   * CREATE FIRESTORE ORDER
   *
   * NO STORAGE REQUIRED FOR RECEIPT.
   * =========================================================
   */

  async function createFirestoreOrder({
    product,
    receiptData,
    reference,
  }) {
    if (
      !firebaseConfigured ||
      !db ||
      !user
    ) {
      throw new Error(
        'Firebase authentication is required for orders.'
      );
    }

    const displayName =
      user.displayName ||
      user.email ||
      'USER';

    const orderData =
      {
        userId:
          user.uid,

        userEmail:
          user.email ||
          '',

        username:
          displayName,

        usernameMasked:
          maskUsername(
            displayName
          ),

        productName:
          product.name ||
          'NEXORIUM Product',

        productVersion:
          product.version ||
          '',

        duration:
          product.duration ||
          product.version ||
          'N/A',

        amount:
          product.price ||
          '0',

        paymentMethod:
          'GCash',

        paymentReference:
          String(
            reference ||
              ''
          ).trim(),

        /*
         * FIRESTORE RECEIPT
         */
        receiptData:
          receiptData,

        deliveryUrl:
          product.deliveryUrl ||
          '',

        status:
          'pending',

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      };

    const orderRef =
      await addDoc(
        collection(
          db,
          'orders'
        ),
        orderData
      );

    return {
      id:
        orderRef.id,

      ...orderData,
    };
  }


  /*
   * =========================================================
   * TELEGRAM NOTIFICATION
   *
   * Firestore order already exists.
   * =========================================================
   */

  async function notifyTelegram(
    order
  ) {
    try {
      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () =>
            controller.abort(),
          8000
        );

      const response =
        await fetch(
          '/api/telegram/order',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                orderId:
                  order.id,

                userId:
                  order.userId,

                userEmail:
                  order.userEmail,

                usernameMasked:
                  order.usernameMasked,

                productName:
                  order.productName,

                duration:
                  order.duration,

                amount:
                  order.amount,

                paymentReference:
                  order.paymentReference,

                /*
                 * Send receipt data to your
                 * Telegram endpoint too.
                 */
                receiptData:
                  order.receiptData,

                deliveryUrl:
                  order.deliveryUrl,
              }),

            signal:
              controller.signal,
          }
        );

      clearTimeout(
        timeout
      );

      let result =
        null;

      try {
        result =
          await response.json();
      } catch {}

      if (
        !response.ok
      ) {
        console.error(
          'Telegram notification failed:',
          result
        );

        return false;
      }

      return true;
    } catch (
      error
    ) {
      console.error(
        'Telegram notification failed:',
        error
      );

      return false;
    }
  }


  /*
   * =========================================================
   * PAYMENT SUBMISSION
   *
   * NO REDIRECT TO TELEGRAM.
   * =========================================================
   */

  async function submitPaymentForVerification() {
    if (!checkout) {
      return;
    }

    if (
      !firebaseConfigured ||
      !db ||
      !user
    ) {
      flash(
        'Please sign in with Firebase before submitting a payment receipt.'
      );

      setAuthMode(
        'login'
      );

      return;
    }

    if (!receiptFile) {
      flash(
        'Upload your GCash payment screenshot first.'
      );

      return;
    }

    if (
      !receiptFile.type.startsWith(
        'image/'
      )
    ) {
      flash(
        'Receipt must be an image file.'
      );

      return;
    }

    if (
      receiptFile.size >
      8 * 1024 * 1024
    ) {
      flash(
        'Receipt image must be 8 MB or smaller.'
      );

      return;
    }

    try {
      setOrderSubmitting(
        true
      );

      /*
       * STEP 1
       * Compress receipt locally.
       */
      flash(
        'Preparing receipt...'
      );

      const receiptData =
        await compressReceipt(
          receiptFile
        );

      /*
       * STEP 2
       * Create Firestore order.
       *
       * THIS is the important part.
       */
      flash(
        'Creating order...'
      );

      const order =
        await createFirestoreOrder({
          product:
            checkout,

          receiptData,

          reference:
            paymentReference,
        });

      /*
       * STEP 3
       * Immediately show success.
       *
       * Telegram does NOT block the user.
       */
      setSubmittedOrder({
        id:
          order.id,

        status:
          'pending',
      });

      setPaymentStep(
        'submitted'
      );

      setReceiptFile(
        null
      );

      setPaymentReference(
        ''
      );

      setOrderSubmitting(
        false
      );

      flash(
        'Order submitted successfully. Waiting for verification.'
      );

      /*
       * STEP 4
       * Telegram in background.
       *
       * IMPORTANT:
       * No await.
       */
      notifyTelegram(
        order
      )
        .then(
          (
            sent
          ) => {
            if (!sent) {
              console.warn(
                'Order was saved, but Telegram notification failed.'
              );
            }
          }
        )
        .catch(
          (
            error
          ) => {
            console.error(
              'Background Telegram error:',
              error
            );
          }
        );

    } catch (
      error
    ) {
      console.error(
        'Payment submission failed:',
        error
      );

      setOrderSubmitting(
        false
      );

      flash(
        error?.message ||
          'Payment submission failed.'
      );
    }
  }


  /*
   * =========================================================
   * ADMIN ORDER STATUS
   * =========================================================
   */

  async function setOrderStatus(
    orderId,
    status
  ) {
    if (
      !isAdmin ||
      !user
    ) {
      return;
    }

    try {
      const idToken =
        await user.getIdToken(
          true
        );

      const response =
        await fetch(
          '/api/admin/order',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${idToken}`,
            },

            body:
              JSON.stringify({
                orderId,
                status,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
            'Could not update order.'
        );
      }

      flash(
        status ===
          'confirmed'
          ? 'Order confirmed. Customized receipt sent to Telegram.'
          : 'Order rejected.'
      );
    } catch (
      error
    ) {
      console.error(
        'Order status error:',
        error
      );

      flash(
        error?.message ||
          'Could not update order.'
      );
    }
  }


  /*
   * =========================================================
   * CHECKOUT
   * =========================================================
   */

  function openCheckout(
    product
  ) {
    setCheckout(
      product
    );

    setPaymentStep(
      'method'
    );

    setReceiptFile(
      null
    );

    setPaymentReference(
      ''
    );

    setSubmittedOrder(
      null
    );
  }


  /*
   * =========================================================
   * UI
   *
   * This section keeps your existing storefront design.
   * =========================================================
   */

  return (
    <div className="site-shell">

      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-glow" />

      <div
        className="cursor-orb"
        aria-hidden="true"
      />

      <header className="topbar">

        <div className="top-left">

          <button
            className="mobile-menu"
            onClick={() =>
              setMenu(
                (value) =>
                  !value
              )
            }
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <a
            href="#home"
            className="logo-lockup"
            onClick={() =>
              setMenu(false)
            }
          >
            <span className="logo-mark">

              <img
                src="/nexorium-logo.png"
                alt="Nexorium"
              />

            </span>

            <span>

              <strong>
                {data.brand}
              </strong>

              <small>
                {data.subbrand}
              </small>

            </span>
          </a>
        </div>

        <div className="top-actions">

          <button
            className="theme-toggle"
            onClick={
              toggleTheme
            }
          >
            <span className="theme-icon">
              {theme ===
              'dark'
                ? '☀'
                : '☾'}
            </span>

            <span className="theme-text">
              {theme ===
              'dark'
                ? 'LIGHT'
                : 'DARK'}
            </span>
          </button>

          <button
            className="ghost-btn"
            onClick={() =>
              setCommunity(
                true
              )
            }
          >
            <Icon>
              ↗
            </Icon>

            COMMUNITY
          </button>

          {currentUser ? (
            <button
              className="account-chip"
              onClick={() => setShowProfile(true)}
            >
              <span className="account-avatar">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="" />
                ) : (
                  accountLabel.slice(0, 1).toUpperCase()
                )}
              </span>

              <span>
                {accountLabel}
              </span>

              {isAdmin && (
                <b>
                  ADMIN
                </b>
              )}
            </button>
          ) : (
            <button
              className="google-btn"
              onClick={() =>
                setAuthMode(
                  'login'
                )
              }
            >
              <span className="google-g">
                G
              </span>

              SIGN IN
            </button>
          )}

          {isAdmin && (
            <a
              className="primary-btn"
              href="/admin"
            >
              <Icon>
                ⚙
              </Icon>

              ADMIN
            </a>
          )}

        </div>
      </header>


      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() =>
            setMenu(false)
          }
        />
      )}


      <aside
        className={`sidebar ${
          menu
            ? 'open'
            : ''
        }`}
      >

        <div className="side-glow" />

        <div className="guest-card">

          {currentUser ? (
            <div className="avatar profile-avatar">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" />
              ) : (
                accountLabel.slice(0, 1).toUpperCase()
              )}
            </div>
          ) : (
            <div className="avatar">
              <span>
                ✦
              </span>
            </div>
          )}

          <div className="guest-info">

            <b>
              {currentUser
                ? accountLabel
                : 'Welcome, Guest'}
            </b>

            <small>
              {currentUser
                ? isAdmin
                  ? '// ADMIN ACCESS'
                  : '// MEMBER CONNECTED'
                : '// NOT SIGNED IN'}
            </small>

            {currentUser ? (
              <button
                className="mini-auth"
                onClick={
                  logout
                }
              >
                SIGN OUT
              </button>
            ) : (
              <div className="auth-mini-row">

                <button
                  className="mini-auth"
                  onClick={() =>
                    setAuthMode(
                      'login'
                    )
                  }
                >
                  SIGN IN
                </button>

                <button
                  className="mini-auth"
                  onClick={() =>
                    setAuthMode(
                      'register'
                    )
                  }
                >
                  REGISTER
                </button>

              </div>
            )}

          </div>
        </div>

        <div className="side-label">
          NEXORIUM
        </div>

        <a
          className="side-item active"
          href="#home"
          onClick={() =>
            setMenu(false)
          }
        >
          <Icon>
            ⌂
          </Icon>

          <span>
            Home
          </span>

          <em>
            ›
          </em>
        </a>

        <a
          className="side-item"
          href="#products"
          onClick={() =>
            setMenu(false)
          }
        >
          <Icon>
            ▦
          </Icon>

          <span>
            Showcase
          </span>

          <em>
            LIVE
          </em>
        </a>

        <a
          className="side-item"
          href="#faq"
          onClick={() =>
            setMenu(false)
          }
        >
          <Icon>
            ?
          </Icon>

          <span>
            FAQ
          </span>

          <em>
            ›
          </em>
        </a>

        <a
          className="side-item"
          href="#support"
          onClick={() =>
            setMenu(false)
          }
        >
          <Icon>
            ♢
          </Icon>

          <span>
            Support
          </span>

          <em>
            24/7
          </em>
        </a>

        {currentUser && (
          <button
            className="side-item"
            onClick={() => {
              setShowMyOrders(
                true
              );

              setMenu(false);
            }}
          >
            <Icon>
              ◉
            </Icon>

            <span>
              My Orders
            </span>

            <em>
              {
                myOrders.filter(
                  (
                    order
                  ) =>
                    order.status ===
                    'pending'
                ).length ||
                ''
              }
            </em>

          </button>
        )}

        {currentUser && (
          <button
            className="side-item"
            onClick={() => { setShowProfile(true); setMenu(false); }}
          >
            <Icon>◎</Icon>
            <span>Profile</span>
            <em>ACCOUNT</em>
          </button>
        )}

        {isAdmin && (
          <a
            className="side-item side-admin"
            href="/admin"
            onClick={() =>
              setMenu(false)
            }
          >

            <Icon>
              ⚙
            </Icon>

            <span>
              Admin Dashboard
            </span>

            <em>
              ROOT
            </em>

          </a>
        )}

        <div className="side-spacer" />

        <a
          className="side-cta"
          href={data.telegram}
          target="_blank"
          rel="noreferrer"
        >

          <Icon>
            ➤
          </Icon>

          <span>
            OPEN TELEGRAM
          </span>

          <b>
            ↗
          </b>

        </a>

        <div className="mini-stats">

          <div>

            <b>
              {data.stats.online}
            </b>

            <small>
              UPDATES
            </small>

          </div>

          <div>

            <b>
              {data.stats.community}
            </b>

            <small>
              COMMUNITY
            </small>

          </div>

        </div>

        <div className="side-foot">
          NEXORIUM // 2026
        </div>

      </aside>


      <main
        className="main"
        id="home"
      >

        {authError && (
          <div className="auth-alert">

            <span>
              {authError}
            </span>

            <button
              onClick={() =>
                setAuthError(
                  ''
                )
              }
            >
              ×
            </button>

          </div>
        )}


        <section className="hero-card reveal">

          <div className="scanlines" />
          <div className="hero-grid" />

          <div className="hero-copy">

            <span className="status-pill">

              <i />

              {data.announcement}

            </span>

            <h1>

              {data.hero}

              <br />

              <span>
                {data.brand}
              </span>

            </h1>

            <p>
              {data.heroText}
            </p>

            <div className="hero-buttons">

              <a
                className="primary-btn big"
                href={data.telegram}
                target="_blank"
                rel="noreferrer"
              >
                ➤ JOIN TELEGRAM
              </a>

              <button
                className="outline-btn big"
                onClick={() =>
                  document
                    .getElementById(
                      'products'
                    )
                    ?.scrollIntoView({
                      behavior:
                        'smooth',
                    })
                }
              >
                BROWSE SHOWCASE ↓
              </button>

            </div>

            <div className="terminal-line">

              <span>
                ● SYSTEM ONLINE
              </span>

              <span>
                LATENCY: 18ms
              </span>

              <span>
                NODE: NXR-PH-01
              </span>

            </div>

          </div>


          <div className="hero-orb">

            <div className="orb-core" />

            <img
              src="/nexorium-logo.png"
              alt="Nexorium emblem"
            />

            <div className="orb-ring r1" />
            <div className="orb-ring r2" />
            <div className="orb-ring r3" />

          </div>

        </section>


        <section className="signal-grid">

          {[
            [
              '01',
              'DIRECT TELEGRAM',
              'One-tap community access',
            ],

            [
              '02',
              'LIVE CONTENT',
              'Updates you can edit instantly',
            ],

            [
              '03',
              'SMART ADMIN',
              'Manage products and payments',
            ],

            [
              '04',
              'RESPONSIVE UI',
              'Desktop + mobile layout',
            ],
          ].map(
            (
              [
                number,
                title,
                subtitle,
              ]
            ) => (
              <div
                className="signal"
                key={
                  number
                }
              >

                <span>
                  {number}
                </span>

                <div>

                  <b>
                    {title}
                  </b>

                  <small>
                    {subtitle}
                  </small>

                </div>

              </div>
            )
          )}

        </section>


        <section
          id="products"
          className="section-block reveal"
        >

          <div className="section-head">

            <div>

              <span className="eyebrow">
                // FEATURED MODULES
              </span>

              <h2>
                KAELHAX SHOWCASE
              </h2>

            </div>

            <a
              href={data.telegram}
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              VIEW TELEGRAM ↗
            </a>

          </div>


          <div className="product-grid">

            {data.products.map(
              (
                product,
                index
              ) => (
                <article
                  className="product"
                  key={`${product.name}-${index}-${product.imageVersion || product.image || ''}`}
                >

                  <div className="product-image">

                    {product.image ? (
                      <img
                        key={`${product.image}-${product.imageVersion || ''}`}
                        src={product.image}
                        alt={product.name}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                          event.currentTarget.parentElement?.classList.add('image-load-error');
                        }}
                      />
                    ) : (
                      <div
                        className="product-image-placeholder"
                        style={{
                          height: '100%',
                          minHeight: 220,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'column',
                          gap: 8,
                          opacity: 0.65,
                          letterSpacing: '0.12em',
                          textAlign: 'center',
                        }}
                      >
                        <strong>NO PRODUCT IMAGE</strong>
                        <small>UPLOAD FROM ADMIN</small>
                      </div>
                    )}

                    <div className="image-overlay">

                      <span>
                        {product.status}
                      </span>

                      <small>
                        {product.version}
                      </small>

                    </div>

                    <div className="product-scan" />

                  </div>


                  <div className="product-body">

                    <div className="product-top">

                      <span className="version">
                        {product.version}
                      </span>

                      <span className="live">
                        ● {product.status}
                      </span>

                    </div>

                    <h3>
                      {product.name}
                    </h3>

                    <p>
                      {product.desc}
                    </p>

                    <div className="product-bottom">

                      <div className="product-pricing">
                        {Array.isArray(product.priceOptions) && product.priceOptions.length ? (
                          <div className="product-price-tiers">
                            {product.priceOptions.map((option, priceIndex) => (
                              <div className="product-price-tier" key={`${product.name}-tier-${priceIndex}`}>
                                <span>→ {option.label}</span>
                                <b>{option.price}</b>
                                {option.slots ? <small>({option.slots})</small> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <b>{product.price || 'FREE'}</b>
                        )}
                      </div>

                      <button
                        className="card-action"
                        onClick={() =>
                          openCheckout(
                            product
                          )
                        }
                      >
                        {product.price ===
                        'FREE'
                          ? 'VIEW ↗'
                          : 'BUY / CHECKOUT ↗'}
                      </button>

                    </div>

                  </div>

                </article>
              )
            )}

          </div>

        </section>


        <section className="wide-banner reveal">

          <div>

            <span className="eyebrow">
              NEXORIUM INTELLIGENCE
            </span>

            <h2>
              A BETTER HOME FOR
              YOUR CHANNEL.
            </h2>

            <p>
              Use this space for legitimate
              gaming tools, guides, tournaments,
              clan news, video showcases, or
              community resources.
            </p>

          </div>

          <div className="metrics">

            <div>

              <b>
                {data.stats.community}
              </b>

              <small>
                COMMUNITY
              </small>

            </div>

            <div>

              <b>
                {data.stats.uptime}
              </b>

              <small>
                UPTIME TARGET
              </small>

            </div>

            <div>

              <b>
                ∞
              </b>

              <small>
                CONTENT SLOTS
              </small>

            </div>

          </div>

        </section>


        <section
          id="faq"
          className="faq-section reveal"
        >

          <div className="section-head">

            <div>

              <span className="eyebrow">
                // KNOWLEDGE BASE
              </span>

              <h2>
                FREQUENTLY ASKED
              </h2>

            </div>

          </div>

          <div className="faq-layout">

            <aside className="category-card">

              <h3>
                <Icon>
                  ≡
                </Icon>
                CATEGORIES
              </h3>

              <a href="#faq">
                Getting Started
                <b>
                  ›
                </b>
              </a>

              <a href="#products">
                Showcase
                <b>
                  ›
                </b>
              </a>

              <a href="#support">
                Support & Telegram
                <b>
                  ›
                </b>
              </a>

              {isAdmin ? (
                <a href="/admin">
                  Admin Access
                  <b>
                    ›
                  </b>
                </a>
              ) : (
                <button
                  onClick={() =>
                    setAuthMode(
                      'login'
                    )
                  }
                >
                  Admin Access
                  <b>
                    ›
                  </b>
                </button>
              )}

            </aside>


            <div className="faq-list">

              {data.faq.map(
                (
                  item,
                  index
                ) => (
                  <div
                    className={`faq-row ${
                      faq ===
                      index
                        ? 'open'
                        : ''
                    }`}
                    key={
                      index
                    }
                  >

                    <button
                      onClick={() =>
                        setFaq(
                          faq ===
                            index
                            ? -1
                            : index
                        )
                      }
                    >

                      <span>
                        {item[0]}
                      </span>

                      <b>
                        {faq ===
                        index
                          ? '−'
                          : '⌄'}
                      </b>

                    </button>

                    {faq ===
                      index && (
                      <p>
                        {item[1]}
                      </p>
                    )}

                  </div>
                )
              )}


              <div
                className="support-card"
                id="support"
              >

                <div className="check">
                  ✓
                </div>

                <h3>
                  STILL HAVE QUESTIONS?
                </h3>

                <p>
                  Contact the NEXORIUM
                  community directly through
                  Telegram.
                </p>

                <a
                  className="primary-btn big"
                  href={data.telegram}
                  target="_blank"
                  rel="noreferrer"
                >
                  ➤ CONTACT SUPPORT
                </a>

              </div>

            </div>

          </div>

        </section>


        <footer>

          <div className="footer-brand">

            <img
              src="/nexorium-logo.png"
              alt="Nexorium"
            />

            <div>

              <b>
                {data.brand}
              </b>

              <small>
                {data.subbrand}
              </small>

            </div>

          </div>

          <div className="footer-links">

            <a href="#home">
              Home
            </a>

            <a href="#products">
              Showcase
            </a>

            <a href="#faq">
              FAQ
            </a>

            <a
              href={data.telegram}
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </a>

          </div>

          <span>
            © 2026 {data.brand} // NEXORIUM
          </span>

        </footer>

      </main>


      {/* ===================================================
          AI
      ==================================================== */}

      <button
        className={`ai-fab ${
          aiOpen
            ? 'active'
            : ''
        }`}
        onClick={() =>
          setAiOpen(
            (value) =>
              !value
          )
        }
        aria-label="Open NEXORIUM AI support"
      >

        <span className="ai-pulse" />

        <span className="ai-spark">
          ✦
        </span>

        <span className="ai-label">
          AI SUPPORT
        </span>

      </button>


      {aiOpen && (
        <div className="ai-panel">

          <div className="ai-head">

            <div>

              <span className="eyebrow">
                // NEXORIUM INTELLIGENCE
              </span>

              <h3>
                AI SUPPORT
              </h3>

              <small>
                <i />
                ONLINE
              </small>

            </div>

            <button
              onClick={() =>
                setAiOpen(false)
              }
            >
              ×
            </button>

          </div>


          <div className="ai-quick">

            <button
              onClick={() =>
                sendAiMessage(
                  'How do I create an account?'
                )
              }
            >
              Register
            </button>

            <button
              onClick={() =>
                sendAiMessage(
                  'How does checkout work?'
                )
              }
            >
              Checkout
            </button>

            <button
              onClick={() =>
                sendAiMessage(
                  'What products are available?'
                )
              }
            >
              Showcase
            </button>

          </div>


          <div className="ai-messages">

            {aiMessages.map(
              (
                message,
                index
              ) => (
                <div
                  key={
                    index
                  }
                  className={`ai-bubble ${message.role}`}
                >
                  {message.content}
                </div>
              )
            )}

            {aiBusy && (
              <div className="ai-bubble assistant typing">

                <span />
                <span />
                <span />

              </div>
            )}

            <div
              ref={
                aiEndRef
              }
            />

          </div>


          <form
            className="ai-input"
            onSubmit={(event) => {
              event.preventDefault();

              sendAiMessage();
            }}
          >

            <input
              value={
                aiInput
              }
              onChange={(
                event
              ) =>
                setAiInput(
                  event
                    .target
                    .value
                )
              }
              placeholder="Ask NEXORIUM AI..."
              maxLength={
                500
              }
            />

            <button
              disabled={
                aiBusy ||
                !aiInput.trim()
              }
            >
              ➤
            </button>

          </form>

        </div>
      )}


      {/* ===================================================
          MY ORDERS
      ==================================================== */}

      {showMyOrders && (
        <div
          className="modal-bg"
          onClick={() =>
            setShowMyOrders(
              false
            )
          }
        >

          <div
            className="modal orders-user-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-x"
              onClick={() =>
                setShowMyOrders(
                  false
                )
              }
            >
              ×
            </button>

            <div className="modal-icon">
              ◉
            </div>

            <span className="eyebrow">
              // ACCOUNT
            </span>

            <h2>
              MY ORDERS
            </h2>

            <p>
              Track receipt verification status
              from the same order records used by
              the Admin Console.
            </p>


            {!firebaseConfigured ? (
              <div className="empty-admin-state">
                Firebase is required for
                persistent order history.
              </div>
            ) : myOrders.length ===
              0 ? (
              <div className="empty-admin-state">
                No orders yet. Completed
                checkout receipts will
                appear here.
              </div>
            ) : (
              <div className="orders-admin-list">

                {myOrders.map(
                  (
                    order
                  ) => (
                    <div
                      className="order-admin-row"
                      key={
                        order.id
                      }
                    >

                      <div className="order-admin-main">

                        <span
                          className={`order-status ${
                            order.status ||
                            'pending'
                          }`}
                        >
                          {String(
                            order.status ||
                              'pending'
                          ).toUpperCase()}
                        </span>

                        <b>
                          {
                            order.productName
                          }
                        </b>

                        <small>
                          {
                            order.amount ||
                            '—'
                          }
                          {' • '}
                          {
                            order.duration ||
                            '—'
                          }
                        </small>

                        <code>
                          {
                            order.id
                          }
                        </code>

                        {order.paymentReference && (
                          <small>
                            REF:
                            {' '}
                            {
                              order.paymentReference
                            }
                          </small>
                        )}

                        {order.receiptData && (
                          <a
                            className="receipt-link"
                            href={
                              order.receiptData
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            VIEW SUBMITTED RECEIPT ↗
                          </a>
                        )}

                      </div>

                    </div>
                  )
                )}

              </div>
            )}


            <button
              className="outline-btn big"
              onClick={() =>
                setShowMyOrders(
                  false
                )
              }
            >
              CLOSE
            </button>

          </div>

        </div>
      )}


      {/* ===================================================
          CHECKOUT
      ==================================================== */}

      {checkout && (
        <div
          className="modal-bg"
          onClick={() =>
            setCheckout(
              null
            )
          }
        >

          <div
            className="checkout-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-x"
              onClick={() =>
                setCheckout(
                  null
                )
              }
            >
              ×
            </button>


            <div className="checkout-head">

              <div>

                <span className="eyebrow">
                  // SECURE CHECKOUT
                </span>

                <h2>
                  {checkout.name}
                </h2>

                <p>
                  {checkout.desc}
                </p>

              </div>

              <div className="checkout-price">
                {checkout.price}
              </div>

            </div>


            <div className="checkout-steps">

              {[
                'method',
                'qr',
                'done',
              ].map(
                (
                  step,
                  index
                ) => (
                  <button
                    key={
                      step
                    }
                    className={
                      paymentStep ===
                      step
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setPaymentStep(
                        step
                      )
                    }
                  >

                    {String(
                      index +
                        1
                    ).padStart(
                      2,
                      '0'
                    )}

                    {' '}

                    {step ===
                    'method'
                      ? 'METHOD'
                      : step ===
                        'qr'
                      ? 'PAY'
                      : 'CONFIRM'}

                  </button>
                )
              )}

            </div>


            {paymentStep ===
              'method' && (
              <div className="payment-panel">

                <h3>
                  Choose a payment method
                </h3>

                <p className="muted">
                  Pay through the merchant QR.
                  Payment is manually verified
                  before release.
                </p>

                <div className="pay-methods">

                  <button
                    className="pay-method selected"
                    onClick={() =>
                      setPaymentStep(
                        'qr'
                      )
                    }
                  >

                    <span className="pay-icon">
                      ₱
                    </span>

                    <span>

                      <b>
                        GCash / QRPh
                      </b>

                      <small>
                        Scan QR to pay
                      </small>

                    </span>

                    <em>
                      ›
                    </em>

                  </button>

                  {data.payment
                    .gcashOpenUrl && (
                    <a
                      className="pay-method"
                      href={
                        data.payment
                          .gcashOpenUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >

                      <span className="pay-icon gcash">
                        G
                      </span>

                      <span>

                        <b>
                          Open in GCash
                        </b>

                        <small>
                          Provider-issued checkout link
                        </small>

                      </span>

                      <em>
                        ↗
                      </em>

                    </a>
                  )}

                </div>

                <div className="payment-note">
                  {data.payment.note}
                </div>

              </div>
            )}


            {paymentStep ===
              'qr' && (
              <div className="payment-panel qr-panel">

                <div className="qr-copy">

                  <span className="eyebrow">
                    // PAYMENT METHOD
                  </span>

                  <h3>
                    SCAN TO PAY
                  </h3>

                  <p>
                    Use your GCash app →
                    <b>
                      {' '}
                      QR
                    </b>
                    {' '}
                    → scan this merchant QR.
                    Review the merchant and amount
                    before tapping Pay.
                  </p>

                  {data.payment
                    .gcashOpenUrl && (
                    <a
                      className="primary-btn big"
                      href={
                        data.payment
                          .gcashOpenUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      ↗ OPEN IN GCASH
                    </a>
                  )}

                  <button
                    className="outline-btn big"
                    onClick={() =>
                      setPaymentStep(
                        'done'
                      )
                    }
                  >
                    I'VE PAID →
                  </button>

                </div>


                <div className="qr-box">

                  {data.payment.qrImage ? (
                    <>

                      <img
                        src={
                          data.payment
                            .qrImage
                        }
                        alt="KAELHAX GCash payment QR"
                      />

                      <a
                        className="qr-download"
                        download="kaelhax-gcash-qr.png"
                        href={
                          data.payment
                            .qrImage
                        }
                      >
                        ↓ DOWNLOAD QR
                      </a>

                    </>
                  ) : (
                    <div className="qr-empty large">
                      ADMIN: UPLOAD YOUR
                      <br />
                      GCASH / QRPH QR
                    </div>
                  )}

                </div>

              </div>
            )}


            {paymentStep ===
              'done' && (
              <div className="payment-panel success-panel">

                <div className="success-mark">
                  ↑
                </div>

                <span className="eyebrow">
                  // RECEIPT VERIFICATION
                </span>

                <h3>
                  UPLOAD PAYMENT RECEIPT
                </h3>

                <p>
                  Your receipt will be compressed
                  in your browser and stored with
                  your Firestore order. No Firebase
                  Storage upload is required.
                </p>

                <div className="receipt-upload">

                  <label className="upload-label">

                    CHOOSE RECEIPT IMAGE

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(
                        event
                      ) =>
                        setReceiptFile(
                          event.target
                            .files?.[0] ||
                          null
                        )
                      }
                    />

                  </label>

                  {receiptFile && (
                    <span className="receipt-file">

                      ✓{' '}

                      {
                        receiptFile.name
                      }

                    </span>
                  )}

                  <input
                    className="receipt-ref"
                    placeholder="GCash reference number (optional)"
                    value={
                      paymentReference
                    }
                    onChange={(
                      event
                    ) =>
                      setPaymentReference(
                        event.target
                          .value
                      )
                    }
                  />

                </div>

                <button
                  className="primary-btn big"
                  onClick={
                    submitPaymentForVerification
                  }
                  disabled={
                    orderSubmitting
                  }
                >

                  {orderSubmitting
                    ? 'SUBMITTING…'
                    : 'SUBMIT FOR VERIFICATION →'}

                </button>

                <div className="admin-note">

                  Your order is saved to Firestore
                  first. You will remain on this
                  website. Telegram is only used for
                  the background notification.

                </div>

              </div>
            )}


            {paymentStep ===
              'submitted' && (
              <div className="payment-panel success-panel">

                <div className="success-mark">
                  ✓
                </div>

                <span className="eyebrow">
                  // ORDER RECEIVED
                </span>

                <h3>
                  WAITING FOR CONFIRMATION
                </h3>

                <p>
                  Your payment receipt has been
                  successfully submitted. Your
                  order is now pending manual
                  verification.
                </p>

                {submittedOrder?.id && (
                  <div className="order-ticket">

                    <span>
                      ORDER ID
                    </span>

                    <b>
                      {
                        submittedOrder.id
                      }
                    </b>

                  </div>
                )}

                <button
                  className="outline-btn big"
                  onClick={() =>
                    setCheckout(
                      null
                    )
                  }
                >
                  DONE
                </button>

              </div>
            )}


            <p className="checkout-foot">
              KAELHAX •{' '}
              {
                data.payment
                  .merchantName
              }
            </p>

          </div>

        </div>
      )}


      {/* ===================================================
          COMMUNITY MODAL
      ==================================================== */}

      {community && (
        <div
          className="modal-bg"
          onClick={() =>
            setCommunity(
              false
            )
          }
        >

          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-x"
              onClick={() =>
                setCommunity(
                  false
                )
              }
            >
              ×
            </button>

            <div className="modal-icon">
              ✦
            </div>

            <span className="eyebrow">
              // STAY CONNECTED
            </span>

            <h2>
              JOIN NEXORIUM
            </h2>

            <p>
              Open the official Telegram
              channel for updates, previews,
              and community support.
            </p>

            <a
              className="primary-btn big"
              href={data.telegram}
              target="_blank"
              rel="noreferrer"
            >
              ➤ OPEN TELEGRAM
            </a>

            <button
              className="google-btn big-google"
              onClick={() => {

                setCommunity(
                  false
                );

                setAuthMode(
                  currentUser
                    ? null
                    : 'login'
                );

              }}
            >

              <span className="google-g">
                G
              </span>

              {currentUser
                ? 'ACCOUNT CONNECTED'
                : 'SIGN IN / REGISTER'}

            </button>

            <button
              className="outline-btn big"
              onClick={() =>
                setCommunity(
                  false
                )
              }
            >
              CLOSE
            </button>

          </div>

        </div>
      )}


      {/* ===================================================
          AUTH MODAL
      ==================================================== */}

      {showProfile && currentUser && (
        <div className="modal-bg" onClick={() => setShowProfile(false)}>
          <div className="modal profile-user-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-x" onClick={() => setShowProfile(false)}>×</button>
            <div className="user-profile-head">
              <div className="user-profile-avatar">
                {currentUser.photoURL ? <img src={currentUser.photoURL} alt="Profile" /> : (accountLabel || 'U').slice(0,1).toUpperCase()}
              </div>
              <div>
                <span className="eyebrow">// USER PROFILE</span>
                <h2>ACCOUNT SETTINGS</h2>
                <p>{currentUser.email || 'Signed-in account'}</p>
              </div>
            </div>
            <label className="profile-photo-upload">CHANGE PROFILE PHOTO<input type="file" accept="image/png,image/jpeg,image/webp" disabled={profileBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) uploadUserProfilePhoto(file); }} /></label>
            <div className="profile-user-fields">
              <label>Display name<input value={profileForm.name} onChange={(event) => setProfileForm({ name: event.target.value })} /></label>
              <label>Email<input value={currentUser.email || ''} readOnly /></label>
              <label>Account type<input value={isAdmin ? 'Administrator' : 'Member'} readOnly /></label>
            </div>
            <div className="profile-user-actions">
              <button className="primary-btn" disabled={profileBusy} onClick={saveUserProfile}>{profileBusy ? 'UPDATING…' : 'SAVE PROFILE'}</button>
              <button className="outline-btn" disabled={profileBusy} onClick={sendUserPasswordReset}>RESET PASSWORD</button>
            </div>
          </div>
        </div>
      )}

      {authMode && (
        <div
          className="modal-bg"
          onClick={() =>
            setAuthMode(
              null
            )
          }
        >

          <div
            className="modal auth-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="modal-x"
              onClick={() =>
                setAuthMode(
                  null
                )
              }
            >
              ×
            </button>

            <div className="modal-icon">
              ◎
            </div>

            <span className="eyebrow">
              // ACCOUNT SYSTEM
            </span>

            <h2>
              {authMode ===
              'register'
                ? 'CREATE ACCOUNT'
                : 'WELCOME BACK'}
            </h2>

            <p>
              {firebaseConfigured
                ? 'Firebase authentication is enabled for this site.'
                : 'Demo mode stores a local account in this browser.'}
            </p>

            <form
              onSubmit={
                submitAuth
              }
            >

              <div className="auth-form-grid">

                {authMode ===
                  'register' && (
                  <input
                    placeholder="Display name"
                    value={
                      authForm.name
                    }
                    onChange={(
                      event
                    ) =>
                      setAuthForm({
                        ...authForm,

                        name:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                )}

                <input
                  type="email"
                  placeholder="Email address"
                  autoComplete="email"
                  value={
                    authForm.email
                  }
                  onChange={(
                    event
                  ) =>
                    setAuthForm({
                      ...authForm,

                      email:
                        event
                          .target
                          .value,
                    })
                  }
                />

                <input
                  type="password"
                  placeholder="Password (6+ characters)"
                  autoComplete={
                    authMode ===
                    'register'
                      ? 'new-password'
                      : 'current-password'
                  }
                  value={
                    authForm.password
                  }
                  onChange={(
                    event
                  ) =>
                    setAuthForm({
                      ...authForm,

                      password:
                        event
                          .target
                          .value,
                    })
                  }
                />

              </div>

              {authError && (
                <div className="auth-inline-error">
                  {authError}
                </div>
              )}

              <button
                className="primary-btn big auth-submit"
                disabled={
                  authBusy
                }
              >
                {authBusy
                  ? 'CONNECTING…'
                  : authMode ===
                    'register'
                  ? 'REGISTER ACCOUNT →'
                  : 'SIGN IN →'}
              </button>

            </form>

            <div className="auth-switch">

              {authMode ===
              'register'
                ? 'Already registered?'
                : 'New here?'}

              {' '}

              <button
                onClick={() => {

                  setAuthError(
                    ''
                  );

                  setAuthMode(
                    authMode ===
                      'register'
                      ? 'login'
                      : 'register'
                  );

                }}
              >
                {authMode ===
                'register'
                  ? 'Sign in'
                  : 'Create account'}
              </button>

            </div>

            <div className="auth-divider">

              <span>
                OR
              </span>

            </div>

            <button
              className="google-btn big-google"
              onClick={
                loginGoogle
              }
              disabled={
                authBusy
              }
            >

              <span className="google-g">
                G
              </span>

              CONTINUE WITH GOOGLE

            </button>

          </div>

        </div>
      )}


      {/* ===================================================
          TOAST
      ==================================================== */}

      {toast && (
        <div className="toast">

          <span>
            ✓
          </span>

          {toast}

        </div>
      )}

    </div>
  );
}