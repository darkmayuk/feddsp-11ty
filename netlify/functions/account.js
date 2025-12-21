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

    // 1) Authenticate Clerk user (sub is the durable identity)
    const clerkAuth = await getClerkAuth(event);
    if (clerkAuth.error) {
      return json(401, { error: "Not authenticated", reason: clerkAuth.error });
    }

    const { clerkUserId } = clerkAuth;

    const licenseStore = getStore(LICENSE_STORE_NAME);
    const identityStore = getStore(IDENTITY_STORE_NAME);

    // 2) Load existing mapping, if any (durable join key)
    const mappingKey = `v1/clerk/${clerkUserId}.json`;
    const existingMapping = await safeGetJson(identityStore, mappingKey);
    const mappedCustomerIds = normalizeCustomerIds(existingMapping);

    // 3) Only if we don't have mapping yet, fetch verified emails for initial join
    //    (We intentionally do NOT depend on JWT containing email claims.)
    const verifiedEmails =
      mappedCustomerIds.size > 0
        ? new Set()
        : await getVerifiedEmailsFromClerkAPI(clerkUserId);

    // 4) Scan licenses and match:
    //    - if mapping exists: match by ls_customer_id
    //    - else: match by verified email
    const { blobs } = await licenseStore.list();
    const purchases = [];
    const discoveredCustomerIds = new Set(mappedCustomerIds);

    for (const entry of blobs) {
      const key = entry.key;

      try {
        const record = await licenseStore.get(key, { type: "json" });
        if (!record) continue;

        const recordCustomerId = getRecordCustomerId(record);
        const recordEmail = String(record.user_email || "").trim().toLowerCase();

        let isMine = false;

        if (mappedCustomerIds.size > 0) {
          // Durable path: customer id mapping
          if (recordCustomerId && mappedCustomerIds.has(String(recordCustomerId))) {
            isMine = true;
          }
        } else {
          // Initial join path: verified email match
          if (recordEmail && verifiedEmails.has(recordEmail)) {
            isMine = true;
          }
        }

        if (!isMine) continue;

        if (recordCustomerId) discoveredCustomerIds.add(String(recordCustomerId));

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

    // 5) Write mapping (best-effort) if we discovered customer ids and mapping was absent/incomplete
    if (discoveredCustomerIds.size > 0) {
      await writeIdentityMapping(identityStore, clerkUserId, existingMapping, discoveredCustomerIds);
    }

    // For UI display only: show primary verified email if we had to fetch it
    const emailForUi =
      (verifiedEmails.size > 0 ? [...verifiedEmails][0] : null) || null;

    return json(200, { source: "blobs", email: emailForUi, purchases });
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
    if (!process.env.CLERK_SECRET_KEY) {
      return { error: "missing_clerk_secret_key" };
    }

    const authHeader =
      event.headers?.authorization || event.headers?.Authorization || "";
    const token = String(authHeader).replace(/^Bearer\s+/i, "").trim();
    if (!token) return { error: "missing_bearer_token" };

    // IMPORTANT: verifyToken returns the verified claims directly
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });

    const clerkUserId = claims?.sub || null;
    if (!clerkUserId) return { error: "missing_sub_claim" };

    return { clerkUserId };
  } catch (err) {
    console.error("Clerk token verification failed", err);
    return { error: "token_verify_failed" };
  }
}

async function getVerifiedEmailsFromClerkAPI(clerkUserId) {
  const set = new Set();

  try {
    const res = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.error("Clerk API user fetch failed", { status: res.status });
      return set;
    }

    const user = await res.json();
    const emails = user.email_addresses || user.emailAddresses || [];

    for (const e of emails) {
      const addr = e.email_address || e.emailAddress;
      const verification = e.verification || {};
      const status = verification.status;

      if (addr && status === "verified") {
        set.add(String(addr).trim().toLowerCase());
      }
    }
  } catch (err) {
    console.error("Clerk API fetch exception", err);
  }

  return set;
}

function getRecordCustomerId(record) {
  // defensive: tolerate different field names forever
  return (
    record.ls_customer_id ??
    record.customer_id ??
    record.lsCustomerId ??
    record.ls_customer ??
    null
  );
}

function normalizeCustomerIds(mappingDoc) {
  const set = new Set();

  if (!mappingDoc) return set;

  // Support both schemas:
  // - camelCase: { lsCustomerIds: [...] }
  // - snake_case: { ls_customer_ids: [...] }
  const ids =
    mappingDoc.lsCustomerIds ||
    mappingDoc.ls_customer_ids ||
    mappingDoc.lsCustomerId ||
    mappingDoc.ls_customer_id ||
    null;

  if (Array.isArray(ids)) {
    for (const id of ids) set.add(String(id));
  } else if (ids != null) {
    set.add(String(ids));
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

async function writeIdentityMapping(identityStore, clerkUserId, existingMapping, discoveredSet) {
  try {
    const discovered = [...discoveredSet].map(String).sort();

    // determine if change is needed
    const existing = normalizeCustomerIds(existingMapping);
    let changed = existing.size !== discovered.length;
    if (!changed) {
      for (const id of discovered) {
        if (!existing.has(id)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    const now = new Date().toISOString();

    // Preserve linkedAt if it exists (either schema)
    const linkedAt =
      existingMapping?.linkedAt ||
      existingMapping?.linked_at ||
      now;

    // Clerk -> LS customers
    await identityStore.setJSON(`v1/clerk/${clerkUserId}.json`, {
      clerkUserId,
      lsCustomerIds: discovered,
      linkedAt,
      updatedAt: now,
    });

    // Reverse index LS customer -> Clerk (best-effort)
    for (const lsCustomerId of discovered) {
      await identityStore.setJSON(`v1/ls/${lsCustomerId}.json`, {
        lsCustomerId,
        clerkUserId,
        linkedAt,
        updatedAt: now,
      });
    }

    console.log("Identity mapping written", { clerkUserId, lsCustomerIds: discovered });
  } catch (err) {
    console.error("Failed to write identity mapping", err);
  }
}
