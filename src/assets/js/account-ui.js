// /assets/js/account-ui.js

// Set false if you ever want to bypass the function for UI-only testing.
const USE_LIVE_FUNCTION = true;

// A small, valid dummy payload for UI testing (only used when USE_LIVE_FUNCTION=false)
const dummyAccountData = {
  purchases: [
    {
      id: "order-001:product-001",
      orderNumber: "1001",
      purchasedAt: "2025-01-01T12:00:00Z",
      productId: "fedDSP-PHAT",
      productName: "PHATurator",
      licenseKey: "PHAT-TEST-KEY-123-EXAMPLE",
      downloadUrl: "/downloads",
      receiptUrl: "#",
    },
  ],
};

function el(id) {
  return document.getElementById(id);
}

function setMessage(html, kind = "info") {
  const box = el("account-messages");
  if (!box) return;
  box.innerHTML = `
    <div class="alert alert-${kind} small" role="alert">
      ${html}
    </div>
  `;
}

function clearMessage() {
  const box = el("account-messages");
  if (!box) return;
  box.innerHTML = "";
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPurchases(purchases, emailPrimary) {
  const container = el("account-purchases");
  if (!container) return;

  if (!purchases || purchases.length === 0) {
    container.innerHTML = `
      <div class="small">
        <p class="mb-1"><strong>No purchases found for this account.</strong></p>
        <p class="mb-0">This usually means you signed in with a different email than the one used at checkout.</p>
      </div>
    `;
    return;
  }

  const styles = window.FED_PRODUCT_STYLES || {};

  container.innerHTML = purchases
    .map((p) => {
      const productStyle = styles[p.productId] || {};
      const borderColour = productStyle.borderColour || "#ffffff";

      const purchasedAt = p.purchasedAt
        ? new Date(p.purchasedAt).toLocaleString()
        : "";

      const safeKey = escapeHtml(p.licenseKey || "");

      return `
        <div class="card mb-3" style="border: 1px solid ${borderColour};">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="small text-muted">${escapeHtml(purchasedAt)}</div>
                <h5 class="card-title mb-1">${escapeHtml(p.productName || p.productId)}</h5>
                ${p.orderNumber ? `<div class="small text-muted">Order #${escapeHtml(p.orderNumber)}</div>` : ""}
              </div>
            </div>

            ${p.licenseKey ? `
              <div class="mt-3">
                <div class="small text-muted mb-1">License key</div>
                <pre class="p-2 mb-0" style="white-space: pre-wrap; word-break: break-word;">${safeKey}</pre>
              </div>
            ` : ""}

            <div class="mt-3 d-flex gap-3 flex-wrap">
              <a class="btn btn-sm btn-outline-light" href="${escapeHtml(p.downloadUrl || "/downloads")}">Downloads</a>
              <a class="btn btn-sm btn-outline-light" href="${escapeHtml(p.receiptUrl || "#")}">Receipt</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderAccount(data, emailPrimary) {
  const emailEl = el("account-email");
  if (emailEl) {
    emailEl.textContent = emailPrimary ? `Signed in as ${emailPrimary}` : "Signed in";
  }
  renderPurchases((data && data.purchases) || [], emailPrimary);
}

async function loadPurchasesWithToken(token, emailPrimary) {
  try {
    clearMessage();

    if (!USE_LIVE_FUNCTION) {
      renderAccount(dummyAccountData, emailPrimary);
      return;
    }

    const res = await fetch("/.netlify/functions/account", {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });

    if (res.status === 401) {
      setMessage("Please sign in to view your licenses.", "warning");
      renderAccount({ purchases: [] }, emailPrimary);
      return;
    }

    if (!res.ok) {
      throw new Error(`Account API returned ${res.status}`);
    }

    const data = await res.json();
    renderAccount(data, emailPrimary);
  } catch (err) {
    console.error(err);
    setMessage("Couldn’t load your account right now. Please try again.", "warning");
    renderAccount({ purchases: [] }, emailPrimary);
  }
}

async function boot() {
  const emailEl = el("account-email");
  if (emailEl) emailEl.textContent = "Loading your account…";

  if (!window.Clerk) {
    setMessage("Account system failed to load. Please refresh.", "warning");
    renderAccount({ purchases: [] }, null);
    return;
  }

  await window.Clerk.load();

  const userButton = el("user-button");
  if (userButton) {
    window.Clerk.mountUserButton(userButton);
  }

  const signInDiv = el("sign-in");

  // Logged out: mount sign-in UI
  if (!window.Clerk.user || !window.Clerk.session) {
    if (signInDiv) window.Clerk.mountSignIn(signInDiv);
    setMessage("Sign in to view your licenses. Use the same email you used at checkout.", "info");
    renderAccount({ purchases: [] }, null);
    return;
  }

  // Logged in: unmount sign-in UI if it exists
  try {
    if (signInDiv) window.Clerk.unmountSignIn(signInDiv);
  } catch {}

  const emailPrimary = window.Clerk.user?.primaryEmailAddress?.emailAddress || null;

  const token = await window.Clerk.session.getToken().catch(() => null);

  if (!token) {
    setMessage("Signed in, but couldn’t establish a secure session token. Please refresh.", "warning");
    renderAccount({ purchases: [] }, emailPrimary);
    return;
  }

  await loadPurchasesWithToken(token, emailPrimary);
}

document.addEventListener("DOMContentLoaded", boot);
