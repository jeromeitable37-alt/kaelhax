import { getAdminDb } from '../../../../lib/firebase-admin';
import {
  answerCallbackQuery,
  editMessageCaption,
  sendReceiptImage,
  assertTelegramAdmin,
  sendMessage,
} from '../../../../lib/telegram';
import { createReceiptPng } from '../../../../lib/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (
      secret &&
      request.headers.get('x-telegram-bot-api-secret-token') !== secret
    ) {
      return new Response('Unauthorized', { status: 401 });
    }

    const update = await request.json();

    /*
     * ---------------------------------------------------------
     * TELEGRAM DATABASE
     * ---------------------------------------------------------
     */
    const adminDb = getAdminDb();

    /*
     * ---------------------------------------------------------
     * NORMAL BOT MESSAGES
     * ---------------------------------------------------------
     */
    if (update?.message) {
      const message = update.message;
      const chatId = message?.chat?.id;
      const text = String(message?.text || '').trim();

      if (chatId && (text === '/start' || text === '/help')) {
        await sendMessage(
          chatId,
          '🤖 <b>KAELHAX NEXORIUM BOT</b>\n\n' +
            'Payment verification bot is online.\n\n' +
            '🧾 Send your payment through the website and your receipt ' +
            'will be sent here for admin verification.',
          'HTML'
        );
      } else if (chatId && text === '/ping') {
        await sendMessage(
          chatId,
          '✅ <b>Bot is online.</b>',
          'HTML'
        );
      }

      return Response.json({ ok: true });
    }

    /*
     * ---------------------------------------------------------
     * CALLBACK QUERY REQUIRED
     * ---------------------------------------------------------
     */
    if (!update?.callback_query) {
      return Response.json({ ok: true });
    }

    /*
     * ---------------------------------------------------------
     * ADMIN AUTHORIZATION
     * ---------------------------------------------------------
     */
    if (!assertTelegramAdmin(update)) {
      await answerCallbackQuery(
        update.callback_query.id,
        'Not authorized.'
      );

      return Response.json({ ok: true });
    }

    /*
     * ---------------------------------------------------------
     * CALLBACK DATA
     * ---------------------------------------------------------
     */
    const callback = String(
      update.callback_query.data || ''
    );

    const match = callback.match(
      /^order:(confirm|reject):(.+)$/
    );

    if (!match) {
      await answerCallbackQuery(
        update.callback_query.id,
        'Unknown action.'
      );

      return Response.json({ ok: true });
    }

    const [, action, orderId] = match;

    /*
     * ---------------------------------------------------------
     * LOAD ORDER
     * ---------------------------------------------------------
     */
    const orderRef = adminDb
      .collection('orders')
      .doc(orderId);

    const snap = await orderRef.get();

    if (!snap.exists) {
      await answerCallbackQuery(
        update.callback_query.id,
        'Order not found.'
      );

      return Response.json({ ok: true });
    }

    const order = {
      id: snap.id,
      ...snap.data(),
    };

    /*
     * ---------------------------------------------------------
     * PREVENT DOUBLE PROCESSING
     * ---------------------------------------------------------
     */
    if (order.status !== 'pending') {
      await answerCallbackQuery(
        update.callback_query.id,
        `Already ${order.status}.`
      );

      return Response.json({ ok: true });
    }

    const reviewer = update.callback_query.from;

    /*
     * ---------------------------------------------------------
     * REJECT ORDER
     * ---------------------------------------------------------
     */
    if (action === 'reject') {
      await orderRef.update({
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedByTelegramUserId:
          reviewer?.id ?? null,
      });

      const rejectionCaption =
        `❌ <b>Order Rejected</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🆔 Order: <code>${escapeHtml(orderId)}</code>\n` +
        `📦 Product: <b>${escapeHtml(
          order.productName || 'N/A'
        )}</b>\n` +
        `👤 User: <code>${escapeHtml(
          order.usernameMasked ||
            order.userEmail ||
            'Unknown'
        )}</code>`;

      const callbackMessage =
        update.callback_query.message;

      if (
        callbackMessage?.chat?.id &&
        callbackMessage?.message_id
      ) {
        await editMessageCaption(
          callbackMessage.chat.id,
          callbackMessage.message_id,
          rejectionCaption
        );
      }

      await answerCallbackQuery(
        update.callback_query.id,
        'Order rejected.'
      );

      return Response.json({ ok: true });
    }

    /*
     * ---------------------------------------------------------
     * CONFIRM ORDER
     * ---------------------------------------------------------
     */
    const receipt = await createReceiptPng({
      ...order,
      status: 'confirmed',
    });

    const receiptCaption =
      `✅ <b>Payment Confirmed</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 User: <code>${escapeHtml(
        order.usernameMasked ||
          order.userEmail ||
          'Unknown'
      )}</code>\n` +
      `📦 Product: <b>${escapeHtml(
        order.productName || 'N/A'
      )}</b>\n` +
      `⏳ Duration: ${escapeHtml(
        order.duration || 'N/A'
      )}\n` +
      `💰 Amount Paid: <b>${escapeHtml(
        order.amount || '—'
      )} Credits</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 Order: <code>${escapeHtml(
        orderId
      )}</code>`;

    const receiptMessage = await sendReceiptImage(
      receipt,
      `${orderId}.png`,
      receiptCaption,
      order.deliveryUrl || ''
    );

    await orderRef.update({
      status: 'confirmed',
      reviewedAt: new Date(),
      reviewedByTelegramUserId:
        reviewer?.id ?? null,
      receiptSentAt: new Date(),
      receiptTelegramMessageId:
        receiptMessage?.message_id ?? null,
    });

    const callbackMessage =
      update.callback_query.message;

    const confirmedCaption =
      `✅ <b>Payment Confirmed</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🆔 Order: <code>${escapeHtml(
        orderId
      )}</code>\n` +
      `📦 Product: <b>${escapeHtml(
        order.productName || 'N/A'
      )}</b>\n` +
      `👤 User: <code>${escapeHtml(
        order.usernameMasked ||
          order.userEmail ||
          'Unknown'
      )}</code>\n` +
      `💰 Amount: <b>${escapeHtml(
        order.amount || '—'
      )} Credits</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🧾 Branded receipt generated.`;

    if (
      callbackMessage?.chat?.id &&
      callbackMessage?.message_id
    ) {
      await editMessageCaption(
        callbackMessage.chat.id,
        callbackMessage.message_id,
        confirmedCaption
      );
    }

    await answerCallbackQuery(
      update.callback_query.id,
      'Payment confirmed. Receipt sent.'
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'Telegram webhook error:',
      error
    );

    /*
     * Telegram should receive a successful HTTP response
     * so it does not continuously retry the webhook update.
     */
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Telegram webhook failed.',
      },
      { status: 200 }
    );
  }
}