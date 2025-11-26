// .netlify/functions/account.js
import { verifyToken } from "@clerk/backend";
import { getStore, connectLambda } from "@netlify/blobs";

const LICENSE_STORE_NAME = "licenses";

// Map internal product IDs → friendly names for UI
const PRODUCT_LABELS = {
  "fedDSP-VCA": "VCA",
  "fedDSP-PHAT": "PHATurator",
  "fedDSP-OPTO": "OPTO",
  "fedDSP-FIERY": "FIERY",
  "fedDSP-leONE": "leONE",
};

export const handler = async (event) => {
  try {
    connectLambda(event);

    const emailFromClerk = await getEmailFromClerk(event);
    const email =
      emailFromClerk ||
      getFallbackEmail(event) ||
      null;

    if (!email) {
      return json(401, { error: "Not authenticated (no email)" });
    }

    const store = getStore(LICENSE_STORE_NAME);

    const { blobs } = await store.list();
    const purchases = [];

    for (const entry of blobs) {
      const key = entry.key;

      try {
        const record = await store.get(key, { type: "json" });
        if (!record || record.user_email !== email) continue;

        const orderId = record.ls_order_id || "unknown-order-id";
        const lsProductId = record.ls_product_id || "unknown-product";
        const createdAt = record.created_at || record.issued_at || null;

        const productId = record.product_id || lsProductId;
        const productName = PRODUCT_LABELS[productId] || productId;

        purchases.push({
          id: `${orderId}:${lsProductId}`,
          orderNumber: record.ls_order_number || "",
          purchasedAt: createdAt,
          productId,
          productName,                      // friendly name (e.g. "PHATurator")
          licenseKey: record.license_string || "",
          licenseStatus: record.license_string ? "active" : "",
          licenseMeta: {
            licenseId: record.license_id || null,
            issuedAt: record.issued_at || null,
          },
          downloadUrl: "/downloads",        // common downloads page
          manualUrl: "#",                   // placeholder for now
          receiptUrl: record.order_receipt_url || "#",
        });
      } catch (err) {
        console.error("Error reading license blob", { key, err });
      }
    }

    purchases.sort((a, b) =>
      (b.purchasedAt || "").localeCompare(a.purchasedAt || "")
    );

    return json(200, { source: "blobs", email, purchases });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Server error" });
  }
};

/* ---------- helpers ---------- */

function json(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
}

async function getEmailFromClerk(event) {
  try {
    if (!process.env.CLERK_SECRET_KEY) return null;

    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;

    const { payload } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    return payload?.email || null;
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return null;
  }
}

function getFallbackEmail(event) {
  const qs = event.queryStringParameters || {};
  if (qs.email) return String(qs.email).trim();
  if (process.env.NETLIFY_EMAIL_OVERRIDE) {
    return process.env.NETLIFY_EMAIL_OVERRIDE.trim();
  }
  return null;
}
