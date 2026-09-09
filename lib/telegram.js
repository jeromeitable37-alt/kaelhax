function requireTelegramConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();

  if (!token || !chatId || token === 'PUT_YOUR_NEW_BOTFATHER_TOKEN_HERE') {
    throw new Error(
      'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID.'
    );
  }

  return { token, chatId };
}

async function parseTelegramResponse(response, method) {
  const text = await response.text();
  let result = null;

  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Telegram ${method} returned invalid JSON.`);
  }

  if (!response.ok || !result?.ok) {
    throw new Error(
      result?.description || `Telegram ${method} failed (HTTP ${response.status}).`
    );
  }

  return result.result;
}

async function telegramRequest(method, payload) {
  const { token } = requireTelegramConfig();

  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );

  return parseTelegramResponse(response, method);
}

export async function sendOrderReceiptForReview({ imageFile, caption, orderId }) {
  const { token, chatId } = requireTelegramConfig();
  const body = new FormData();

  body.append('chat_id', chatId);
  body.append(
    'photo',
    new Blob([imageFile.buffer], {
      type: imageFile.contentType || 'image/jpeg',
    }),
    imageFile.filename || `${orderId}.jpg`
  );
  body.append('caption', caption);
  body.append('parse_mode', 'HTML');
  body.append(
    'reply_markup',
    JSON.stringify({
      inline_keyboard: [
        [
          {
            text: '✅ CONFIRM',
            callback_data: `order:confirm:${orderId}`,
          },
          {
            text: '❌ REJECT',
            callback_data: `order:reject:${orderId}`,
          },
        ],
      ],
    })
  );

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendPhoto`,
    {
      method: 'POST',
      body,
      cache: 'no-store',
    }
  );

  return parseTelegramResponse(response, 'sendPhoto');
}

export async function sendMessage(chatId, text, parseMode = 'HTML') {
  return telegramRequest('sendMessage', {
    chat_id: String(chatId),
    text,
    parse_mode: parseMode,
  });
}

export async function answerCallbackQuery(id, text = '') {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: id,
    text,
  });
}

export async function editMessageCaption(chatId, messageId, caption) {
  return telegramRequest('editMessageCaption', {
    chat_id: String(chatId),
    message_id: Number(messageId),
    caption,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });
}

export async function sendReceiptImage(buffer, filename, caption, buyUrl = '') {
  const { token, chatId } = requireTelegramConfig();
  const body = new FormData();

  body.append('chat_id', chatId);
  body.append(
    'photo',
    new Blob([buffer], { type: 'image/png' }),
    filename || 'nexorium-receipt.png'
  );
  body.append('caption', caption);
  body.append('parse_mode', 'HTML');

  if (buyUrl) {
    body.append(
      'reply_markup',
      JSON.stringify({
        inline_keyboard: [[{ text: '🔑 BUY / GET KEY', url: buyUrl }]],
      })
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendPhoto`,
    {
      method: 'POST',
      body,
      cache: 'no-store',
    }
  );

  return parseTelegramResponse(response, 'sendPhoto');
}

export function assertTelegramAdmin(update) {
  const expectedChat = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();
  const expectedUser = String(process.env.TELEGRAM_ADMIN_USER_ID || '').trim();

  const chatId =
    update?.callback_query?.message?.chat?.id ??
    update?.callback_query?.from?.id;
  const userId = update?.callback_query?.from?.id;

  if (!expectedChat || String(chatId) !== expectedChat) return false;
  if (expectedUser && String(userId) !== expectedUser) return false;

  return true;
}
