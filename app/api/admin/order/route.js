import {
  adminDb,
  getAdminUserFromRequest,
  jsonError,
} from "../../../../lib/server-auth";

import { createReceiptPng } from "../../../../lib/receipt";
import { sendReceiptImage } from "../../../../lib/telegram";

export const runtime = "nodejs";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(request) {
  try {
    const adminUser = await getAdminUserFromRequest(request);

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON request body.", 400);
    }

    const orderId = String(body?.orderId || "").trim();

    const status =
      body?.status === "confirmed"
        ? "confirmed"
        : body?.status === "rejected"
          ? "rejected"
          : "";

    if (!orderId) {
      return jsonError("orderId is required.", 400);
    }

    if (!status) {
      return jsonError(
        "Valid status is required: confirmed or rejected.",
        400
      );
    }

    const orderRef = adminDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return jsonError("Order not found.", 404);
    }

    const order = {
      id: orderSnap.id,
      ...orderSnap.data(),
    };

    // Already processed
    if (order.status !== "pending") {
      return Response.json({
        ok: true,
        alreadyProcessed: true,
        message: `Order is already ${order.status}.`,
        order,
      });
    }

    let receiptMessageId = null;
    let receiptSent = false;

    // ==========================================
    // CONFIRMED
    // ==========================================
    if (status === "confirmed") {
      try {
        const receipt = await createReceiptPng(order);

        const username =
          order.usernameMasked ||
          order.username ||
          order.userEmail ||
          "Unknown User";

        const productName =
          order.productName ||
          "NEXORIUM Product";

        const duration =
          order.duration ||
          order.productVersion ||
          "N/A";

        const amount = order.amount || "—";

        const caption =
          `✅ <b>Payment Confirmed</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `👤 User: <code>${escapeHtml(username)}</code>\n` +
          `📦 Product: <b>${escapeHtml(productName)}</b>\n` +
          `⏳ Duration: ${escapeHtml(duration)}\n` +
          `💰 Amount Paid: <b>${escapeHtml(amount)} Credits</b>\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🆔 Order: <code>${escapeHtml(orderId)}</code>`;

        try {
          const telegramMessage = await sendReceiptImage(
            receipt,
            `${orderId}.png`,
            caption,
            order.deliveryUrl || ""
          );

          receiptMessageId =
            telegramMessage?.message_id || null;

          receiptSent = Boolean(receiptMessageId);
        } catch (telegramError) {
          console.error(
            "Telegram receipt error:",
            telegramError
          );
        }
      } catch (receiptError) {
        console.error(
          "Receipt generation error:",
          receiptError
        );
      }
    }

    // ==========================================
    // UPDATE FIRESTORE
    // ==========================================
    const updateData = {
      status,
      reviewedAt: new Date(),
      reviewedBy: adminUser.uid,
      updatedAt: new Date(),
    };

    if (receiptMessageId) {
      updateData.receiptTelegramMessageId =
        receiptMessageId;

      updateData.receiptSentAt = new Date();
    }

    await orderRef.update(updateData);

    // ==========================================
    // SUCCESS
    // ==========================================
    return Response.json({
      ok: true,
      message:
        status === "confirmed"
          ? receiptSent
            ? "Order confirmed and receipt sent."
            : "Order confirmed. Telegram receipt was not sent."
          : "Order rejected successfully.",
      order: {
        ...order,
        ...updateData,
      },
      telegram: {
        receiptSent,
        receiptMessageId,
      },
    });
  } catch (error) {
    console.error("Admin order error:", error);

    return jsonError(
      error instanceof Error
        ? error.message
        : "Could not update order.",
      500
    );
  }
}