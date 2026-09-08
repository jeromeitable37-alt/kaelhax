import { randomUUID } from 'crypto';
import { adminDb, adminBucket, getAdminAuth } from '../../../../lib/firebase-admin';
import { sendOrderReceiptForReview } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskEmail(email = '') {
  const [name, domain] = String(email).split('@');
  if (!name) return 'CUSTOMER';
  if (!domain) return `${name.slice(0, 2)}****`;
  return `${name.slice(0, 2)}****@${domain}`;
}

function safeFilename(name = 'receipt.jpg') {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned.slice(-120) || 'receipt.jpg';
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return Response.json({ error: 'Sign in is required.' }, { status: 401 });
    const token = authHeader.slice(7);
    const adminAuth = await getAdminAuth();
    const user = await adminAuth.verifyIdToken(token);
    const profileSnap = await adminDb.collection('users').doc(user.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : {};
    if (profile.disabled === true) return Response.json({ error: 'This account is disabled.' }, { status: 403 });

    const form = await request.formData();
    const receipt = form.get('receipt');
    if (!receipt || typeof receipt.arrayBuffer !== 'function') return Response.json({ error: 'A payment receipt image is required.' }, { status: 400 });
    const size = Number(receipt.size || 0);
    if (size <= 0 || size > 8 * 1024 * 1024) return Response.json({ error: 'Receipt must be an image up to 8 MB.' }, { status: 400 });
    const contentType = String(receipt.type || '');
    if (!contentType.startsWith('image/')) return Response.json({ error: 'Receipt must be an image.' }, { status: 400 });

    const productName = String(form.get('productName') || 'NEXORIUM Product').slice(0, 160);
    const duration = String(form.get('duration') || 'N/A').slice(0, 80);
    const amount = String(form.get('amount') || '0').slice(0, 40);
    const paymentReference = String(form.get('paymentReference') || '').slice(0, 120);
    const deliveryUrl = String(form.get('deliveryUrl') || '').slice(0, 1000);

    const orderId = `NX-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const buffer = Buffer.from(await receipt.arrayBuffer());
    const filePath = `receipts/${user.uid}/${orderId}-${safeFilename(receipt.name)}`;
    const file = adminBucket.file(filePath);
    await file.save(buffer, { metadata: { contentType, cacheControl: 'private,max-age=3600' }, resumable: false });
    const [receiptUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    const order = {
      userId: user.uid,
      userEmail: user.email || profile.email || '',
      usernameMasked: maskEmail(user.email || profile.email || ''),
      productName,
      duration,
      amount,
      paymentReference,
      deliveryUrl,
      receiptUrl,
      storagePath: filePath,
      status: 'pending',
      createdAt: new Date(),
    };
    await adminDb.collection('orders').doc(orderId).set(order);

    const caption = `🧾 <b>New Order</b>\n━━━━━━━━━━━━━━━━━━\n👤 User: <code>${order.usernameMasked}</code>\n━━━━━━━━━━━━━━━━━━\n📦 Product: <b>${escapeHtml(productName)}</b>\n⏳ Duration: ${escapeHtml(duration)}\n💰 Amount Paid: <b>${escapeHtml(amount)} Credits</b>\n${paymentReference ? `🔖 Reference: <code>${escapeHtml(paymentReference)}</code>\n` : ''}━━━━━━━━━━━━━━━━━━\n🆔 Order: <code>${orderId}</code>`;

    const telegramMessage = await sendOrderReceiptForReview({
      imageFile: { buffer, contentType, filename: safeFilename(receipt.name) },
      caption,
      orderId,
    });
    await adminDb.collection('orders').doc(orderId).update({ telegramMessageId: telegramMessage.message_id, telegramChatId: telegramMessage.chat?.id ?? null });

    return Response.json({ ok: true, order: { id: orderId, ...order } });
  } catch (error) {
    console.error('Telegram order error:', error);
    return Response.json({ error: error?.message || 'Could not submit the order.' }, { status: 500 });
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
