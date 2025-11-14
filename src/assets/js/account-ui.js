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
      downloadUrl: "#",
      receiptUrl: "#"
    },
    {
      id: "order-002",
      orderNumber: "1002",
      purchasedAt: "2025-02-10T09:30:00Z",
      productName: "Fiery",
      licenseKey: "FIERY-TEST-777",
      licenseStatus: "active",
      downloadUrl: "#",
      receiptUrl: "#"
    },
    {
      id: "order-003",
      orderNumber: "1003",
      purchasedAt: "2025-03-05T10:00:00Z",
      productName: "LeONE",
      licenseKey: "LEONE-TEST-999",
      licenseStatus: "active",
      downloadUrl: "#",
      receiptUrl: "#"
    }
  ]
};

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

    const status = p.licenseStatus
      ? p.licenseStatus.charAt(0).toUpperCase() + p.licenseStatus.slice(1)
      : "Unknown";

    return `
      <div class="col-12 col-md-6">
        <article class="card h-100 bg-dark border-secondary text-light">
          <div class="card-body d-flex flex-column">
            <h2 class="card-title mb-3">${p.productName || "Untitled product"}</h2>
            <p class="card-subtitle small mb-3">
              Order #${p.orderNumber || "—"} · ${date}
            </p>

            <p class="mb-2">
              <span class="mb-1">License key:</span>
              <code class="account-license-key">${p.licenseKey || "—"}</code>
            </p>

            <div class="mt-auto pt-2 d-flex flex-wrap gap-2">
              ${p.downloadUrl ? `
                <a class="btn btn-sm btn-primary" href="${p.downloadUrl}">
                  Download
                </a>
              ` : ""}

              ${p.receiptUrl ? `
                <a class="btn btn-sm btn-outline-secondary" href="${p.receiptUrl}" target="_blank" rel="noopener">
                  View receipt
                </a>
              ` : ""}
            </div>
          </div>
        </article>
      </div>
    `;
  }).join("");

  purchasesEl.innerHTML = cards;
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

  // If Clerk script didn't load at all, just use the old behaviour
  if (!window.Clerk) {
    console.warn("Clerk not available, falling back to env/email-based account loading.");
    await loadViaFunctionWithoutClerk();
    return;
  }

  // Initialise Clerk
  try {
    await window.Clerk.load();
  } catch (err) {
    console.error("Clerk failed to load properly, falling back.", err);
    await loadViaFunctionWithoutClerk();
    return;
  }

  // Mount user button (top right)
  if (userButtonEl) {
    window.Clerk.mountUserButton(userButtonEl, {
      afterSignOutUrl: "/account"
    });
  }

  // If not signed in, show Sign In UI and stop
  if (!window.Clerk.user) {
    if (signInEl) {
      window.Clerk.mountSignIn(signInEl, { redirectUrl: "/account" });
    }
    if (emailEl) {
      emailEl.textContent = "Please sign in to view your purchases.";
    }
    return;
  }

  // Signed in → show email from Clerk
  const emailPrimary =
    window.Clerk.user?.primaryEmailAddress?.emailAddress ||
    window.Clerk.user?.emailAddresses?.[0]?.emailAddress ||
    "";

  if (emailEl) {
    emailEl.textContent = "Signed in as " + emailPrimary;
  }

  if (!USE_LIVE_FUNCTION) {
    // Use dummy data but with the Clerk email for consistency
    const data = { ...dummyAccountData, email: emailPrimary };
    renderAccount(data);
    return;
  }

  // Get JWT from Clerk (template 'ls') and call the Netlify function
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
    // If backend didn't return email for some reason, ensure one is present
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
