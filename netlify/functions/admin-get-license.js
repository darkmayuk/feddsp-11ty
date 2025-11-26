import { getStore, connectLambda } from "@netlify/blobs";

const LICENSE_STORE_NAME = "licenses";
const ADMIN_HEADER = "x-admin-key"; // shared secret header name

export const handler = async (event) => {
  try {
    // Required for Lambda compatibility so Blobs works
    connectLambda(event);

    // --- 1) Check admin key ---
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      console.error("ADMIN_API_KEY env var not set");
      return json(500, { error: "Server misconfigured" });
    }

    const headers = event.headers || {};
    const qs = event.queryStringParameters || {};
    const suppliedKey =
      headers[ADMIN_HEADER] ||
      headers[ADMIN_HEADER.toLowerCase()] ||
      qs.key ||
      "";

    if (suppliedKey !== adminKey) {
      return json(403, { error: "Forbidden" });
    }

    // --- 2) Parse filters (email / orderNumber / productId) ---
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        body = {};
      }
    }

    const email =
      body.email || qs.email || null;
    const orderNumber =
      body.orderNumber || qs.orderNumber || null;
    const productId =
      body.productId || qs.productId || null;

    if (!email && !orderNumber) {
      return json(400, {
        error: "Provide at least email or orderNumber",
      });
    }

    // --- 3) Scan blobs and collect matches ---
    const store = getStore(LICENSE_STORE_NAME);
    const { blobs } = await store.list();

    const matches = [];

    for (const entry of blobs) {
      const key = entry.key;
      try {
        const record = await store.get(key, { type: "json" });
        if (!record) continue;

        if (email && record.user_email !== email) continue;
        if (
          orderNumber &&
          String(record.ls_order_number || "") !== String(orderNumber)
        ) continue;
        if (productId && record.product_id !== productId) continue;

        matches.push({
          blobKey: key,
          productId: record.product_id || record.ls_product_id,
          userEmail: record.user_email,
          userName: record.user_name,
          orderNumber: record.ls_order_number,
          orderId: record.ls_order_id,
          licenseId: record.license_id,
          issuedAt: record.issued_at,
          refundedAt: record.refunded_at || null,
          licenseString: record.license_string,
        });
      } catch (err) {
        console.error("Error reading blob in admin-get-license", {
          key,
          err,
        });
      }
    }

    return json(200, { matches });
  } catch (err) {
    console.error("admin-get-license error", err);
    return json(500, { error: "Server error" });
  }
};

function json(status, body) {
  return { statusCode: status, body: JSON.stringify(body) };
}
