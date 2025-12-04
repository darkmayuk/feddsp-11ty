const USE_LIVE_FUNCTION = true;  // ← set to false to go back to dummy instantly

const dummyAccountData = {
  email: "mark@markday.co.uk",
  purchases: [
    {
      id: "order-001",
      orderNumber: "1001",
      purchasedAt: "2025-01-01T12:00:00Z",
      productName: "PHATurator",
      licenseKey: "PHAT-TEST-KEY-123",
      licenseStatus: "active",
      downloadUrl: "/downloads",
      manualUrl: "#",
      receiptUrl: "#"
    },
    {
      id: "order-002",
      orderNumber: "1002",
      purchasedAt: "2025-02-10T09:30:00Z",
      productName: "Fiery",
      licenseKey: "FIERY-TEST-777",
      licenseStatus: "active",
      downloadUrl: "/downloads",
      manualUrl: "#",
      receiptUrl: "#"
    },
    {
      id: "order-003",
      orderNumber: "1003",
      purchasedAt: "2025-03-05T10:00:00Z",
      productName: "LeONE",
      licenseKey: "LEONE-TEST-999",
      licenseStatus: "active",
      downloadUrl: "/downloads",
      manualUrl: "#",
      receiptUrl: "#"
    }
  ]
};

// Simple HTML escaper for embedding license strings safely
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBorderColourForPurchase(p) {
  const styles = window.FED_PRODUCT_STYLES || {};
  if (p.productId && styles[p.productId] && styles[p.productId].borderColour) {
    return styles[p.productId].borderColour;
  }

  const nameKey = (p.productName || "").toLowerCase();
  for (const key in styles) {
    const prod = styles[key];
    if ((prod.name || "").toLowerCase() === nameKey && prod.borderColour) {
      return prod.borderColour;
    }
  }

  return "#ffffff";
}

function renderAccount(data) {
  const emailEl     = document.getElementById("account-email");
  const messagesEl  = document.getElementById("account-messages");
  const purchasesEl = document.getElementById("account-purchases");

  if (!emailEl || !messagesEl || !purchasesEl) return;

  messagesEl.innerHTML = "";
  purchasesEl.innerHTML = "";

  if (!data || !data.email) {
    emailEl.textContent = "Not signed in";
    addMessage(messagesEl, "Sign in to view your purchases and downloads.", "info");
    return;
  }

  emailEl.textContent = "Signed in as " + data.email;

  if (!data.purchases || !data.purchases.length) {
    addMessage(messagesEl, "No purchases found for this account yet.", "info");
    return;
  }

    const cards = data.purchases.map(p => {
    const date = p.purchasedAt
      ? new Date(p.purchasedAt).toLocaleDateString()
      : "Unknown date";

    const hasLicense = !!p.licenseKey;
    const licensePreview = hasLicense
      ? (p.licenseKey.replace(/\s+/g, " ").slice(0, 60) + "…")
      : "—";

    const licenseAttr = hasLicense ? escapeHtml(p.licenseKey) : "";
    const borderColour = getBorderColourForPurchase(p);

    return `
      <div class="col-12 col-md-6">
        <article class="account-card" style="--border-colour: ${borderColour};">
          <div class="account-card-inner">
            <h2 class="account-card-title">${p.productName || "Untitled product"}</h2>
            <p class="account-card-meta">
              ORDER #${p.orderNumber || "—"} · ${date}
            </p>

            <div class="account-card-license">
              <span class="account-card-license-label">License key:</span>
              <code class="account-license-key-preview">${licensePreview}</code>
            </div>

            ${hasLicense ? `
              <button
                type="button"
                class="account-copy-btn account-btn account-btn--ghost"
                data-license="${licenseAttr}">
                COPY KEY
              </button>
            ` : ""}

            <div class="account-card-actions">
              ${p.downloadUrl ? `
                <a class="account-btn account-btn--primary" href="${p.downloadUrl}">
                  DOWNLOAD
                </a>
              ` : ""}

              <div class="account-card-links">
                ${p.manualUrl ? `
                  <a class="account-link" href="${p.manualUrl}">
                    Manual
                  </a>
                ` : ""}

                ${p.receiptUrl ? `
                  <a class="account-link" href="${p.receiptUrl}" target="_blank" rel="noopener">
                    Receipt
                  </a>
                ` : ""}
              </div>
            </div>
          </div>
        </article>
      </div>
    `;
  }).join("");

  purchasesEl.innerHTML = cards;

  attachCopyHandlers();
}

function attachCopyHandlers() {
  const buttons = document.querySelectorAll(".account-copy-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", async () => {
      const license = btn.getAttribute("data-license") || "";
      if (!license) return;

      const originalText = btn.textContent;

      const copyViaClipboardApi = async () => {
        await navigator.clipboard.writeText(license);
      };

      const copyViaFallback = () => {
        const textarea = document.createElement("textarea");
        textarea.value = license;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
        } finally {
          document.body.removeChild(textarea);
        }
      };

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await copyViaClipboardApi();
        } else {
          copyViaFallback();
        }
        btn.textContent = "Copied!";
      } catch (err) {
        console.error("Failed to copy license key", err);
        btn.textContent = "Copy failed";
      }

      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  });
}

function addMessage(container, text, type) {
  const div = document.createElement("div");
  div.className = "account-message account-message--" + type + " mb-3";
  div.textContent = text;
  container.appendChild(div);
}

// Fallback: old behaviour (no Clerk, or Clerk failed)
async function loadViaFunctionWithoutClerk() {
  if (!USE_LIVE_FUNCTION) {
    renderAccount(dummyAccountData);
    return;
  }

  try {
    const res = await fetch("/.netlify/functions/account", { credentials: "include" });
    if (!res.ok) throw new Error("Account function error");
    const data = await res.json();
    renderAccount(data);
  } catch (e) {
    console.error(e);
    renderAccount({ email: "", purchases: [] });
  }
}

async function boot() {
  const emailEl      = document.getElementById("account-email");
  const userButtonEl = document.getElementById("user-button");
  const signInEl     = document.getElementById("sign-in");

  if (!window.Clerk) {
    console.warn("Clerk not available, falling back to env/email-based account loading.");
    await loadViaFunctionWithoutClerk();
    return;
  }

  try {
    await window.Clerk.load();
  } catch (err) {
    console.error("Clerk failed to load properly, falling back.", err);
    await loadViaFunctionWithoutClerk();
    return;
  }

  if (userButtonEl) {
    window.Clerk.mountUserButton(userButtonEl, {
      afterSignOutUrl: "/account"
    });
  }

  if (!window.Clerk.user) {
    if (signInEl) {
      window.Clerk.mountSignIn(signInEl, { redirectUrl: "/account" });
    }
    if (emailEl) {
      emailEl.textContent = "Please sign in to view your purchases.";
    }
    return;
  }

  const emailPrimary =
    window.Clerk.user?.primaryEmailAddress?.emailAddress ||
    window.Clerk.user?.emailAddresses?.[0]?.emailAddress ||
    "";

  if (emailEl) {
    emailEl.textContent = "Signed in as " + emailPrimary;
  }

  if (!USE_LIVE_FUNCTION) {
    const data = { ...dummyAccountData, email: emailPrimary };
    renderAccount(data);
    return;
  }

  let token = "";
  try {
    token = await window.Clerk.session.getToken({ template: "ls" });
  } catch (e) {
    console.error("Failed to get Clerk JWT, falling back to function without auth.", e);
  }

  try {
    const res = await fetch("/.netlify/functions/account", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include"
    });
    if (!res.ok) throw new Error("Account function error");
    const data = await res.json();
    if (!data.email && emailPrimary) {
      data.email = emailPrimary;
    }
    renderAccount(data);
  } catch (e) {
    console.error(e);
    renderAccount({ email: emailPrimary, purchases: [] });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});
