import sharp from 'sharp';

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function createReceiptPng(order) {
  const width = 1100;
  const height = 780;
  const date = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour12: true });
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071012"/><stop offset="1" stop-color="#102426"/></linearGradient>
      <linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#27e7d9"/><stop offset=".5" stop-color="#6a5cff"/><stop offset="1" stop-color="#27e7d9"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="10" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1100" height="780" rx="34" fill="url(#bg)"/>
    <circle cx="910" cy="100" r="180" fill="#28e5da" opacity=".08"/>
    <circle cx="120" cy="680" r="220" fill="#6b5cff" opacity=".09"/>
    <rect x="24" y="24" width="1052" height="732" rx="28" fill="none" stroke="#1f5a5c" stroke-width="2"/>
    <text x="70" y="85" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#7affeF" letter-spacing="6">KAELHAX</text>
    <text x="70" y="130" font-family="Arial, sans-serif" font-size="46" font-weight="800" fill="#ffffff">NEXORIUM</text>
    <text x="70" y="165" font-family="Arial, sans-serif" font-size="15" fill="#8ba9aa" letter-spacing="4">PAYMENT RECEIPT // VERIFIED</text>
    <rect x="70" y="195" width="960" height="3" rx="2" fill="url(#line)" filter="url(#glow)"/>
    <text x="70" y="250" font-family="Arial, sans-serif" font-size="15" fill="#688687">ORDER</text>
    <text x="70" y="282" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#ffffff">${escapeXml(order.id)}</text>
    <text x="650" y="250" font-family="Arial, sans-serif" font-size="15" fill="#688687">ACCOUNT</text>
    <text x="650" y="282" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#ffffff">${escapeXml(order.usernameMasked || order.userEmail || 'CUSTOMER')}</text>
    <text x="70" y="345" font-family="Arial, sans-serif" font-size="15" fill="#688687">PRODUCT</text>
    <text x="70" y="382" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#7affeF">${escapeXml(order.productName)}</text>
    <text x="70" y="430" font-family="Arial, sans-serif" font-size="15" fill="#688687">DURATION</text>
    <text x="70" y="464" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(order.duration || 'N/A')}</text>
    <text x="370" y="430" font-family="Arial, sans-serif" font-size="15" fill="#688687">AMOUNT PAID</text>
    <text x="370" y="464" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(order.amount || '—')}</text>
    <text x="680" y="430" font-family="Arial, sans-serif" font-size="15" fill="#688687">PAYMENT</text>
    <text x="680" y="464" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">GCASH / QRPH</text>
    <rect x="70" y="510" width="960" height="95" rx="20" fill="#0a181a" stroke="#204e50"/>
    <text x="95" y="548" font-family="Arial, sans-serif" font-size="14" fill="#688687">REFERENCE</text>
    <text x="95" y="582" font-family="Arial, sans-serif" font-size="21" font-weight="700" fill="#ffffff">${escapeXml(order.paymentReference || '—')}</text>
    <text x="650" y="548" font-family="Arial, sans-serif" font-size="14" fill="#688687">STATUS</text>
    <text x="650" y="582" font-family="Arial, sans-serif" font-size="21" font-weight="700" fill="#7affeF">VERIFIED ✓</text>
    <text x="70" y="675" font-family="Arial, sans-serif" font-size="13" fill="#607d7e">${escapeXml(date)} • Support: @kael210bot</text>
    <text x="1030" y="675" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#607d7e">NEXORIUM SYSTEM</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
