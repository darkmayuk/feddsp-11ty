// .netlify/functions/account.js
import { verifyToken } from "@clerk/backend";
import { getStore, connectLambda } from "@netlify/blobs";

const LICENSE_STORE_NAME = "licenses";
const IDENTITY_STORE_NAME = "identity"; // NEW

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

    const clerk = await getClerkClaims(event);
    const email =
      clerk.email ||
      getFallbackEmail(event) ||
      null;

    if (!email) {
      return json(401, { error: "Not authenticated (no email)" });
    }

    const store = getStore(LICENSE_STORE_NAME);

    const { blobs } = await store.list();
    const purchases = [];
    const discoveredCustomerIds = new Set(); // NEW

    for (const entry of blobs) {
      const key = entry.key;

      try {
        const record = await store.get(key, { type: "json" });
        if (!record || record.user_email !== email) continue;

        // NEW: collect LS customer ids if present (defensive)
        const recordLsCustomerId =
          record.ls_customer_id ??
          record.customer_id ??
          record.lsCustomerId ??
          record.ls_customer ??
          null;

        if (recordLsCustomerId != null) {
          discoveredCustomerIds.add(String(recordLsCustomerId));
        }

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
          productName,
          licenseKey: record.license_string || "",
          licenseStatus: record.license_string ? "active" : "",
          licenseMeta: {
            licenseId: record.license_id || null,
            issuedAt: record.issued_at || null,
          },
          downloadUrl: "/downloads",
          manualUrl: "#",
          receiptUrl: record.order_receipt_url || "#",
        });
      } catch (err) {
        console.error("Error reading license blob", { key, err });
      }
    }

    purchases.sort((a, b) =>
      (b.purchasedAt || "").localeCompare(a.purchasedAt || "")
    );

    // NEW: write identity mapping (best-effort; never blocks account UI)
    if (clerk.userId && discoveredCustomerIds.size > 0) {
      await writeIdentityMapping(clerk.userId, [...discoveredCustomerIds]);
    }

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

async function getClerkClaims(event) {
  try {
    if (!process.env.CLERK_SECRET_KEY) return { userId: null, email: null };

    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return { userId: null, email: null };

    const { payload } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    return {
      userId: payload?.sub || null,      // Clerk user id
      email: payload?.email || null,     // may be present depending on your Clerk config
    };
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return { userId: null, email: null };
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

async function writeIdentityMapping(clerkUserId, lsCustomerIds) {
  try {
    const identity = getStore(IDENTITY_STORE_NAME);

    const now = new Date().toISOString();
    const clerkKey = `v1/clerk/${clerkUserId}.json`;

    // Upsert clerk -> customers
    const clerkDoc = {
      clerk_user_id: clerkUserId,
      ls_customer_ids: lsCustomerIds,
      updated_at: now,
      schema_version: 1,
    };

    await identity.setJSON(clerkKey, clerkDoc);

    // Upsert reverse index customer -> clerk
    // (best-effort; doesn't need to be perfect to be useful)
    for (const cid of lsCustomerIds) {
      const custKey = `v1/ls/${cid}.json`;
      const custDoc = {
        ls_customer_id: cid,
        clerk_user_ids: [clerkUserId],
        updated_at: now,
        schema_version: 1,
      };
      await identity.setJSON(custKey, custDoc);
    }

    console.log("Identity mapping written", { clerkUserId, lsCustomerIds });
  } catch (err) {
    console.error("Failed to write identity mapping", err);
  }
}
