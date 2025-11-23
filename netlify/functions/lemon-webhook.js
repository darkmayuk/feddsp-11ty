// netlify/functions/lemon-webhook.js
import crypto from 'node:crypto';

// Map LS product IDs -> your internal product_ids used in the license payload
// FILL THIS IN with your real mappings (keys must be strings)
const PRODUCT_MAP = {
  '691169': 'fedDSP-FIERY',
  '636851': 'fedDSP-PHAT',
  '691171': 'fedDSP-leONE',
  '702853': 'fedDSP-OPTO',
  '702855': 'fedDSP-VCA'
};

// Helpers
function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function canonicalJson(obj) {
  const ordered = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      ordered[key] = obj[key];
    });
  // Compact JSON, no spaces
  return JSON.stringify(ordered);
}

export const handler = async (event, context) => {
  // 1. Only accept POST from Lemon Squeezy
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Missing LEMONSQUEEZY_WEBHOOK_SECRET');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const rawBody = event.body || '';
  const signatureHeader =
    event.headers['x-signature'] || event.headers['X-Signature'] || '';

  // 2. Verify Lemon Squeezy webhook signature (HMAC-SHA256 of raw body)
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(rawBody).digest('hex');

    const expected = Buffer.from(digest, 'utf8');
    const actual = Buffer.from(signatureHeader, 'utf8');

    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      console.warn('Invalid Lemon Squeezy signature');
      return { statusCode: 400, body: 'Invalid signature' };
    }
  } catch (err) {
    console.error('Error verifying signature', err);
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  // 3. At this point, we trust the payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Invalid JSON from Lemon Squeezy', err);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventName =
    payload?.meta?.event_name || event.headers['x-event-name'] || 'unknown';

  console.log('Lemon Squeezy webhook received:', eventName);

  // Only generate licenses for order_created (initial purchase)
  if (eventName !== 'order_created') {
    console.log('Ignoring event (no license generation needed):', eventName);
    return {
      statusCode: 200,
      body: 'OK (no-op for this event)',
    };
  }

  const data = payload?.data || {};
  const attributes = data?.attributes || {};
  const firstOrderItem = attributes.first_order_item || {};

  const userEmail = attributes.user_email;
  const userName = attributes.user_name || attributes.user_email || 'Customer';

  const lsProductId = firstOrderItem.product_id;
  const mappedProductId = PRODUCT_MAP[String(lsProductId)] || null;

  if (!userEmail) {
    console.error('Missing user_email in order payload, cannot issue license');
    return { statusCode: 200, body: 'OK (no email, no license issued)' };
  }

  if (!mappedProductId) {
    console.error(
      'No product mapping for LS product_id:',
      lsProductId,
      '— fill PRODUCT_MAP in lemon-webhook.js'
    );
    return { statusCode: 200, body: 'OK (unmapped product, no license issued)' };
  }

  const issuedAt = attributes.created_at || new Date().toISOString();
  const identifier = attributes.identifier || data.id || 'unknown';
  const licenseId = `LS-${identifier}`;

  // 4. Build your license payload (canonical, sorted keys)
  const licensePayload = {
    email: userEmail,
    issued_at: issuedAt,
    license_id: licenseId,
    license_to: userName,
    product_id: mappedProductId,
    version: '1',
  };

  const canonicalPayloadJson = canonicalJson(licensePayload);
  const payloadBytes = Buffer.from(canonicalPayloadJson, 'utf8');

  // 5. Sign with Ed25519 (k1) using private key from env
  const privateKeyEnv = process.env.LIC_ED25519_PRIVATE_KEY;
  if (!privateKeyEnv) {
    console.error('Missing LIC_ED25519_PRIVATE_KEY env var');
    return { statusCode: 500, body: 'Server misconfigured (no license key)' };
  }

  // Normalise: if it’s all on one line with spaces, rebuild proper PEM with newlines
  let privateKeyPem = privateKeyEnv.trim();
  if (!privateKeyPem.includes('\n')) {
    const match = privateKeyPem.match(
      /-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=]+)\s*-----END PRIVATE KEY-----/
    );
    if (!match) {
      console.error('LIC_ED25519_PRIVATE_KEY is not in a recognised one-line PEM format');
      return { statusCode: 500, body: 'Invalid license key format' };
    }
    const b64 = match[1];
    privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
  }

  let signature;
  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    // Ed25519: pass null algorithm, sign raw bytes (no prehash)
    signature = crypto.sign(null, payloadBytes, privateKey);
  } catch (err) {
    console.error('Error signing license payload with Ed25519', err);
    return { statusCode: 500, body: 'License signing failed' };
  }

  const payloadB64Url = base64UrlEncode(payloadBytes);
  const signatureB64Url = base64UrlEncode(signature);

  // Core machine-readable key (no FED1k1 prefix)
  const coreLicenseKey = `${payloadB64Url}.${signatureB64Url}`;

  // Human-readable wrapper fedDSP wants
  const licenseString = [
    '-----BEGIN fedDSP LICENSE-----',
    `Product: ${mappedProductId}`,
    `Licensee: ${userName}`,
    '',
    coreLicenseKey,
    '-----END fedDSP LICENSE-----',
  ].join('\n');

  console.log('Generated license for', userEmail, 'license_id', licenseId);

  // 6. Email the license via Postmark
  const postmarkApiKey = process.env.POSTMARK_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  const supportEmail = process.env.SUPPORT_EMAIL || mailFrom;

  if (!postmarkApiKey || !mailFrom) {
    console.error(
      'Missing POSTMARK_API_KEY or MAIL_FROM env vars, cannot send email'
    );
    // Treat as a failure so LS retries and you can fix the config.
    return {
      statusCode: 500,
      body: 'Server misconfigured (mail)',
    };
  }

  const subject = `Your fedDSP license for ${mappedProductId}`;
  const textBody = [
    `Hi ${userName},`,
    '',
    `Thanks for your purchase! Here's your license for ${mappedProductId}:`,
    '',
    licenseString,
    '',
    'How to activate:',
    `1) Open the ${mappedProductId} plugin.`,
    '2) Click “Activate” or “Enter License”.',
    '3) Paste the license above and press Confirm.',
    '',
    `Order: ${licenseId}`,
    `Issued to: ${userEmail}`,
    `Issued at: ${issuedAt} UTC`,
    `Version: 1`,
    '',
    `Need help? Just reply to this email or contact ${supportEmail}.`,
    '',
    '— fedDSP',
  ].join('\n');

  try {
    const resp = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': postmarkApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: mailFrom,
        To: userEmail,
        Subject: subject,
        TextBody: textBody,
        ReplyTo: supportEmail,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Postmark error:', resp.status, text);
      // Non-200 so LS retries; avoids silently dropping licenses
      return {
        statusCode: 502,
        body: 'Failed to send license email',
      };
    }
  } catch (err) {
    console.error('Error calling Postmark API', err);
    return {
      statusCode: 502,
      body: 'Error sending license email',
    };
  }

  // 7. All good
  return {
    statusCode: 200,
    body: 'OK (license generated and emailed)',
  };
};
