export async function POST(request) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const history = Array.isArray(body?.history) ? body.history.slice(-8) : [];
    const context = body?.context || {};

    if (!message) return Response.json({ error: 'Please enter a message.' }, { status: 400 });
    if (message.length > 500) return Response.json({ error: 'Message is too long.' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({
        answer: 'NEXORIUM AI is not connected yet. Configure OPENAI_API_KEY on the server, or use Telegram support for help.',
      });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    const safeProducts = Array.isArray(context.products) ? context.products.slice(0, 20) : [];
    const safeFaq = Array.isArray(context.faq) ? context.faq.slice(0, 20) : [];

    const systemPrompt = [
      'You are NEXORIUM AI Support for the KAELHAX gaming community website.',
      'Be helpful, concise, friendly, and accurate.',
      'Only answer using the provided site context when discussing products, prices, checkout, account features, or support.',
      'Never claim a payment is verified, an order is approved, or a product is delivered unless the site context explicitly says so.',
      'Do not ask users for passwords, OTPs, card numbers, or other secret credentials.',
      'For payment issues, tell users to keep their transaction/reference number and contact official support.',
      '',
      `Brand: ${String(context.brand || 'KAELHAX')}`,
      `Merchant: ${String(context.payment?.merchantName || 'KAELHAX / NEXORIUM')}`,
      `Payment note: ${String(context.payment?.note || '')}`,
      `Products: ${JSON.stringify(safeProducts)}`,
      `FAQ: ${JSON.stringify(safeFaq)}`,
      `Support: ${String(context.support || 'Official Telegram support')}`,
    ].join('\n');

    const input = [
      { role: 'system', content: systemPrompt },
      ...history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 1000) })),
      { role: 'user', content: message },
    ];

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: 500,
      }),
      cache: 'no-store',
    });

    const raw = await upstream.json();
    if (!upstream.ok) {
      const detail = raw?.error?.message || 'OpenAI request failed.';
      return Response.json({ error: detail }, { status: 502 });
    }

    const answer = raw?.output_text || raw?.output?.flatMap(item => item?.content || [])
      .map(part => part?.text || '')
      .join(' ')
      .trim();

    if (!answer) return Response.json({ error: 'The AI returned an empty response.' }, { status: 502 });
    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error?.message || 'AI support is temporarily unavailable.' }, { status: 500 });
  }
}
