// MailerLite Success Callback
function ml_webform_success_35859411() {
  var $ = ml_jQuery || jQuery;
  $('.ml-subscribe-form-35859411 .row-success').show();
  $('.ml-subscribe-form-35859411 .row-form').hide();
}

document.addEventListener("DOMContentLoaded", function () {
  // ---- Meta Pixel: Lead on attempted submit (newsletter modal) ----
  const form = document.getElementById("newsletter-form");
  if (form) {
    form.addEventListener(
      "submit",
      function () {
        // Attempted lead (MailerLite is cross-origin; we can't confirm accept here)
        if (typeof window.fbq === "function") {
          window.fbq("track", "Lead", { lead_type: "free_packs_modal" });
        }
      },
      { once: true }
    );
  }

  // ---- Magic Link Logic (?signup=true) ----
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has("signup")) {
    const modalEl = document.getElementById("newsletterModal");

    if (modalEl && typeof bootstrap !== "undefined") {
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInstance.show();

      // SUPPRESS TOAST: If they clicked the magic link, assume they don't need the toast popup
      localStorage.setItem("feddsp_toast_dismissed", "true");

      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
});
