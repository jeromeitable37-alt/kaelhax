function requireTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram verification is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID.');
  return { token, chatId };
}

async function telegramRequest(method, payload) {
  const { token } = requireTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, payload ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  } : undefined);
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed.`);
  return result.result;
}

export async function sendOrderReceiptForReview({ imageFile, caption, orderId }) {
  const { token, chatId } = requireTelegramConfig();
  const body = new FormData();
  body.append('chat_id', String(chatId));
  body.append('photo', new Blob([imageFile.buffer], { type: imageFile.contentType || 'image/jpeg' }), imageFile.filename || 'payment-receipt.jpg');
  body.append('caption', caption);
  body.append('parse_mode', 'HTML');
  body.append('reply_markup', JSON.stringify({ inline_keyboard: [[
    { text: '✅ CONFIRM', callback_data: `order:confirm:${orderId}` },
    { text: '❌ REJECT', callback_data: `order:reject:${orderId}` },
  ]] }));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram sendPhoto failed.');
  return result.result;
}


export async function sendMessage(chatId, text, parseMode = 'HTML') {
  return telegramRequest('sendMessage', { chat_id: String(chatId), text, parse_mode: parseMode });
}

export async function answerCallbackQuery(id, text = '') {
  return telegramRequest('answerCallbackQuery', { callback_query_id: id, text });
}

export async function editMessageCaption(chatId, messageId, caption) {
  return telegramRequest('editMessageCaption', { chat_id: chatId, message_id: messageId, caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
}

export async function sendReceiptImage(buffer, filename, caption, buyUrl = '') {
  const { token, chatId } = requireTelegramConfig();
  const body = new FormData();
  body.append('chat_id', String(chatId));
  body.append('photo', new Blob([buffer], { type: 'image/png' }), filename || 'nexorium-receipt.png');
  body.append('caption', caption);
  body.append('parse_mode', 'HTML');
  if (buyUrl) {
    body.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: '🔑 BUY / GET KEY', url: buyUrl }]] }));
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || 'Telegram receipt send failed.');
  return result.result;
}

export function assertTelegramAdmin(update) {
  const expectedChat = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '');
  const expectedUser = String(process.env.TELEGRAM_ADMIN_USER_ID || '');
  const chatId = update?.callback_query?.message?.chat?.id ?? update?.callback_query?.from?.id;
  const userId = update?.callback_query?.from?.id;
  if (!expectedChat || String(chatId) !== expectedChat) return false;
  if (expectedUser && String(userId) !== expectedUser) return false;
  return true;
}
