// .netlify/functions/account.js
import { verifyToken, clerkClient } from "@clerk/backend";
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

    // Require Clerk auth in all non-dev contexts
    const auth = await getClerkAuth(event);
    if (!auth) {
      return json(401, { error: "Not authenticated" });
    }

    const { clerkUserId, verifiedEmails } = auth;

    const licenseStore = getStore(LICENSE_STORE_NAME);
    const identityStore = getStore(IDENTITY_STORE_NAME);

    // Try to load existing mapping
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

        // Prefer stable mapping if we have it and the record has an LS customer id.
        const recordLsCustomerId = record.ls_customer_id || record.ls_customer || null;

        let isMine = false;

        if (mappedLsCustomerIds.size > 0 && recordLsCustomerId) {
          isMine = mappedLsCustomerIds.has(String(recordLsCustomerId));
        } else {
          // First-time linking / fallback: match by VERIFIED email(s) only.
          const recordEmail = (record.user_email || "").trim().toLowerCase();
          if (recordEmail && verifiedEmails.has(recordEmail)) {
            isMine = true;
          }
        }

        if (!isMine) continue;

        // If we matched, harvest LS customer id for mapping (if present)
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

    // Get verified emails from Clerk server-side.
    // This avoids relying on custom JWT claims and prevents "email missing" failures.
    const verifiedEmails = await getVerifiedEmailsForUser(clerkUserId);

    return { clerkUserId, verifiedEmails };
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return null;
  }
}

async function getVerifiedEmailsForUser(clerkUserId) {
  const set = new Set();

  try {
    const user = await clerkClient.users.getUser(clerkUserId);

    // Add verified email addresses (lowercased)
    for (const addr of user.emailAddresses || []) {
      if (addr?.verification?.status === "verified" && addr.emailAddress) {
        set.add(String(addr.emailAddress).trim().toLowerCase());
      }
    }
  } catch (err) {
    // If Clerk API call fails for any reason, we return an empty set; account will show no purchases.
    console.error("Failed to fetch Clerk user emails", { clerkUserId, err });
  }

  return set;
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

    // Only write if we have something meaningful to store.
    if (discovered.length === 0) return;

    // Avoid needless writes if nothing changed.
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

    // Optional reverse index (best effort). Doesn’t affect core behaviour.
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
