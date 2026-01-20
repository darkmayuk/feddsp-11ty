// .netlify/functions/lemon-webhook.js
import crypto from 'node:crypto';
import { getStore, connectLambda } from '@netlify/blobs';

// ==============================
// CONFIG: map LS product IDs -> your internal product_ids
// (keys must be strings)
const PRODUCT_MAP = {
  // Lemon Squeezy numeric product_id -> your internal product code
  // Keep old/demo ids here if you still need them as fallback.
  '738772': 'fedDSP-PHAT'
};

const ML_GROUPS = {
  customers_soft_optin: '176785955520251725',
  newsletter_full: '176786902392767543',

  cat_effects: '177124360852603976',
  cat_amps: '177124366747699123',
  cat_samples: '177124373232092415',
  cat_irs: '177125712410445457',

  prod_phaturator: '176785785000822298',
};

const ML_HERO_PRODUCTS = {
  'fedDSP-PHAT': 'prod_phaturator',
  // only for big products, not samples + IRs
};

// Map internal product codes -> category group key
// (Fill this out as you add products)
const ML_PRODUCT_CATEGORY = {
  'fedDSP-PHAT': 'cat_effects',
  // examples for later:
  // 'fedDSP-AMP1': 'cat_amps',
  // 'fedDSP-SAMP1': 'cat_samples',
  // 'fedDSP-IR1': 'cat_irs',
};

// ==============================
// MailerLite (soft opt-in on purchase) - best effort
// Env var required:
// - MAILERLITE_API_TOKEN
// ==============================
const MAILERLITE_API_BASE = 'https://connect.mailerlite.com/api';

function dateOnlyUTCFromAny(input) {
  const d = input ? new Date(input) : new Date();
  const iso = d.toISOString(); // UTC
  return iso.slice(0, 10); // YYYY-MM-DD
}

function mailerliteGroupsForProduct(mappedProductId) {
  const out = [];

  // Always add soft opt-in group on purchase
  if (ML_GROUPS.customers_soft_optin) out.push(ML_GROUPS.customers_soft_optin);

  // Category group (optional but recommended)
  const catKey = ML_PRODUCT_CATEGORY[mappedProductId];
  if (catKey && ML_GROUPS[catKey]) out.push(ML_GROUPS[catKey]);

  // Hero product group (only if configured)
  const heroKey = ML_HERO_PRODUCTS[mappedProductId];
  if (heroKey && ML_GROUPS[heroKey]) out.push(ML_GROUPS[heroKey]);

  return out.filter(Boolean);
}

async function mailerliteUpsertSubscriberBestEffort({ email, name, groupIds, fields }) {
  const token = process.env.MAILERLITE_API_TOKEN;
  if (!token) {
    console.log('MailerLite: MAILERLITE_API_TOKEN not set; skipping ML sync');
    return;
  }

  if (!email) return;

  const body = {
    email: String(email),
    fields: {
      name: String(name || ''),
      ...fields,
    },
    groups: Array.isArray(groupIds) ? groupIds.filter(Boolean) : [],
  };

  try {
    const resp = await fetch(`${MAILERLITE_API_BASE}/subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.log('MailerLite upsert failed (continuing):', resp.status, t);
      return;
    }

    console.log('MailerLite sync ok for', email);
  } catch (err) {
    console.log('MailerLite sync error (continuing):', err?.message || err);
  }
}

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

// Read JSON from a Blobs store key (Netlify Blobs doesn't expose getJSON in all runtimes)
async function storeGetJSON(store, key) {
  const v = await store.get(key);
  if (v == null) return null;
  const s = typeof v === 'string' ? v : Buffer.from(v).toString('utf8');
  return JSON.parse(s);
}

// Fold long lines to 64 ch
function fold64(str) {
  return str.replace(/(.{64})/g, '$1\n');
}

// ISO UTC without milliseconds
function isoNoMsUTC(d = new Date()) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Canonical stringify: stable key ordering (recursive), compact (no whitespace)
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

// Ed25519 sign with PEM in env
function signEnvelopeEd25519(envelopeJson, privateKeyPem) {
  const sig = crypto.sign(null, Buffer.from(envelopeJson, 'utf8'), privateKeyPem);
  return base64UrlEncode(sig);
}

// ==============================
// Handler

export const handler = async (event) => {
  try {
    // Needed for Blobs local-ish mode (safe in production too)
    connectLambda(event);

    // Secrets
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET; // keep your current env name
    if (!secret) {
      console.error('Missing LEMONSQUEEZY_WEBHOOK_SECRET');
      return { statusCode: 500, body: 'Server misconfigured' };
    }

    const rawBody = event.body || '';

    // --- Lemon Squeezy signature verification (hardened + diagnostics) ---
    // NOTE: You can remove the "LS sig diag" log after you're confident.

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
    const digestHex = crypto.createHmac('sha256', secret).update(rawBodyBytes).digest('hex');

    // Non-sensitive diagnostics
    console.log('LS sig diag:', {
      isBase64Encoded: !!event.isBase64Encoded,
      headerPrefix: signatureHeader.slice(0, 12),
      headerLen: signatureHeader.length,
      tokenLen: token.length,
      bodyLen: rawBodyBytes.length,
      digestPrefix: digestHex.slice(0, 12),
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

    const eventName = payload?.meta?.event_name || event.headers?.['x-event-name'] || 'unknown';
    console.log('Lemon Squeezy webhook received:', eventName);

    const data = payload?.data || {};
    const attributes = data?.attributes || {};
    const firstOrderItem = attributes.first_order_item || {};
    const orderId = data.id || 'unknown-order-id';

    // ==============================
    // Part C: append-only webhook event log (best-effort)
    // ==============================
    let refundEventKey = null;
    try {
      const eventStore = getStore(EVENT_STORE_NAME);
      const receivedAt = isoNoMsUTC();
      const orderIdForEvent = String(orderId || 'unknown');

      const eventKey = `${receivedAt}:${eventName}:${orderIdForEvent}`;
      refundEventKey = eventKey;

      await eventStore.setJSON(eventKey, {
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

        const existing = await storeGetJSON(store, blobKey).catch(() => null);
        if (!existing) {
          console.log('Refund received but no license blob found for key:', blobKey);
          return { statusCode: 200, body: 'OK (refund: nothing to revoke)' };
        }

        existing.schema_version = existing.schema_version || 2;
        existing.status = 'refunded';
        existing.revoked_at = isoNoMsUTC();
        existing.refund_event_key = refundEventKey;

        // If we cannot persist the revoke, return 500 so LS retries
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

    // Resolve product to your internal id:
    // Prefer LS custom_data.product_code, fall back to PRODUCT_MAP.
    const lsProductId = String(firstOrderItem.product_id || '');
    const custom = payload?.meta?.custom_data || {};
    const productCode = typeof custom.product_code === 'string' ? custom.product_code.trim() : '';
    const mappedProductId = productCode || PRODUCT_MAP[lsProductId] || null;

    if (!userEmail) {
      console.error('Missing user_email in order payload, cannot issue license');
      return { statusCode: 200, body: 'OK (no email, no license issued)' };
    }

    if (!mappedProductId) {
      console.error(
        'No product mapping for LS product_id:',
        lsProductId,
        '— set checkout[custom][product_code] or fill PRODUCT_MAP'
      );
      return { statusCode: 200, body: 'OK (unmapped product, no license issued)' };
    }

    const identifier = attributes.identifier || data.id || 'unknown';
    const licenseId = `LS-${identifier}`;

    // 4) Build the payload EXACTLY as plugins expect
    const licensePayload = {
      license_to: userName,
      email: String(userEmail),
      product_id: mappedProductId,
      license_id: licenseId,
      issued_at: isoNoMsUTC(), // no fractional seconds
      version: '1',
    };

    // Canonicalize for signing (sorted keys, compact)
    const payloadJsonCanon = canonicalStringify(licensePayload);

    // 5) Sign Ed25519 with k1 (from env)
    // Use base64-encoded PEM stored in Netlify as LIC_ED25519_PRIVATE_KEY_B64
    const keyB64 = process.env.LIC_ED25519_PRIVATE_KEY_B64;
    if (!keyB64) {
      console.error('Missing LIC_ED25519_PRIVATE_KEY_B64');
      return { statusCode: 500, body: 'Server misconfigured (missing license signing key)' };
    }

    let privateKeyPem;
    try {
      privateKeyPem = Buffer.from(keyB64, 'base64').toString('utf8');
    } catch (e) {
      console.error('Failed to base64-decode LIC_ED25519_PRIVATE_KEY_B64');
      return { statusCode: 500, body: 'Server misconfigured (invalid signing key encoding)' };
    }

    if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
      console.error('Decoded signing key is not valid PEM');
      return { statusCode: 500, body: 'Server misconfigured (invalid signing key format)' };
    }

    const envelope = {
      version: '1',
      algorithm: 'Ed25519',
      payload: licensePayload,
      signature: '', // fill next
    };

    const envelopeJson = canonicalStringify({
      version: envelope.version,
      algorithm: envelope.algorithm,
      payload: envelope.payload,
    });

    const signatureB64Url = signEnvelopeEd25519(envelopeJson, privateKeyPem);
    envelope.signature = signatureB64Url;

    // Render license_string
    const envelopeFullJson = canonicalStringify(envelope);
    const envelopeB64 = base64UrlEncode(Buffer.from(envelopeFullJson, 'utf8'));

    const licenseString =
      '-----BEGIN fedDSP LICENSE-----\n' +
      `Product: ${mappedProductId}\n` +
      `Licensee: ${userName}\n\n` +
      fold64(envelopeB64) +
      '\n\n-----END fedDSP LICENSE-----';

    // Diagnostics (safe; no secret)
    console.log('License payload (canonical):', payloadJsonCanon);
    console.log('Envelope preview (first 120 chars):', envelopeFullJson.slice(0, 120) + '...');
    console.log('Signature (b64url, first 24):', signatureB64Url.slice(0, 24) + '...');
    console.log('Generated license for', userEmail, 'license_id', licenseId);

    // 6) Persist license and related info to Netlify Blobs
    const store = getStore(LICENSE_STORE_NAME);

    const lsOrderId = String(data.id || '');
    const lsOrderIdentifier = String(attributes.identifier || '');
    const lsOrderNumber = attributes.order_number ?? null;
    const orderReceiptUrl = attributes?.urls?.receipt || null;
    const lsProductIdStr = String(firstOrderItem.product_id || '');
    const productVersion = firstOrderItem.variant_name || 'Default';

    const lsCustomerId = attributes.customer_id ?? null;

    const blobKey = `${lsOrderId}:${lsProductIdStr}`;

    const blobObj = {
      schema_version: 2,
      status: 'active',
      revoked_at: null,
      refund_event_key: null,

      license_id: licenseId,
      license_string: licenseString,
      envelope,

      ls_order_id: lsOrderId,
      ls_order_identifier: lsOrderIdentifier,
      ls_order_number: lsOrderNumber,

      ls_customer_id: lsCustomerId,

      ls_product_id: lsProductIdStr,
      product_id: mappedProductId,
      product_version: productVersion,

      user_email: String(userEmail),
      user_name: String(userName),

      order_receipt_url: orderReceiptUrl,

      issued_at: licensePayload.issued_at,
      created_at: isoNoMsUTC(),
      event_name: eventName,
    };

    await store.setJSON(blobKey, blobObj);
    console.log('Saved license to Netlify Blobs with key:', blobKey);

    // ==============================
    // NEW: MailerLite soft opt-in sync on purchase (best-effort)
    // ==============================
    {
      const mlGroupIds = mailerliteGroupsForProduct(mappedProductId);

      // Use LS created_at if present; otherwise fall back to issued_at we generated
      const purchaseDate = dateOnlyUTCFromAny(attributes.created_at || licensePayload.issued_at);

      await mailerliteUpsertSubscriberBestEffort({
        email: String(userEmail),
        name: String(userName),
        groupIds: mlGroupIds,
        fields: {
          ls_customer_id: lsCustomerId != null ? String(lsCustomerId) : null,
          first_purchase_at: purchaseDate,
          last_purchase_at: purchaseDate,
          // clerk_user_id isn't available here; leave unset.
        },
      });
    }

    // 7) Send license email via Postmark (if configured)
    // (This keeps your existing behaviour; if you have POSTMARK_* env vars this will work.)
    const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
    const postmarkFrom = process.env.POSTMARK_FROM;
    if (postmarkToken && postmarkFrom) {
      const subject = `Your ${mappedProductId} license`;
      const textBody =
        `Thanks for your purchase.\n\n` +
        `Receipt: ${orderReceiptUrl || '(see your account page)'}\n\n` +
        `Your license:\n\n${licenseString}\n`;

      const resp = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkToken,
        },
        body: JSON.stringify({
          From: postmarkFrom,
          To: String(userEmail),
          Subject: subject,
          TextBody: textBody,
          MessageStream: 'outbound',
        }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        console.error('Postmark error:', resp.status, t);
        return { statusCode: 502, body: 'Failed to send license email' };
      }
    }

    // 8) Done
    return { statusCode: 200, body: 'OK (license generated and emailed)' };
  } catch (err) {
    console.error('Unhandled error in lemon-webhook:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
