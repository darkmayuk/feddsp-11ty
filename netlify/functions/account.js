// .netlify/functions/account.js
import { verifyToken } from "@clerk/backend";
import { getStore } from "@netlify/blobs";

const LICENSE_STORE_NAME = "licenses";

export const handler = async (event) => {
  try {
    // 1) Get email from Clerk (or fallback during testing)
    const emailFromClerk = await getEmailFromClerk(event);
    const email =
      emailFromClerk ||
      getFallbackEmail(event) ||
      null;

    if (!email) {
      return json(401, { error: "Not authenticated (no email)" });
    }

    const store = getStore(LICENSE_STORE_NAME);

    // 2) List all license blobs and filter by user_email
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

        purchases.push({
          id: `${orderId}:${lsProductId}`,
          orderNumber: record.ls_order_number || "",
          purchasedAt: createdAt,
          productId: record.product_id || lsProductId,
          productName: record.product_id || lsProductId, // e.g. "fedDSP-FIERY"
          licenseKey: record.license_string || "",
          licenseStatus: record.license_string ? "active" : "",
          licenseMeta: {
            licenseId: record.license_id || null,
            issuedAt: record.issued_at || null,
          },
          downloadUrl: "#", // can be wired later if you like
          receiptUrl: record.order_receipt_url || "#",
        });
      } catch (err) {
        console.error("Error reading license blob", { key, err });
      }
    }

    // 3) Sort newest first
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

// NEW: Clerk-based email
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

// OLD behaviour kept as fallback for now (useful while testing)
function getFallbackEmail(event) {
  const qs = event.queryStringParameters || {};
  if (qs.email) return String(qs.email).trim();
  if (process.env.NETLIFY_EMAIL_OVERRIDE) {
    return process.env.NETLIFY_EMAIL_OVERRIDE.trim();
  }
  return null;
}
