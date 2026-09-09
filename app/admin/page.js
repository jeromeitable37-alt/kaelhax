'use client';

import { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';

import {
  auth,
  db,
  storage,
  firebaseConfigured,
  onAuthStateChanged,
  signOut,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL,
} from '../firebase';

const DEFAULT = {
  brand: 'KAELHAX',
  subbrand: 'NEXORIUM CHANNEL',
  telegram: 'https://t.me/kaelpo21',

  payment: {
    merchantName: 'EL**N T.',
    qrImage: '/gcash-payment-qr.png',
    gcashOpenUrl: '',
    note: 'Review the merchant and amount before paying. Orders are manually verified.',
  },

  hero: 'PREMIUM GAMING HUB',
  heroText:
    'A neon command center for KAELHAX updates, showcases, community support, legitimate gaming utilities, and digital resources.',
  announcement: 'WELCOME TO NEXORIUM // SYSTEM ONLINE',

  stats: {
    online: '24/7',
    community: 'PH',
    uptime: '99%',
    response: '< 1m',
  },

  products: [
    {
      name: 'Nexorium UI Showcase',
      version: 'SHOWCASE',
      status: 'LIVE',
      desc: 'A polished interface preview for channel branding, product presentation, and community landing pages.',
      price: 'FREE',
      priceOptions: [
        { label: '30 DAYS', price: '₱250', slots: '0/5' },
        { label: 'LIFETIME', price: '₱350', slots: '0/3' },
      ],
      duration: 'One-time',
      deliveryUrl: '',
      image: '/panel-showcase.png',
    },
    {
      name: 'KAELHAX Updates',
      version: 'LATEST',
      status: 'ONLINE',
      desc: 'Release notes, news, previews, and community announcements connected directly to Telegram.',
      price: 'FREE',
      priceOptions: [],
      duration: 'One-time',
      deliveryUrl: '',
      image: '/panel-showcase.png',
    },
    {
      name: 'Gaming Utility Hub',
      version: 'TOOLS',
      status: 'READY',
      desc: 'A landing area for legitimate utilities, guides, presets, downloads, tournaments, and resources.',
      price: 'FREE',
      priceOptions: [],
      duration: 'One-time',
      deliveryUrl: '',
      image: '/panel-showcase.png',
    },
  ],

  faq: [
    [
      'How do I get the latest updates?',
      'Use the Telegram button or join the NEXORIUM channel for announcements, release posts, and support.',
    ],
    [
      'Can I change the text and images?',
      'Admins can change published content from the admin console.',
    ],
    [
      'Can I create an account?',
      'Yes. Register with email and password, or Google.',
    ],
    [
      'Can this be deployed on Vercel?',
      'Yes. Add the required environment variables and deploy.',
    ],
  ],
};

const ADMIN_TABS = [
  ['overview', '◈', 'Overview'],
  ['content', '✦', 'Content'],
  ['products', '▦', 'Products'],
  ['payments', '₱', 'Payments'],
  ['orders', '◉', 'Orders'],
  ['accounts', '◎', 'Users'],
  ['profile', '●', 'Profile'],
  ['settings', '⚙', 'Settings'],
];

function sanitizeForFirestore(value, nestedArray = false) {
  if (Array.isArray(value)) {
    if (nestedArray) {
      return Object.fromEntries(
        value.map((item, index) => [
          String(index),
          sanitizeForFirestore(item, false),
        ])
      );
    }

    return value.map((item) =>
      Array.isArray(item)
        ? sanitizeForFirestore(item, true)
        : sanitizeForFirestore(item, false)
    );
  }

  if (value && typeof value === 'object') {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeForFirestore(item, false);
    }

    return output;
  }

  return value;
}

function mergeData(parsed) {
  return {
    ...DEFAULT,
    ...(parsed || {}),

    payment: {
      ...DEFAULT.payment,
      ...((parsed || {}).payment || {}),
      qrImage:
        parsed?.payment?.qrImage || DEFAULT.payment.qrImage,
    },

    stats: {
      ...DEFAULT.stats,
      ...((parsed || {}).stats || {}),
    },

    productImages: {
      ...((parsed || {}).productImages || {}),
    },

    products: Array.isArray(parsed?.products)
      ? parsed.products.map((product, index) => normalizeProduct(product, index))
      : DEFAULT.products.map((product, index) => normalizeProduct(product, index)),

    faq: Array.isArray(parsed?.faq)
      ? parsed.faq
      : DEFAULT.faq,
  };
}

function normalizeProduct(product, index = 0) {
  const priceOptions = Array.isArray(product?.priceOptions)
    ? product.priceOptions.filter(Boolean).map((option) => ({
        label: String(option?.label || 'OPTION').trim(),
        price: String(option?.price || '').trim(),
        slots: String(option?.slots || '').trim(),
      }))
    : [];

  return {
    ...product,
    id: String(product?.id || `product-${index + 1}`),
    price: String(product?.price ?? 'FREE'),
    priceOptions,
  };
}

function sortOrders(list) {
  return [...list].sort(
    (a, b) =>
      (b.createdAt?.seconds || 0) -
      (a.createdAt?.seconds || 0)
  );
}

export default function AdminPage() {
  const [theme, setTheme] = useState('dark');
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);

  const [data, setData] = useState(DEFAULT);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);

  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [uploadingProductIndex, setUploadingProductIndex] = useState(null);
  const [message, setMessage] = useState('');

  const [qrPreview, setQrPreview] = useState(
    DEFAULT.payment.qrImage
  );

  const isAdmin = Boolean(
    profile?.role === 'admin' &&
    profile?.disabled !== true
  );

  /*
   * ---------------------------------------------------------
   * THEME
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(
      'kaelhax-theme-v1'
    );

    const next =
      stored === 'light' || stored === 'dark'
        ? stored
        : 'dark';

    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(
        'kaelhax-theme-v1',
        theme
      );
    } catch {}
  }, [theme]);

  /*
   * ---------------------------------------------------------
   * AUTH
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(
      auth,
      (nextUser) => {
        setMe(nextUser || null);

        /*
         * Clear old profile while switching accounts.
         * This prevents a previous user's admin status
         * from remaining visible during auth transitions.
         */
        if (!nextUser) {
          setProfile(null);
        }
      }
    );

    return unsubscribe;
  }, []);

  /*
   * ---------------------------------------------------------
   * CURRENT USER PROFILE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!me?.uid || !db) {
      setProfile(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', me.uid),
      (snap) => {
        setProfile(
          snap.exists()
            ? {
                id: snap.id,
                ...snap.data(),
              }
            : null
        );
      },
      (error) => {
        console.error(
          'Failed to read user profile:',
          error
        );
        setProfile(null);
      }
    );

    return unsubscribe;
  }, [me?.uid]);

  /*
   * ---------------------------------------------------------
   * SITE CONFIG
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!db) return undefined;

    const unsubscribe = onSnapshot(
      doc(db, 'site', 'config'),
      (snap) => {
        if (snap.exists()) {
          const nextData = mergeData(
            snap.data()
          );

          setData(nextData);
          setQrPreview(
            nextData.payment?.qrImage ||
              DEFAULT.payment.qrImage
          );
        }
      },
      (error) => {
        console.error(
          'Failed to read site config:',
          error
        );
      }
    );

    return unsubscribe;
  }, []);

  /*
   * ---------------------------------------------------------
   * ADMIN DATA
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAdmin || !db) {
      setOrders([]);
      setUsers([]);
      return undefined;
    }

    const unsubscribeOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const nextOrders = snap.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        setOrders(sortOrders(nextOrders));
      },
      (error) => {
        console.error(
          'Failed to load orders:',
          error
        );
      }
    );

    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const nextUsers = snap.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        setUsers(nextUsers);
      },
      (error) => {
        console.error(
          'Failed to load users:',
          error
        );
      }
    );

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, [isAdmin]);

  /*
   * ---------------------------------------------------------
   * DERIVED DATA
   * ---------------------------------------------------------
   */

  const pending = orders.filter(
    (order) => order.status === 'pending'
  ).length;

  const confirmed = orders.filter(
    (order) => order.status === 'confirmed'
  ).length;

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  function flash(text) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage('');
    }, 2800);
  }

  function updateProduct(index, patch) {
    setData((prev) => ({
      ...prev,
      products: prev.products.map(
        (product, itemIndex) =>
          itemIndex === index
            ? {
                ...product,
                ...patch,
              }
            : product
      ),
    }));
  }

  function addPriceOption(index) {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((product, itemIndex) =>
        itemIndex === index
          ? {
              ...product,
              priceOptions: [
                ...(Array.isArray(product.priceOptions) ? product.priceOptions : []),
                { label: 'NEW OPTION', price: '₱0', slots: '' },
              ],
            }
          : product
      ),
    }));
  }

  function updatePriceOption(index, optionIndex, patch) {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((product, itemIndex) =>
        itemIndex === index
          ? {
              ...product,
              priceOptions: (Array.isArray(product.priceOptions) ? product.priceOptions : []).map(
                (option, priceIndex) =>
                  priceIndex === optionIndex
                    ? { ...option, ...patch }
                    : option
              ),
            }
          : product
      ),
    }));
  }

  function deletePriceOption(index, optionIndex) {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((product, itemIndex) =>
        itemIndex === index
          ? {
              ...product,
              priceOptions: (Array.isArray(product.priceOptions) ? product.priceOptions : []).filter(
                (_, priceIndex) => priceIndex !== optionIndex
              ),
            }
          : product
      ),
    }));
  }

  function addProduct() {
    const newProduct = {
      id: crypto.randomUUID(),
      name: 'New NEXORIUM Product',
      version: 'NEW',
      status: 'READY',
      desc: 'Add a description.',
      price: 'FREE',
      priceOptions: [],
      duration: 'One-time',
      deliveryUrl: '',
      image: '',
      imageVersion: Date.now(),
    };

    setData((prev) => ({
      ...prev,
      products: [...prev.products, newProduct],
    }));

    setTab('products');
  }

  function deleteProduct(index) {
    setData((prev) => ({
      ...prev,

      products:
        prev.products.length > 1
          ? prev.products.filter(
              (_, itemIndex) =>
                itemIndex !== index
            )
          : prev.products,
    }));
  }

  /*
   * ---------------------------------------------------------
   * STORAGE
   * ---------------------------------------------------------
   */

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your Firebase connection and browser console.`));
        }, ms);
      }),
    ]);
  }

  async function uploadImage(file, folder) {
    if (!file || !storage || !me) {
      throw new Error('Firebase Storage is not available for this upload.');
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const uniqueId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const objectRef = ref(
      storage,
      `${folder}/${me.uid}/${Date.now()}-${uniqueId}-${safeName}`
    );

    await withTimeout(
      uploadBytes(objectRef, file, {
        contentType: file.type || 'image/jpeg',
        cacheControl: 'public,max-age=31536000,immutable',
      }),
      30000,
      'Image upload'
    );

    return withTimeout(
      getDownloadURL(objectRef),
      15000,
      'Getting image URL'
    );
  }

  /*
   * ---------------------------------------------------------
   * SAVE SITE
   * ---------------------------------------------------------
   */

  async function saveSite() {
    if (!db || !isAdmin) return;
    setBusy(true);
    try {
      const firestoreData = sanitizeForFirestore(data);
      await withTimeout(
        setDoc(doc(db, 'site', 'config'), {
          ...firestoreData,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        20000,
        'Saving site changes to Firestore'
      );
      flash('✓ Site changes published to Firebase.');
    } catch (error) {
      console.error('Failed to save site:', error);
      flash(error?.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function publishProductImage(index, file) {
    if (!file || !db || !isAdmin) return;
    setUploadingProductIndex(index);
    const previewUrl = URL.createObjectURL(file);
    try {
      updateProduct(index, { image: previewUrl, imageVersion: Date.now() });
      const url = await uploadImage(file, 'products');
      const current = data.products[index] || {};
      const productId = String(current.id || `product-${index + 1}`);
      const imageVersion = Date.now();
      const updatedProducts = data.products.map((item, i) =>
        i === index ? { ...item, id: productId, image: url, imageVersion } : item
      );
      const updatedProductImages = { ...(data.productImages || {}), [productId]: url };
      await withTimeout(
        setDoc(doc(db, 'site', 'config'), {
          products: sanitizeForFirestore(updatedProducts),
          productImages: sanitizeForFirestore(updatedProductImages),
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        20000,
        'Publishing product image'
      );
      setData(prev => ({
        ...prev,
        productImages: updatedProductImages,
        products: prev.products.map((item, i) =>
          i === index ? { ...item, id: productId, image: url, imageVersion } : item
        ),
      }));
      flash('✓ Product image uploaded and published.');
    } catch (error) {
      console.error('Product image publish failed:', error);
      flash(error?.message || 'Product image upload failed.');
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingProductIndex(null);
    }
  }


  /*
   * ---------------------------------------------------------
   * ORDER STATUS
   * ---------------------------------------------------------
   */

 async function setOrderStatus(orderId, status) {
  try {
    if (!orderId) {
      throw new Error("Missing order ID.");
    }

    if (status !== "confirmed" && status !== "rejected") {
      throw new Error("Invalid order status.");
    }

    if (!auth?.currentUser) {
      throw new Error("You must be logged in.");
    }

    const idToken = await auth.currentUser.getIdToken(false);

    if (!idToken) {
      throw new Error("Unable to get Firebase ID token.");
    }

    console.log(
      `Updating order ${orderId} to ${status}...`
    );

    const response = await fetch("/api/admin/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId,
        status,
      }),
    });

    const responseText = await response.text();

    let result;

    try {
      result = responseText
        ? JSON.parse(responseText)
        : null;
    } catch (parseError) {
      console.error(
        "API returned invalid JSON:",
        parseError
      );

      console.error(
        "Raw server response:",
        responseText
      );

      throw new Error(
        `Server returned invalid JSON (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.error ||
          result?.message ||
          `Order update failed (HTTP ${response.status}).`
      );
    }

    if (!result?.ok) {
      throw new Error(
        result?.error ||
          result?.message ||
          "Order update was unsuccessful."
      );
    }

    console.log(
      "Order updated successfully:",
      result
    );

    // Update the displayed order immediately.
    if (typeof setOrders === "function") {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...(result.order || {}),
                status,
              }
            : order
        )
      );
    }

    const successMessage =
      result?.message ||
      (status === "confirmed"
        ? "Order confirmed successfully."
        : "Order rejected successfully.");

    console.log(successMessage);

    // Use your existing flash function if available.
    if (typeof flash === "function") {
      flash(successMessage);
    }

    return result;
  } catch (error) {
    console.error("Order update failed:", error);

    const message =
      error instanceof Error
        ? error.message
        : String(error || "Unknown error.");

    if (typeof flash === "function") {
      flash(`Order update failed: ${message}`);
    }

    return {
      ok: false,
      error: message,
    };
  }
}

  /*
   * ---------------------------------------------------------
   * CHANGE USER ROLE
   * ---------------------------------------------------------
   */

  async function setUserRole(userId, role) {
    if (!db || !isAdmin || !userId) return;

    const nextRole = role === 'admin' ? 'admin' : 'member';
    setBusy(true);

    try {
      await updateDoc(doc(db, 'users', userId), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });

      flash(
        nextRole === 'admin'
          ? 'User promoted to admin.'
          : 'User changed to member.'
      );
    } catch (error) {
      console.error('Failed to update user role:', error);
      flash(error?.message || 'Could not change user role.');
    } finally {
      setBusy(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * DISABLE USER
   * ---------------------------------------------------------
   */

  async function setDisabled(
    userId,
    disabled
  ) {
    if (!db || !isAdmin) return;

    try {
      await updateDoc(
        doc(db, 'users', userId),
        {
          disabled,
          updatedAt: serverTimestamp(),
        }
      );

      flash(
        disabled
          ? 'Account disabled.'
          : 'Account enabled.'
      );
    } catch (error) {
      console.error(
        'Failed to update account:',
        error
      );

      flash(
        error?.message ||
          'Could not update account.'
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * PROFILE
   * ---------------------------------------------------------
   */

  async function uploadProfilePicture(file) {
    if (!file || !storage || !me || !isAdmin) return;

    setBusy(true);

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const objectRef = ref(
        storage,
        `profiles/${me.uid}/${Date.now()}-${safeName}`
      );

      await uploadBytes(objectRef, file, {
        contentType: file.type || 'image/*',
      });

      const url = await getDownloadURL(objectRef);

      const { updateProfile } = await import('firebase/auth');
      await updateProfile(me, { photoURL: url });

      await updateDoc(doc(db, 'users', me.uid), {
        photoURL: url,
        updatedAt: serverTimestamp(),
      });

      setProfile((prev) => ({
        ...(prev || {}),
        photoURL: url,
      }));

      flash('Profile picture updated.');
    } catch (error) {
      console.error('Profile picture upload failed:', error);
      flash(error?.message || 'Profile picture upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const email = me?.email;
    if (!email || !auth) {
      flash('No email address is available for this account.');
      return;
    }

    setBusy(true);

    try {
      await sendPasswordResetEmail(auth, email);
      flash(`Password reset email sent to ${email}.`);
    } catch (error) {
      console.error('Password reset failed:', error);
      flash(error?.message || 'Could not send password reset email.');
    } finally {
      setBusy(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  async function doLogout() {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error(
        'Sign out failed:',
        error
      );
    } finally {
      window.location.href = '/';
    }
  }

  /*
   * ---------------------------------------------------------
   * PAYMENT QR
   * ---------------------------------------------------------
   */

  async function changeQr(file) {
    try {
      if (!file) return;

      const url =
        firebaseConfigured
          ? await uploadImage(
              file,
              'payment'
            )
          : '';

      if (!url) {
        flash(
          'Firebase Storage is required for production uploads.'
        );
        return;
      }

      setQrPreview(url);

      setData((prev) => ({
        ...prev,

        payment: {
          ...prev.payment,
          qrImage: url,
        },
      }));

      flash(
        'Payment QR uploaded. Save to publish.'
      );
    } catch (error) {
      console.error(
        'QR upload failed:',
        error
      );

      flash(
        error?.message ||
          'QR upload failed.'
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * EXPORT
   * ---------------------------------------------------------
   */

  function exportData() {
    try {
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

      anchor.href = url;
      anchor.download =
        'nexorium-site-config.json';

      document.body.appendChild(
        anchor
      );

      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);

      flash(
        'Site configuration exported.'
      );
    } catch (error) {
      console.error(
        'Export failed:',
        error
      );

      flash(
        'Could not export configuration.'
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * CONFIG REQUIRED
   * ---------------------------------------------------------
   */

  if (!firebaseConfigured) {
    return (
      <div className="admin-page-screen">
        <div className="admin-panel standalone">
          <div className="admin-top">
            <div>
              <span className="eyebrow">
                // CONFIG REQUIRED
              </span>

              <h2>
                FIREBASE NOT CONFIGURED
              </h2>

              <p>
                Add the Firebase variables
                to .env.local, then restart
                the dev server.
              </p>
            </div>
          </div>

          <div className="admin-content">
            <a
              className="primary-btn big"
              href="/"
            >
              ← BACK TO SITE
            </a>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * AUTH REQUIRED
   * ---------------------------------------------------------
   */

  if (!me) {
    return (
      <div className="admin-page-screen">
        <div className="admin-panel standalone">
          <div className="admin-top">
            <div>
              <span className="eyebrow">
                // AUTHENTICATION
              </span>

              <h2>
                SIGN IN REQUIRED
              </h2>

              <p>
                Sign in on the storefront
                with your Firebase account
                before opening the Admin
                Console.
              </p>
            </div>
          </div>

          <div className="admin-content">
            <a
              className="primary-btn big"
              href="/"
            >
              ← GO TO SIGN IN
            </a>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * PROFILE LOADING
   *
   * Important: don't immediately show
   * "ADMIN ONLY" while Firestore profile
   * is still loading.
   * ---------------------------------------------------------
   */

  if (profile === null) {
    return (
      <div className="admin-page-screen">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="grid-glow" />

        <div className="admin-panel standalone">
          <div className="admin-top">
            <div>
              <span className="eyebrow">
                // VERIFYING ACCESS
              </span>

              <h2>
                CHECKING ADMIN ROLE
              </h2>

              <p>
                Verifying your Firebase
                account permissions…
              </p>
            </div>
          </div>

          <div className="admin-content">
            <div className="admin-note">
              Account:
              {' '}
              <code>
                {me.email ||
                  me.uid}
              </code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * ADMIN ONLY
   * ---------------------------------------------------------
   */

  if (!isAdmin) {
    return (
      <div className="admin-page-screen">
        <div className="admin-panel standalone">
          <div className="admin-top">
            <div>
              <span className="eyebrow">
                // ACCESS DENIED
              </span>

              <h2>
                ADMIN ONLY
              </h2>

              <p>
                This Firebase account does
                not currently have an enabled
                <code>
                  {' '}
                  admin
                </code>
                {' '}
                role.
              </p>
            </div>
          </div>

          <div className="admin-content">
            <div className="admin-note">
              Set
              {' '}
              <code>
                users/{me.uid}
              </code>
              {' '}
              to
              {' '}
              <code>
                role: admin
              </code>
              {' '}
              and
              {' '}
              <code>
                disabled: false
              </code>
              {' '}
              in Firestore, then sign in
              again.
            </div>

            <a
              className="outline-btn big"
              href="/"
            >
              ← RETURN TO STORE
            </a>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * ADMIN DASHBOARD
   * ---------------------------------------------------------
   */

  return (
    <div className="admin-page-screen">

      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-glow" />

      {/* TOP HEADER */}
      <header className="admin-route-head">

        <a
          href="/"
          className="logo-lockup"
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

        <div className="top-actions">

          <button
            className="theme-toggle"
            onClick={() =>
              setTheme((value) =>
                value === 'dark'
                  ? 'light'
                  : 'dark'
              )
            }
            type="button"
          >
            <span className="theme-icon">
              {theme === 'dark'
                ? '☀'
                : '☾'}
            </span>

            <span className="theme-text">
              {theme === 'dark'
                ? 'LIGHT'
                : 'DARK'}
            </span>
          </button>

          <a
            className="ghost-btn"
            href="/"
          >
            ↗ STORE
          </a>

          <button
            className="account-chip"
            onClick={doLogout}
            type="button"
          >
            <span className="account-avatar">
              {(
                me.displayName ||
                me.email ||
                'A'
              )
                .slice(0, 1)
                .toUpperCase()}
            </span>

            <span>
              {me.displayName ||
                me.email}
            </span>

            <b>
              ADMIN
            </b>
          </button>

        </div>
      </header>

      <main className="admin-route-main">

        <div className="admin-panel standalone">

          {/* PANEL HEADER */}
          <div className="admin-top">

            <div>
              <span className="eyebrow">
                // ROOT CONSOLE
              </span>

              <h2>
                NEXORIUM ADMIN
              </h2>

              <p>
                Production control center
                for storefront content,
                payments, orders, and
                accounts.
              </p>
            </div>

            <div className="admin-top-actions">

              <span className="admin-pill">
                {pending} PENDING
              </span>

              <button
                className="outline-btn"
                onClick={() =>
                  setTheme((value) =>
                    value === 'dark'
                      ? 'light'
                      : 'dark'
                  )
                }
                type="button"
              >
                THEME
              </button>

            </div>
          </div>

          {/* ADMIN LAYOUT */}
          <div className="admin-layout">

            {/* NAVIGATION */}
            <nav className="admin-nav">

              {ADMIN_TABS.map(
                ([key, icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      tab === key
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setTab(key)
                    }
                  >
                    <span>
                      {icon}
                    </span>

                    {label}

                    {key === 'orders' &&
                    pending > 0 ? (
                      <em>
                        {pending}
                      </em>
                    ) : null}
                  </button>
                )
              )}

              <div className="admin-nav-bottom">

                <button
                  type="button"
                  onClick={exportData}
                >
                  ↓ EXPORT
                </button>

                <a
                  href="/"
                  className="outline-btn"
                >
                  ↗ STORE
                </a>

                <button
                  type="button"
                  onClick={doLogout}
                >
                  ⇥ SIGN OUT
                </button>

              </div>
            </nav>

            {/* CONTENT */}
            <div className="admin-content">

              {/* -------------------------------------------------
                  OVERVIEW
              -------------------------------------------------- */}
              {tab === 'overview' && (
                <div className="admin-page">

                  <div className="dash-cards">

                    <div>
                      <span>
                        PRODUCTS
                      </span>

                      <b>
                        {data.products.length}
                      </b>

                      <small>
                        Published modules
                      </small>
                    </div>

                    <div>
                      <span>
                        PENDING
                      </span>

                      <b>
                        {pending}
                      </b>

                      <small>
                        Awaiting verification
                      </small>
                    </div>

                    <div>
                      <span>
                        CONFIRMED
                      </span>

                      <b>
                        {confirmed}
                      </b>

                      <small>
                        Verified orders
                      </small>
                    </div>

                    <div>
                      <span>
                        USERS
                      </span>

                      <b>
                        {users.length}
                      </b>

                      <small>
                        Firebase accounts
                      </small>
                    </div>

                  </div>

                  <div className="admin-welcome">

                    <div>
                      <span className="eyebrow">
                        SYSTEM CONTROL
                      </span>

                      <h3>
                        Keep the original store.
                        Control everything here.
                      </h3>

                      <p>
                        Content, products, the
                        supplied GCash QR,
                        payment instructions,
                        order verification,
                        and account roles are
                        all controlled from the
                        same neon console.
                      </p>
                    </div>

                    <button
                      className="primary-btn big"
                      type="button"
                      onClick={() =>
                        setTab('orders')
                      }
                    >
                      {pending
                        ? 'REVIEW PENDING ORDERS →'
                        : 'OPEN ORDER QUEUE →'}
                    </button>

                  </div>

                  <div className="admin-note">
                    Telegram confirmation uses
                    the same production order
                    record as this dashboard.
                    Confirming from here also
                    creates the customized
                    receipt image and sends it
                    to the configured Telegram
                    admin chat.
                  </div>

                </div>
              )}

              {/* -------------------------------------------------
                  CONTENT
              -------------------------------------------------- */}
              {tab === 'content' && (
                <div className="admin-page">

                  <div className="admin-section-title">

                    <div>
                      <span className="eyebrow">
                        // STOREFRONT CONTENT
                      </span>

                      <h3>
                        Existing UI content
                      </h3>
                    </div>

                    <button
                      className="primary-btn"
                      onClick={saveSite}
                      disabled={busy}
                      type="button"
                    >
                      {busy
                        ? 'SAVING…'
                        : 'SAVE CHANGES'}
                    </button>

                  </div>

                  <div className="form-grid">

                    <div>

                      <label>
                        Brand

                        <input
                          value={data.brand}
                          onChange={(e) =>
                            setData({
                              ...data,
                              brand:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Sub-brand

                        <input
                          value={
                            data.subbrand
                          }
                          onChange={(e) =>
                            setData({
                              ...data,
                              subbrand:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Announcement

                        <input
                          value={
                            data.announcement
                          }
                          onChange={(e) =>
                            setData({
                              ...data,
                              announcement:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Telegram URL

                        <input
                          value={
                            data.telegram
                          }
                          onChange={(e) =>
                            setData({
                              ...data,
                              telegram:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                    </div>

                    <div>

                      <label>
                        Hero title

                        <input
                          value={data.hero}
                          onChange={(e) =>
                            setData({
                              ...data,
                              hero:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Hero description

                        <textarea
                          value={
                            data.heroText
                          }
                          onChange={(e) =>
                            setData({
                              ...data,
                              heroText:
                                e.target
                                  .value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Support note

                        <textarea
                          value={
                            data.payment
                              .note
                          }
                          onChange={(e) =>
                            setData({
                              ...data,

                              payment: {
                                ...data.payment,
                                note: e.target
                                  .value,
                              },
                            })
                          }
                        />
                      </label>

                    </div>

                  </div>

                </div>
              )}

              {/* -------------------------------------------------
                  PRODUCTS
              -------------------------------------------------- */}
              {tab === 'products' && (
                <div className="admin-page">

                  <div className="admin-section-title">

                    <div>
                      <span className="eyebrow">
                        // PRODUCT MANAGER
                      </span>

                      <h3>
                        Products
                      </h3>
                    </div>

                    <button
                      className="primary-btn"
                      onClick={addProduct}
                      type="button"
                    >
                      + ADD PRODUCT
                    </button>

                  </div>

                  <div className="product-admin-list">

                    {data.products.map(
                      (product, index) => (
                        <div
                          className="product-admin-row"
                          key={`${product.name}-${index}-${product.imageVersion || product.image || ''}`}
                        >

                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name || 'Product image'}
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                                event.currentTarget.parentElement?.classList.add('image-load-error');
                              }}
                            />
                          ) : (
                            <div className="admin-image-empty">NO IMAGE</div>
                          )}

                          <div className="product-admin-fields">

                            <input
                              value={
                                product.name
                              }
                              onChange={(e) =>
                                updateProduct(
                                  index,
                                  {
                                    name:
                                      e.target
                                        .value,
                                  }
                                )
                              }
                            />

                            <div className="inline-fields">

                              <input
                                value={
                                  product.version ||
                                  ''
                                }
                                onChange={(e) =>
                                  updateProduct(
                                    index,
                                    {
                                      version:
                                        e.target
                                          .value,
                                    }
                                  )
                                }
                              />

                              <input
                                value={
                                  product.status ||
                                  ''
                                }
                                onChange={(e) =>
                                  updateProduct(
                                    index,
                                    {
                                      status:
                                        e.target
                                          .value,
                                    }
                                  )
                                }
                              />

                              <input
                                value={
                                  product.price ||
                                  ''
                                }
                                onChange={(e) =>
                                  updateProduct(
                                    index,
                                    {
                                      price:
                                        e.target
                                          .value,
                                    }
                                  )
                                }
                              />

                            </div>

                            <textarea
                              value={
                                product.desc ||
                                ''
                              }
                              onChange={(e) =>
                                updateProduct(
                                  index,
                                  {
                                    desc:
                                      e.target
                                        .value,
                                  }
                                )
                              }
                            />

                            <input
                              value={
                                product.deliveryUrl ||
                                ''
                              }
                              placeholder="Delivery / key URL after confirmation"
                              onChange={(e) =>
                                updateProduct(
                                  index,
                                  {
                                    deliveryUrl:
                                      e.target
                                        .value,
                                  }
                                )
                              }
                            />

                            <div className="pricing-admin">
                              <div className="pricing-admin-head">
                                <div>
                                  <span className="eyebrow">// PRICING</span>
                                  <b>PRICE OPTIONS</b>
                                </div>
                                <button
                                  className="outline-btn"
                                  type="button"
                                  onClick={() => addPriceOption(index)}
                                >
                                  + ADD TIER
                                </button>
                              </div>

                              {Array.isArray(product.priceOptions) && product.priceOptions.length ? (
                                <div className="pricing-option-list">
                                  {product.priceOptions.map((option, optionIndex) => (
                                    <div className="pricing-option-row" key={`${index}-${optionIndex}`}>
                                      <input
                                        value={option.label || ''}
                                        placeholder="30 DAYS"
                                        onChange={(e) => updatePriceOption(index, optionIndex, { label: e.target.value })}
                                      />
                                      <input
                                        value={option.price || ''}
                                        placeholder="₱250"
                                        onChange={(e) => updatePriceOption(index, optionIndex, { price: e.target.value })}
                                      />
                                      <input
                                        value={option.slots || ''}
                                        placeholder="0/5"
                                        onChange={(e) => updatePriceOption(index, optionIndex, { slots: e.target.value })}
                                      />
                                      <button
                                        className="danger-btn"
                                        type="button"
                                        onClick={() => deletePriceOption(index, optionIndex)}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="pricing-empty">Add tiers such as 30 DAYS / ₱250 / 0/5 and LIFETIME / ₱350 / 0/3.</p>
                              )}
                            </div>

                            <label className="upload-small">
                              UPLOAD IMAGE

                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                disabled={uploadingProductIndex === index}
                                onChange={(e) => {
                                  const file = e.currentTarget.files?.[0];
                                  e.currentTarget.value = '';
                                  if (file) publishProductImage(index, file);
                                }}
                              />
                            </label>

                          </div>

                          <button
                            className="danger-btn"
                            onClick={() =>
                              deleteProduct(
                                index
                              )
                            }
                            type="button"
                          >
                            DELETE
                          </button>

                        </div>
                      )
                    )}

                  </div>

                  <button
                    className="primary-btn big save-btn"
                    onClick={saveSite}
                    disabled={busy}
                    type="button"
                  >
                    {busy
                      ? 'SAVING PRODUCTS…'
                      : 'SAVE PRODUCTS'}
                  </button>

                </div>
              )}

              {/* -------------------------------------------------
                  PAYMENTS
              -------------------------------------------------- */}
              {tab === 'payments' && (
                <div className="admin-page">

                  <div className="admin-section-title">

                    <div>
                      <span className="eyebrow">
                        // G CASH PAYMENT
                      </span>

                      <h3>
                        Merchant QR
                      </h3>
                    </div>

                    <button
                      className="primary-btn"
                      onClick={saveSite}
                      disabled={busy}
                      type="button"
                    >
                      {busy
                        ? 'SAVING…'
                        : 'SAVE PAYMENT'}
                    </button>

                  </div>

                  <div className="form-grid">

                    <div>

                      <label>
                        Merchant name

                        <input
                          value={
                            data.payment
                              .merchantName
                          }
                          onChange={(e) =>
                            setData({
                              ...data,

                              payment: {
                                ...data.payment,
                                merchantName:
                                  e.target
                                    .value,
                              },
                            })
                          }
                        />
                      </label>

                      <label>
                        Provider checkout URL
                        (optional)

                        <input
                          value={
                            data.payment
                              .gcashOpenUrl
                          }
                          placeholder="Only use a real provider URL"
                          onChange={(e) =>
                            setData({
                              ...data,

                              payment: {
                                ...data.payment,
                                gcashOpenUrl:
                                  e.target
                                    .value,
                              },
                            })
                          }
                        />
                      </label>

                      <div className="admin-note">
                        Your storefront uses
                        the supplied GCash QR at
                        <code>
                          {' '}
                          /gcash-payment-qr.png
                        </code>
                        {' '}
                        by default. The
                        payment card
                        intentionally shows
                        the merchant name and
                        QR rather than
                        exposing extra
                        personal fields.
                      </div>

                    </div>

                    <div className="qr-admin">

                      <div className="qr-preview-box">
                        <img
                          src={
                            qrPreview ||
                            data.payment
                              .qrImage ||
                            '/gcash-payment-qr.png'
                          }
                          alt="GCash merchant QR"
                        />
                      </div>

                      <label className="upload-label">
                        REPLACE MERCHANT QR

                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            changeQr(
                              e.target
                                .files?.[0]
                            )
                          }
                        />
                      </label>

                    </div>

                  </div>

                </div>
              )}

              {/* -------------------------------------------------
                  ORDERS
              -------------------------------------------------- */}
              {tab === 'orders' && (
                <div className="admin-page">

                  <div className="admin-section-title">

                    <div>
                      <span className="eyebrow">
                        // VERIFICATION QUEUE
                      </span>

                      <h3>
                        Orders
                      </h3>
                    </div>

                    <span className="admin-pill">
                      {pending} PENDING
                    </span>

                  </div>

                  {orders.length === 0 ? (
                    <div className="empty-admin-state">
                      No orders yet. A customer
                      receipt submission will
                      appear here and in Telegram.
                    </div>
                  ) : (
                    <div className="orders-admin-list">

                      {orders.map(
                        (order) => (
                          <div
                            className="order-admin-row"
                            key={order.id}
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
                                  order.usernameMasked ||
                                  order.userEmail
                                }
                                {' • '}
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
                                {order.id}
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
    href={order.receiptData}
    target="_blank"
    rel="noreferrer"
  >
    VIEW RECEIPT IMAGE ↗
  </a>
)}

                            </div>

                            <div className="order-admin-actions">

                              {order.status ===
                              'pending' ? (
                                <>
                                  <button
                                    className="primary-btn"
                                    disabled={busy}
                                    onClick={() =>
                                      setOrderStatus(
                                        order.id,
                                        'confirmed'
                                      )
                                    }
                                    type="button"
                                  >
                                    CONFIRM
                                  </button>

                                  <button
                                    className="danger-btn"
                                    disabled={busy}
                                    onClick={() =>
                                      setOrderStatus(
                                        order.id,
                                        'rejected'
                                      )
                                    }
                                    type="button"
                                  >
                                    REJECT
                                  </button>
                                </>
                              ) : (
                                <small>
                                  REVIEWED
                                </small>
                              )}

                            </div>

                          </div>
                        )
                      )}

                    </div>
                  )}

                </div>
              )}

              {/* -------------------------------------------------
                  ACCOUNTS
              -------------------------------------------------- */}
              {tab === 'accounts' && (
                <div className="admin-page">

                  <div className="admin-section-title">

                    <div>
                      <span className="eyebrow">
                        // USER MANAGEMENT
                      </span>

                      <h3>
                        Accounts
                      </h3>
                    </div>

                    <span className="admin-pill">
                      {users.length} USERS
                    </span>

                  </div>

                  <div className="users-admin-list">

                    {users.map(
                      (user) => (
                        <div
                          className="user-admin-row"
                          key={user.id}
                        >

                          <div>

                            <b>
                              {
                                user.displayName ||
                                user.email ||
                                user.id
                              }
                            </b>

                            <small>
                              {
                                user.email ||
                                'No email'
                              }
                              {' • UID: '}
                              {user.id}
                            </small>

                            <span
                              className={`user-role ${
                                user.role ===
                                'admin'
                                  ? 'admin'
                                  : ''
                              }`}
                            >
                              {String(
                                user.role ||
                                  'member'
                              ).toUpperCase()}
                            </span>

                          </div>

                          <div className="user-admin-actions">

                            <button
                              className="outline-btn"
                              disabled={
                                user.id ===
                                me.uid
                              }
                              onClick={() =>
                                setUserRole(
                                  user.id,
                                  user.role ===
                                    'admin'
                                    ? 'member'
                                    : 'admin'
                                )
                              }
                              type="button"
                            >
                              {user.role ===
                              'admin'
                                ? 'MAKE MEMBER'
                                : 'MAKE ADMIN'}
                            </button>

                            <button
                              className="danger-btn"
                              disabled={
                                user.id ===
                                me.uid
                              }
                              onClick={() =>
                                setDisabled(
                                  user.id,
                                  !user.disabled
                                )
                              }
                              type="button"
                            >
                              {user.disabled
                                ? 'ENABLE'
                                : 'DISABLE'}
                            </button>

                          </div>

                        </div>
                      )
                    )}

                  </div>

                  <div className="admin-note">
                    Do not disable or demote
                    your currently signed-in
                    admin account from this
                    screen.
                  </div>

                </div>
              )}

              {/* -------------------------------------------------
                  PROFILE
              -------------------------------------------------- */}
              {tab === 'profile' && (
                <div className="admin-page">
                  <div className="admin-section-title">
                    <div>
                      <span className="eyebrow">// ADMIN PROFILE</span>
                      <h3>Profile & Security</h3>
                    </div>
                  </div>

                  <div className="profile-card-admin profile-card-enhanced">
                    <div className="profile-big">
                      {profile?.photoURL ? (
                        <img src={profile.photoURL} alt="Profile" />
                      ) : (
                        (me?.displayName || me?.email || 'A').slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div>
                      <b>{me?.displayName || 'Administrator'}</b>
                      <span>{me?.email || 'No email'}</span>
                      <small>ADMIN ACCOUNT</small>
                    </div>
                    <label className="outline-btn profile-upload-btn">
                      CHANGE PHOTO
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => uploadProfilePicture(event.target.files?.[0])}
                      />
                    </label>
                  </div>

                  <div className="security-card-admin">
                    <div>
                      <span className="eyebrow">// ACCOUNT SECURITY</span>
                      <h4>Password</h4>
                      <p>Send a secure password-reset email to the current administrator account.</p>
                    </div>
                    <button className="primary-btn" type="button" onClick={resetPassword} disabled={busy}>
                      {busy ? 'PROCESSING…' : 'RESET PASSWORD'}
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------
                  SETTINGS
              -------------------------------------------------- */}
              {tab === 'settings' && (
                <div className="admin-page">
                  <div className="admin-section-title">
                    <div>
                      <span className="eyebrow">// CONSOLE PREFERENCES</span>
                      <h3>Settings</h3>
                    </div>
                  </div>

                  <div className="settings-grid-admin">
                    <button className="settings-card-admin" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>
                      <span>DISPLAY THEME</span>
                      <b>{theme.toUpperCase()}</b>
                      <small>Switch the admin console appearance.</small>
                    </button>
                    <button className="settings-card-admin" type="button" onClick={() => setTab('orders')}>
                      <span>ORDER QUEUE</span>
                      <b>{pending} PENDING</b>
                      <small>Open the verification queue.</small>
                    </button>
                  </div>

                  <div className="admin-note">
                    Firebase remains the source of truth for roles, orders, products, and published storefront content.
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* FOOTER */}
          <div className="admin-footer">

            <span>
              KAELHAX // NEXORIUM ADMIN
            </span>

            <button
              className="outline-btn"
              onClick={doLogout}
              type="button"
            >
              SIGN OUT
            </button>

          </div>

        </div>
      </main>

      {message && (
        <div className="toast">
          <span>
            ✓
          </span>

          {message}
        </div>
      )}

    </div>
  );
}