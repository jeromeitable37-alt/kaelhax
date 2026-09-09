import { getAdminDb } from '../../../../lib/firebase-admin';
import { verifyBearerToken, jsonError } from '../../../../lib/server-auth';
import { sendOrderReceiptForReview } from '../../../../lib/telegram';

export const runtime = 'nodejs';

function parseReceiptDataUrl(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);

  if (!match) {
    throw new Error('The stored receipt image is invalid.');
  }

  const contentType = match[1].toLowerCase().replace('jpg', 'jpeg');
  const buffer = Buffer.from(match[2], 'base64');

  if (!buffer.length) {
    throw new Error('The stored receipt image is empty.');
  }

  return {
    buffer,
    contentType,
    filename: `payment-receipt.${contentType === 'image/png' ? 'png' : 'jpg'}`,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(request) {
  try {
    const decoded = await verifyBearerToken(request);
    const db = getAdminDb();

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON request body.', 400);
    }

    const orderId = String(body?.orderId || '').trim();

    if (!orderId) {
      return jsonError('orderId is required.', 400);
    }

    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      return jsonError('Order not found.', 404);
    }

    const order = { id: snap.id, ...snap.data() };

    if (order.userId !== decoded.uid) {
      return jsonError('You are not allowed to submit this order.', 403);
    }

    if (order.status !== 'pending') {
      return Response.json({
        ok: true,
        alreadyProcessed: true,
        message: `Order is already ${order.status}.`,
      });
    }

    if (!order.receiptData) {
      return jsonError('Receipt image is missing from the order.', 400);
    }

    const imageFile = parseReceiptDataUrl(order.receiptData);

    const caption =
      `🧾 <b>NEW PAYMENT VERIFICATION</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 User: <code>${escapeHtml(order.usernameMasked || order.userEmail || 'CUSTOMER')}</code>\n` +
      `📦 Product: <b>${escapeHtml(order.productName || 'NEXORIUM Product')}</b>\n` +
      `⏳ Duration: ${escapeHtml(order.duration || 'N/A')}\n` +
      `💰 Amount: <b>${escapeHtml(order.amount || '—')}</b>\n` +
      `🧾 Reference: <code>${escapeHtml(order.paymentReference || '—')}</code>\n` +
      `🆔 Order: <code>${escapeHtml(orderId)}</code>`;

    const message = await sendOrderReceiptForReview({
      imageFile,
      caption,
      orderId,
    });

    await orderRef.update({
      telegramMessageId: message?.message_id || null,
      telegramNotifiedAt: new Date(),
      updatedAt: new Date(),
    });

    return Response.json({
      ok: true,
      message: 'Payment receipt sent for manual verification.',
      telegramMessageId: message?.message_id || null,
    });
  } catch (error) {
    console.error('Telegram order error:', error);
    return jsonError(error, 500);
  }
}
