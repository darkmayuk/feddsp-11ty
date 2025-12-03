document.addEventListener("DOMContentLoaded", () => {
  const hero = document.querySelector(".product-hero");
  if (!hero) return;

  const text = hero.querySelector(".product-hero-text");
  const video = hero.querySelector(".product-heroVideo");

  function onScroll() {
    const rect = hero.getBoundingClientRect();

    // very raw approach: use rect.top directly
    const t = rect.top;

    // absurd multipliers – these will force movement
    const textOffset = t * -0.25;   // text flies upward aggressively
    const videoOffset = t * 0.5;   // video drifts opposite direction

    if (text) {
      text.style.transform = `translate3d(0, ${textOffset}px, 0)`;
    }
    if (video) {
      video.style.transform = `translate3d(0, ${videoOffset}px, 0) scale(1.1)`;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
});
