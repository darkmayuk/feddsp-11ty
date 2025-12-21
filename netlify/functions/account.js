// .netlify/functions/account.js
import { verifyToken } from "@clerk/backend";
import { getStore, connectLambda } from "@netlify/blobs";

const LICENSE_STORE_NAME = "licenses";
const IDENTITY_STORE_NAME = "identity";

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

    const auth = await getClerkAuth(event);
    if (!auth) {
      return json(401, { error: "Not authenticated" });
    }

    const { clerkUserId, tokenEmail } = auth;
    const verifiedEmails = new Set();
    if (tokenEmail) verifiedEmails.add(tokenEmail);

    const licenseStore = getStore(LICENSE_STORE_NAME);
    const identityStore = getStore(IDENTITY_STORE_NAME);

    // Load existing mapping (if any)
    const mappingKey = `v1/clerk/${clerkUserId}.json`;
    const existingMapping = await safeGetJson(identityStore, mappingKey);
    const mappedLsCustomerIds = new Set(existingMapping?.lsCustomerIds || []);

    const { blobs } = await licenseStore.list();
    const purchases = [];

    // During scan, collect LS customer IDs that belong to this user
    const discoveredLsCustomerIds = new Set(mappedLsCustomerIds);

    for (const entry of blobs) {
      const key = entry.key;

      try {
        const record = await licenseStore.get(key, { type: "json" });
        if (!record) continue;

        const recordLsCustomerId = record.ls_customer_id || record.ls_customer || null;

        let isMine = false;

        // Prefer stable mapping if we have it
        if (mappedLsCustomerIds.size > 0 && recordLsCustomerId) {
          isMine = mappedLsCustomerIds.has(String(recordLsCustomerId));
        } else {
          // First-time linking / fallback: match by token email only (no querystring, no overrides)
          const recordEmail = (record.user_email || "").trim().toLowerCase();
          if (recordEmail && verifiedEmails.has(recordEmail)) {
            isMine = true;
          }
        }

        if (!isMine) continue;

        if (recordLsCustomerId) discoveredLsCustomerIds.add(String(recordLsCustomerId));

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

    // Persist mapping if we discovered anything new
    await maybeWriteMapping(identityStore, clerkUserId, existingMapping, discoveredLsCustomerIds);

    return json(200, {
      source: "blobs",
      clerkUserId,
      purchases,
    });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Server error" });
  }
};

/* ---------- helpers ---------- */

function json(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
}

async function getClerkAuth(event) {
  try {
    if (!process.env.CLERK_SECRET_KEY) return null;

    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;

    const { payload } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkUserId = payload?.sub || null;
    if (!clerkUserId) return null;

    // Your token template ("ls") must include this claim, otherwise linking-by-email won't happen yet.
    // Mapping still works once ls_customer_id exists and becomes linked.
    const tokenEmail =
      (payload?.email && String(payload.email).trim().toLowerCase()) ||
      (payload?.email_address && String(payload.email_address).trim().toLowerCase()) ||
      null;

    return { clerkUserId, tokenEmail };
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return null;
  }
}

async function safeGetJson(store, key) {
  try {
    return await store.get(key, { type: "json" });
  } catch {
    return null;
  }
}

async function maybeWriteMapping(store, clerkUserId, existingMapping, discoveredSet) {
  try {
    const discovered = Array.from(discoveredSet);

    if (discovered.length === 0) return;

    const existing = (existingMapping?.lsCustomerIds || []).map(String);
    const existingSet = new Set(existing);
    const changed =
      discovered.length !== existing.length ||
      discovered.some((id) => !existingSet.has(id));

    if (!changed) return;

    const now = new Date().toISOString();
    const next = {
      clerkUserId,
      lsCustomerIds: discovered.sort(),
      linkedAt: existingMapping?.linkedAt || now,
      updatedAt: now,
    };

    await store.set(`v1/clerk/${clerkUserId}.json`, JSON.stringify(next), {
      contentType: "application/json",
    });

    // Optional reverse index (best effort)
    for (const lsCustomerId of next.lsCustomerIds) {
      await store.set(
        `v1/ls/${lsCustomerId}.json`,
        JSON.stringify({ lsCustomerId, clerkUserId, linkedAt: next.linkedAt, updatedAt: now }),
        { contentType: "application/json" }
      );
    }
  } catch (err) {
    console.error("Failed to write identity mapping", err);
  }
}
