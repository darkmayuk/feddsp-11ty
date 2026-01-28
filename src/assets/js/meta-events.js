(function () {
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-meta-event]");
    if (!el) return;

    const eventName = el.getAttribute("data-meta-event");
    if (!eventName) return;

    if (typeof window.fbq === "function") {
      window.fbq("track", eventName);
    }
  });
})();
