import { verifyToken } from "@clerk/backend";

const API_BASE = "https://api.lemonsqueezy.com/v1";

export const handler = async (event) => {
  try {
    // We always need the LS API key
    requireEnv("LEMONSQUEEZY_API_KEY");

    // 1) Try to get email from Clerk JWT
    const emailFromClerk = await getEmailFromClerk(event);

    // 2) Fallbacks (query param, then env override) while we’re testing
    const email =
      emailFromClerk ||
      getFallbackEmail(event) ||
      null;

    if (!email) {
      return json(401, { error: "Not authenticated (no email)" });
    }

    const storeId = process.env.LEMONSQUEEZY_STORE_ID?.trim() || null;

    const orders = await fetchAll(`/orders`, {
      "filter[user_email]": email,
      ...(storeId ? { "filter[store_id]": storeId } : {})
    });

    const purchases = [];
    for (const order of orders) {
      const o = order.attributes || {};
      const orderId = order.id;

      const orderItems = await fetchAll(`/order-items`, {
        "filter[order_id]": orderId
      });

      const licenseKeys = await fetchAll(`/license-keys`, {
        "filter[order_id]": orderId
      });

      const keysByOrderItem = new Map();
      const allKeysForOrder = [];

      for (const lk of licenseKeys) {
        const a = lk.attributes || {};
        const key = a.key;
        if (!key) continue;

        allKeysForOrder.push(key);

        // Coerce to string so "6416131" and 6416131 don't mismatch
        const relOrderItemId =
          lk.relationships?.["order-item"]?.data?.id ??
          a.order_item_id ??
          null;

        const orderItemId = relOrderItemId != null ? String(relOrderItemId) : null;

        const arr = keysByOrderItem.get(orderItemId) || [];
        arr.push(key);
        keysByOrderItem.set(orderItemId, arr);
      }

      for (const item of orderItems) {
        const ia = item.attributes || {};
        const productName = ia.product_name || "Product";

        const keysForItem =
          keysByOrderItem.get(String(item.id)) ||
          keysByOrderItem.get(null) ||
          allKeysForOrder;

        const firstKey = Array.isArray(keysForItem) ? keysForItem[0] : null;

        purchases.push({
          id: `${orderId}:${item.id}`,
          orderNumber: o.order_number || "",
          purchasedAt: o.created_at || null,
          productId: ia.product_id || null,
          productName,
          licenseKey: firstKey || "",
          licenseStatus: firstKey ? "active" : "",
          downloadUrl: "#",
          receiptUrl: o.urls?.receipt || o.urls?.invoice_url || "#"
        });
      }

      // Edge case: no order items
      if (orderItems.length === 0) {
        const keys = licenseKeys.map(k => k.attributes?.key).filter(Boolean);
        purchases.push({
          id: `${orderId}`,
          orderNumber: o.order_number || "",
          purchasedAt: o.created_at || null,
          productId: null,
          productName: "Order",
          licenseKey: keys[0] || "",
          licenseStatus: keys.length ? "active" : "",
          downloadUrl: "#",
          receiptUrl: o.urls?.receipt || o.urls?.invoice_url || "#"
        });
      }
    }

    purchases.sort((a, b) =>
      (b.purchasedAt || "").localeCompare(a.purchasedAt || "")
    );

    return json(200, { source: "lemonsqueezy", email, purchases });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Server error" });
  }
};

/* ---------- helpers ---------- */

function json(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
}

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing required env var: ${name}`);
}

// NEW: Clerk-based email
async function getEmailFromClerk(event) {
  try {
    if (!process.env.CLERK_SECRET_KEY) return null;

    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;

    const { payload } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    // Matches the "email" claim in your JWT template
    return payload?.email || null;
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return null;
  }
}

// OLD behaviour kept as fallback for now
function getFallbackEmail(event) {
  const qs = event.queryStringParameters || {};
  if (qs.email) return String(qs.email).trim();
  if (process.env.NETLIFY_EMAIL_OVERRIDE) {
    return process.env.NETLIFY_EMAIL_OVERRIDE.trim();
  }
  return null;
}

async function fetchAll(path, paramsObj = {}) {
  const items = [];
  let url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(paramsObj)) {
    url.searchParams.set(k, v);
  }
  while (true) {
    const res = await lsFetch(url.toString());
    if (Array.isArray(res.data)) items.push(...res.data);
    const next = res.links?.next;
    if (!next) break;
    url = new URL(next);
  }
  return items;
}

async function lsFetch(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LS ${url} → ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}
