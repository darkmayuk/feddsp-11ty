const USE_LIVE_FUNCTION = true;

const dummyAccountData = {
  email: "mark@markday.co.uk",
  purchases: [
    {
      id: "order-001",
      orderNumber: "1001",
      purchasedAt: "2025-01-01T12:00:00Z",
      productName: "PHATurator",
      licenseKey: "PHAT-TEST-KEY-123-qwerty-lotsOfCharacters_ready to split",
      downloadUrl: "/downloads",
      manualUrl: "#",
      receiptUrl: "#",
      borderColour: "#ff7f27"
    },
...
    {
      id: "order-003",
      orderNumber: "1003",
      purchasedAt: "2025-03-01T12:00:00Z",
      productName: "FIERY",
      licenseKey: "FIRY-TEST-KEY-789",
      downloadUrl: "/downloads",
      manualUrl: "#",
      receiptUrl: "#",
      borderColour: "#e91e63"
    }
  ]
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

      const safeKey = (p.licenseKey || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      return `
        <div class="card mb-3" style="border: 1px solid ${borderColour};">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="small text-muted">${purchasedAt}</div>
                <h5 class="card-title mb-1">${p.productName || p.productId}</h5>
                ${p.orderNumber ? `<div class="small text-muted">Order #${p.orderNumber}</div>` : ""}
              </div>
            </div>

            ${p.licenseKey ? `
              <div class="mt-3">
                <div class="small text-muted mb-1">License key</div>
                <pre class="p-2 mb-0" style="white-space: pre-wrap; word-break: break-word;">${safeKey}</pre>
              </div>
            ` : ""}

            <div class="mt-3 d-flex gap-3 flex-wrap">
              <a class="btn btn-sm btn-outline-light" href="${p.downloadUrl || "/downloads"}">Downloads</a>
              <a class="btn btn-sm btn-outline-light" href="${p.receiptUrl || "#"}">Receipt</a>
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
  renderPurchases(data.purchases || [], emailPrimary);
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

    if (!res.ok) throw new Error();

    const data = await res.json();
    renderAccount(data, emailPrimary);
  } catch {
    setMessage("Couldn’t load your account right now. Please try again.", "warning");
    renderAccount({ purchases: [] }, emailPrimary);
  }
}

async function boot() {
  const emailEl = el("account-email");
  if (emailEl) emailEl.textContent = "Loading your account…";

  // Clerk must exist (loaded by the browser SDK)
  if (!window.Clerk) {
    setMessage("Account system failed to load. Please refresh.", "warning");
    renderAccount({ purchases: [] }, null);
    return;
  }

  await window.Clerk.load();

  // Mount user button (shows "Manage account" UI)
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

  // Always request a token; backend now requires it.
  const token = await window.Clerk.session.getToken({ template: "ls" }).catch(() => null);

  if (!token) {
    setMessage("Signed in, but couldn’t establish a secure session token. Please refresh.", "warning");
    renderAccount({ purchases: [] }, emailPrimary);
    return;
  }

  await loadPurchasesWithToken(token, emailPrimary);
}

document.addEventListener("DOMContentLoaded", boot);
