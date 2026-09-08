export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (expected && request.headers.get('x-telegram-setup-secret') !== expected) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!token || !site) return Response.json({ error: 'Set TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_SITE_URL first.' }, { status: 400 });
    const webhookUrl = `${site.replace(/\/$/, '')}/api/telegram/webhook`;
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined, allowed_updates: ['message', 'callback_query'] }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) return Response.json({ error: result.description || 'Telegram webhook setup failed.' }, { status: 502 });
    return Response.json({ ok: true, webhookUrl });
  } catch (error) {
    return Response.json({ error: error?.message || 'Webhook setup failed.' }, { status: 500 });
  }
}
