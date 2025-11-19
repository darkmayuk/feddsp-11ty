// netlify/functions/lemon-webhook.js
import crypto from 'node:crypto';

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

  // 2. Verify Lemon Squeezy webhook signature (HMAC-SHA256 of raw body):contentReference[oaicite:3]{index=3}
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(rawBody).digest('hex');

    const expected = Buffer.from(digest, 'utf8');
    const actual = Buffer.from(signatureHeader, 'utf8');

    if (expected.length !== actual.length ||
        !crypto.timingSafeEqual(expected, actual)) {
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
  console.log(JSON.stringify(payload, null, 2));

  // ---- STAGE 1: just get JSON into your system ----
  //
  // Here you can:
  // - Store payload in a DB (Supabase/Turso/etc.)
  // - Or push a reduced record into your future "licenses" table
  //
  // For now, you can leave this as logging-only while you confirm it works.

  // Important: always respond quickly with 200 if processing is OK,
  // otherwise LS will retry up to 4 times.:contentReference[oaicite:4]{index=4}
  return {
    statusCode: 200,
    body: 'OK',
  };
};
