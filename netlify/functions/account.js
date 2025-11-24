import { verifyToken } from "@clerk/backend";
import { getStore } from "@netlify/blobs";

const API_BASE = "https://api.lemonsqueezy.com/v1";
const LICENSE_STORE_NAME = "licenses";

export const handler = async (event) => {
  try {
    // We still need the LS API key (for orders + order-items)
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

    const licenseStore = getStore(LICENSE_STORE_NAME);
    const purchases = [];

    for (const order of orders) {
      const o = order.attributes || {};
      const orderId = order.id;
      const orderIdStr = String(orderId);

      const orderItems = await fetchAll(`/order-items`, {
        "filter[order_id]": orderId
      });

      // For each order item, look up our own license from Netlify Blobs
      for (const item of orderItems) {
        const ia = item.attributes || {};
        const productName = ia.product_name || "Product";
        const lsProductId = ia.product_id != null ? String(ia.product_id) : "";

        let licenseKey = "";
        let licenseStatus = "";
        let licenseMeta = null;

        if (lsProductId) {
          const blobKey = `${orderIdStr}:${lsProductId}`;
          try {
            const record = await licenseStore.get(blobKey, { type: "json" });
            if (record && record.license_string) {
              licenseKey = record.license_string;
              licenseStatus = "active";
              licenseMeta = {
                licenseId: record.license_id || null,
                issuedAt: record.issued_at || null,
                productId: record.product_id || null,
              };
            } else {
              console.log("No license blob found for key", blobKey);
            }
          } catch (err) {
            console.error("Error reading license from Netlify Blobs", {
              blobKey,
              err,
            });
          }
        }

        purchases.push({
          id: `${orderId}:${item.id}`,
          orderNumber: o.order_number || "",
          purchasedAt: o.created_at || null,
          productId: ia.product_id || null,
          productName,
          licenseKey: licenseKey || "",
          licenseStatus,
          licenseMeta,
          downloadUrl: "#",
          receiptUrl: o.urls?.receipt || o.urls?.invoice_url || "#"
        });
      }

      // Edge case: no order items
      if (orderItems.length === 0) {
        // For now, no blob lookup here – LS should always have at least one item.
        purchases.push({
          id: `${orderId}`,
          orderNumber: o.order_number || "",
          purchasedAt: o.created_at || null,
          productId: null,
          productName: "Order",
          licenseKey: "",
          licenseStatus: "",
          licenseMeta: null,
          downloadUrl: "#",
          receiptUrl: o.urls?.receipt || o.urls?.invoice_url || "#"
        });
      }
    }

    purchases.sort((a, b) =>
      (b.purchasedAt || "").localeCompare(a.purchasedAt || "")
    );

    return json(200, { source: "lemonsqueezy+blobs", email, purchases });
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
