// .netlify/functions/lemon-webhook.js
import crypto from 'node:crypto';
import { getStore, connectLambda } from '@netlify/blobs';

// ==============================
// CONFIG: map LS product IDs -> your internal product_ids
// (keys must be strings)
const PRODUCT_MAP = {
  '738772': 'fedDSP-PHAT'
};

// Name of the Netlify Blobs store we'll use
const LICENSE_STORE_NAME = 'licenses';

// Part C: append-only raw webhook event log store
const EVENT_STORE_NAME = 'ls_events';

// ==============================
// Helpers

// Base64URL (no padding)
function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Fold long lines to 64 chars (cosmetic, matches your local tool output)
const fold64 = (s) => s.replace(/(.{64})/g, '$1\n');

// Canonical JSON: sorted keys, compact separators (matches your local signer)
function canonicalStringify(obj) {
  const ordered = {};
  Object.keys(obj).sort().forEach((k) => {
    ordered[k] = obj[k];
  });
  return JSON.stringify(ordered);
}

// Force ISO-8601 without milliseconds, e.g. 2025-11-23T14:18:29Z
function isoNoMsUTC(date = new Date()) {
  return new Date(Math.floor(date.getTime() / 1000) * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
}

// Load Ed25519 private key from env; supports:
//  - PEM with real newlines
//  - single-line PEM with BEGIN/END and no newlines
//  - base64-encoded DER (PKCS#8)
function loadPrivateKeyFromEnv(envValRaw) {
  if (!envValRaw) throw new Error('LIC_ED25519_PRIVATE_KEY is empty');

  let raw = envValRaw.trim();

  // If someone pasted PEM with escaped "\n", restore real newlines
  if (raw.includes('\\n') && !raw.includes('\n')) {
    raw = raw.replace(/\\n/g, '\n');
  }

  // Case 1: full PEM with BEGIN/END and actual newlines
  if (raw.includes('-----BEGIN PRIVATE KEY-----') && raw.includes('\n')) {
    return crypto.createPrivateKey(raw);
  }

  // Case 2: single-line PEM with BEGIN/END (no newlines)
  if (raw.startsWith('-----BEGIN PRIVATE KEY-----') && raw.endsWith('-----END PRIVATE KEY-----')) {
    const match = raw.match(/-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=]+)\s*-----END PRIVATE KEY-----/);
    if (!match) throw new Error('Single-line PEM format not recognized');
    const b64 = match[1];
    const pemFixed = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
    return crypto.createPrivateKey(pemFixed);
  }

  // Case 3: assume base64 DER (PKCS#8)
  try {
    const der = Buffer.from(raw, 'base64');
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch (e) {
    throw new Error('Private key is not PEM or base64 DER');
  }
}

// ==============================
// Main handler

export const handler = async (event) => {
  try {
    connectLambda(event);

    // 1) Only accept POST
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Secrets
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET; // keep your current env name
    if (!secret) {
      console.error('Missing LEMONSQUEEZY_WEBHOOK_SECRET');
      return { statusCode: 500, body: 'Server misconfigured' };
    }

    const rawBody = event.body || '';

    // --- Lemon Squeezy signature verification (hardened + diagnostics) ---

    const signatureHeaderRaw =
      event.headers?.['x-signature'] ||
      event.headers?.['X-Signature'] ||
      event.headers?.['x-lemon-signature'] ||
      '';

    const signatureHeader = String(signatureHeaderRaw || '').trim();
    const token = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length).trim()
      : signatureHeader;

    // Raw body bytes (important: handle base64)
    const rawBodyBytes = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    // Compute HMAC-SHA256 hex digest
    const digestHex = crypto
      .createHmac('sha256', secret)
      .update(rawBodyBytes)
      .digest('hex');

    // Non-sensitive diagnostics
    console.log('LS sig diag:', {
      isBase64Encoded: !!event.isBase64Encoded,
      headerPrefix: signatureHeader.slice(0, 12),          // e.g. "sha256=abcd"
      headerLen: signatureHeader.length,
      tokenLen: token.length,
      bodyLen: rawBodyBytes.length,
      digestPrefix: digestHex.slice(0, 12),                // first 12 hex chars only
    });

    // Compare (case-insensitive)
    const expected = Buffer.from(digestHex.toLowerCase(), 'utf8');
    const actual = Buffer.from(token.toLowerCase(), 'utf8');

    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      console.warn('Invalid Lemon Squeezy signature');
      return { statusCode: 400, body: 'Invalid signature' };
    }

    // 3) Parse payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      console.error('Invalid JSON from Lemon Squeezy', err);
      return { statusCode: 400, body: 'Invalid JSON' };
    }

    const eventName = payload?.meta?.event_name || event.headers['x-event-name'] || 'unknown';
    console.log('Lemon Squeezy webhook received:', eventName);

    const data = payload?.data || {};
    const attributes = data?.attributes || {};
    const firstOrderItem = attributes.first_order_item || {};

    const orderId = data.id || 'unknown-order-id';

    // ==============================
    // Part C: Append-only raw webhook event log (best-effort; never break sales)
    // ==============================
    let refundEventKey = null;
    try {
      const eventStore = getStore(EVENT_STORE_NAME);
      const receivedAt = isoNoMsUTC();
      const orderIdForEvent = String(orderId || 'unknown-order-id');
      const rand = crypto.randomBytes(6).toString('hex');
      refundEventKey = `evt_${receivedAt}_${eventName}_${orderIdForEvent}_${rand}`;

      // Store raw payload; this is your replay/audit source.
      await eventStore.setJSON(refundEventKey, {
        received_at: receivedAt,
        event_name: eventName,
        ls_order_id: orderIdForEvent,
        payload,
      });
    } catch (err) {
      console.log('Event log write failed (continuing):', err?.message || err);
      refundEventKey = null;
    }

    // ==============================
    // Part D: Refund handling (revoke, don’t delete)
    // ==============================
    if (eventName === 'order_refunded') {
      try {
        const store = getStore(LICENSE_STORE_NAME);
        const orderIdStr = String(orderId);
        const lsProductId = String(firstOrderItem.product_id || '');
        const blobKey = `${orderIdStr}:${lsProductId}`;

        // If we can’t compute the same key, we can’t revoke.
        if (!lsProductId) {
          console.log('Refund event missing product_id; cannot compute blob key');
          return { statusCode: 200, body: 'OK (refund: missing product_id)' };
        }

        const existing = await store.getJSON(blobKey).catch(() => null);
        if (!existing) {
          console.log('Refund received but no license blob found for key:', blobKey);
          return { statusCode: 200, body: 'OK (refund: nothing to revoke)' };
        }

        existing.schema_version = existing.schema_version || 2;
        existing.status = 'refunded';
        existing.revoked_at = isoNoMsUTC();
        existing.refund_event_key = refundEventKey;

        // Part 7: if we cannot persist the revoke, return 500 so LS retries
        await store.setJSON(blobKey, existing);

        console.log('Marked license as refunded for key:', blobKey);
        return { statusCode: 200, body: 'OK (refund processed)' };
      } catch (err) {
        console.error('Failed to persist refund revoke; forcing retry:', err);
        return { statusCode: 500, body: 'Failed to persist refund revoke' };
      }
    }

    // Only issue license on order_created (adjust if you prefer order_paid)
    if (eventName !== 'order_created') {
      console.log('Ignoring event (no license generation needed):', eventName);
      return { statusCode: 200, body: 'OK (no-op for this event)' };
    }

    const userEmail = attributes.user_email;
    const userName = attributes.user_name || attributes.customer_name || attributes.user_email || 'Customer';

    // Resolve product to your internal id
    const lsProductId = String(firstOrderItem.product_id || '');
    const mappedProductId = PRODUCT_MAP[lsProductId] || null;

    if (!userEmail) {
      console.error('Missing user_email in order payload, cannot issue license');
      return { statusCode: 200, body: 'OK (no email, no license issued)' };
    }

    if (!mappedProductId) {
      console.error('No product mapping for LS product_id:', lsProductId, '— fill PRODUCT_MAP');
      return { statusCode: 200, body: 'OK (unmapped product, no license issued)' };
    }

    const identifier = attributes.identifier || data.id || 'unknown';
    const licenseId = `LS-${identifier}`; // FIXED: proper template string

    // 4) Build the payload EXACTLY as plugins expect
    const licensePayload = {
      license_to: userName,
      email: String(userEmail),
      product_id: mappedProductId,
      license_id: licenseId,
      issued_at: isoNoMsUTC(), // FIXED: no fractional seconds
      version: '1',
    };

    // Canonicalize for signing (sorted keys, compact)
    const payloadJsonCanon = canonicalStringify(licensePayload);
    const payloadBytes = Buffer.from(payloadJsonCanon, 'utf8');

    // 5) Sign Ed25519 with k1 (from env) — unchanged
    const privateKeyEnv = process.env.LIC_ED25519_PRIVATE_KEY;
    if (!privateKeyEnv) {
      console.error('Missing LIC_ED25519_PRIVATE_KEY env var');
      return { statusCode: 500, body: 'Server misconfigured (no license key)' };
    }

    let signature;
    try {
      const privateKey = loadPrivateKeyFromEnv(privateKeyEnv);
      signature = crypto.sign(null, payloadBytes, privateKey); // plain Ed25519 (no prehash)
    } catch (err) {
      console.error('Error signing license payload with Ed25519', err);
      return { statusCode: 500, body: 'License signing failed' };
    }

    const signatureB64Url = base64UrlEncode(signature); // no padding

    // Build the wrapper (envelope) JSON exactly like your local tool
    const envelope = {
      version: '1',
      algorithm: 'Ed25519',
      payload: licensePayload,           // object, not canonical string
      signature: signatureB64Url,        // base64url, no '='
    };

    const envelopeJson = JSON.stringify(envelope);     // compact
    const envelopeBytes = Buffer.from(envelopeJson, 'utf8');

    // FIXED: wrapper blob must be Base64URL (no padding), not standard base64
    const coreLicenseKey = base64UrlEncode(envelopeBytes);

    // Optional: fold to 64-char lines to match your "RIGHT" license visuals
    const foldedBody = fold64(coreLicenseKey) + '\n';

    // Final wrapped license block (human headers are cosmetic)
    const licenseString = [
      '-----BEGIN fedDSP LICENSE-----',
      `Product: ${mappedProductId}`,
      `Licensee: ${userName}`,
      '',
      foldedBody,
      '-----END fedDSP LICENSE-----',
    ].join('\n');

    // --- Diagnostics (safe; no PII beyond product/id) ---
    console.log('License payload (canonical):', payloadJsonCanon);
    console.log('Envelope preview (first 120 chars):', envelopeJson.slice(0, 120) + '...');
    console.log('Signature (b64url, first 24):', signatureB64Url.slice(0, 24) + '...');
    console.log('Generated license for', userEmail, 'license_id', licenseId);

    // 6) Persist license and related info to Netlify Blobs
    try {
      const store = getStore(LICENSE_STORE_NAME);

      const orderIdStr = String(orderId);
      const blobKey = `${orderIdStr}:${lsProductId}`;

      // Extra useful LS metadata
      const urls = attributes.urls || {};
      const receiptUrl = urls.receipt || urls.invoice_url || null;

      // Add product version if LS exposes it (placeholder for now)
      const productVersion =
        firstOrderItem?.variant_name ||
        firstOrderItem?.variant_id ||
        null;

      const licenseRecord = {
        // ==============================
        // Part B: version + status fields (stateful record)
        // ==============================
        schema_version: 2,
        status: 'active',        // active | refunded | revoked
        revoked_at: null,
        refund_event_key: null,

        // core license info
        license_id: licenseId,
        license_string: licenseString,
        envelope, // payload + signature

        // LS linkage
        ls_order_id: orderIdStr,
        ls_order_identifier: identifier,
        ls_order_number: attributes.order_number || null,
        ls_product_id: lsProductId,
        product_id: mappedProductId,
        product_version: productVersion,

        // customer details
        user_email: userEmail,
        user_name: userName,

        // useful UI fields
        order_receipt_url: receiptUrl,

        // meta timestamps
        issued_at: licensePayload.issued_at,
        created_at: isoNoMsUTC(),
        event_name: eventName
      };

      // Part 7: if we can’t persist, return 500 so LS retries
      await store.setJSON(blobKey, licenseRecord);

      console.log("Saved license to Netlify Blobs with key:", blobKey);
    } catch (err) {
      console.error("Failed to persist license to Netlify Blobs", err);
      return { statusCode: 500, body: 'Failed to persist license record' };
    }

    // 7) Email via Postmark
    const postmarkApiKey = process.env.POSTMARK_API_KEY; // keep your current env name
    const mailFrom = process.env.MAIL_FROM;
    const supportEmail = process.env.SUPPORT_EMAIL || mailFrom;

    if (!postmarkApiKey || !mailFrom) {
      console.error('Missing POSTMARK_API_KEY or MAIL_FROM env vars, cannot send email');
      // Return 500 so LS retries (don’t silently drop)
      return { statusCode: 500, body: 'Server misconfigured (mail)' };
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
      '2) Press the I button on the menu bar: this opens the Information panel',
      '3) Press the license button and paste your license code, including the lines "-----BEGIN fedDSP LICENSE-----" and "-----END fedDSP LICENSE-----"',
      '',
      `Order: ${licenseId}`,
      `Issued to: ${userEmail}`,
      `Issued at: ${licensePayload.issued_at} UTC`,
      '',
      `Need help? Contact ${supportEmail}.`,
      '',
      'Thanks, fedDSP',
    ].join('\n');

    // Use global fetch (Node 18+ / Netlify)
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
      const text = await resp.text().catch(() => '');
      console.error('Postmark error:', resp.status, text);
      return { statusCode: 502, body: 'Failed to send license email' };
    }

    // 8) Done
    return { statusCode: 200, body: 'OK (license generated and emailed)' };
  } catch (err) {
    console.error('Unhandled error in lemon-webhook:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
