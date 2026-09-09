import { getAdminDb } from '../../../../lib/firebase-admin';
import { getAdminUserFromRequest, jsonError } from '../../../../lib/server-auth';
import { createReceiptPng } from '../../../../lib/receipt';
import { sendReceiptImage } from '../../../../lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return jsonError('Invalid JSON request body.', 400);
    }

    // Accept only a string order ID. This also catches the old UI bug where
    // the whole order object was sent instead of order.id.
    const orderId =
      typeof body.orderId === 'string'
        ? body.orderId.trim()
        : '';

    const status =
      body.status === 'confirmed'
        ? 'confirmed'
        : body.status === 'rejected'
          ? 'rejected'
          : '';

    if (!orderId) {
      return jsonError('orderId must be a valid string.', 400);
    }

    if (!status) {
      return jsonError(
        'Valid status is required: confirmed or rejected.',
        400
      );
    }

    // Verify the Firebase ID token and the Firestore admin role.
    const adminUser = await getAdminUserFromRequest(request);
    const db = getAdminDb();

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return jsonError('Order not found.', 404);
    }

    const order = {
      id: orderSnap.id,
      ...orderSnap.data(),
    };

    if (order.status !== 'pending') {
      return Response.json({
        ok: true,
        alreadyProcessed: true,
        message: `Order is already ${order.status}.`,
        order,
      });
    }

    const reviewedAt = new Date();

    const updateData = {
      status,
      reviewedAt,
      reviewedBy: adminUser.uid,
      updatedAt: reviewedAt,
    };

    let receiptSent = false;
    let receiptMessageId = null;
    let telegramError = null;

    // Confirm/reject the order in Firestore first so the status is never left
    // pending just because Telegram is temporarily unavailable.
    await orderRef.update(updateData);

    if (status === 'confirmed') {
      try {
        const receipt = await createReceiptPng({
          ...order,
          ...updateData,
        });

        const caption =
          `✅ <b>Payment Confirmed</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `👤 User: <code>${escapeHtml(
            order.usernameMasked || order.userEmail || 'CUSTOMER'
          )}</code>\n` +
          `📦 Product: <b>${escapeHtml(
            order.productName || 'NEXORIUM Product'
          )}</b>\n` +
          `⏳ Duration: ${escapeHtml(
            order.duration || order.productVersion || 'N/A'
          )}\n` +
          `💰 Amount Paid: <b>${escapeHtml(
            order.amount || '—'
          )} Credits</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🆔 Order: <code>${escapeHtml(orderId)}</code>`;

        const message = await sendReceiptImage(
          receipt,
          `${orderId}.png`,
          caption,
          order.deliveryUrl || ''
        );

        receiptMessageId = message?.message_id ?? null;
        receiptSent = Boolean(receiptMessageId);

        if (receiptMessageId) {
          await orderRef.update({
            receiptTelegramMessageId: receiptMessageId,
            receiptSentAt: new Date(),
          });
        }
      } catch (error) {
        telegramError =
          error instanceof Error
            ? error.message
            : String(error);
        console.error('Telegram receipt error:', error);
      }
    }

    return Response.json({
      ok: true,
      message:
        status === 'confirmed'
          ? receiptSent
            ? 'Order confirmed and receipt sent to Telegram.'
            : 'Order confirmed. Telegram receipt was not sent.'
          : 'Order rejected successfully.',
      order: {
        ...order,
        ...updateData,
        ...(receiptMessageId
          ? {
              receiptTelegramMessageId: receiptMessageId,
              receiptSentAt: new Date(),
            }
          : {}),
      },
      telegram: {
        receiptSent,
        receiptMessageId,
        error: telegramError,
      },
    });
  } catch (error) {
    console.error('Admin order error:', error);
    return jsonError(error, 500);
  }
}
