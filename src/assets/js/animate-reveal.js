document.addEventListener("DOMContentLoaded", function() {
  
  /* --- 1. GLOBAL AUTOMATION --- */
  // Find standard elements that should always animate, and tag them.
  const selectors = "section h2:not(.no-reveal), section p:not(.no-reveal), section img:not(.no-reveal), section .btn:not(.no-reveal), section video:not(.no-reveal)";
  const autoTargets = document.querySelectorAll(selectors);
  
  autoTargets.forEach((el) => {
    el.classList.add("reveal-on-scroll");
  });


  /* --- 2. THE OBSERVER ENGINE --- */
  const elementsToReveal = document.querySelectorAll(".reveal-on-scroll");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target); // Stop watching once revealed
      }
    });
  }, {
    threshold: 0.1,      // Trigger when 10% is visible
    rootMargin: "0px 0px -30px 0px" // Offset slightly
  });

  elementsToReveal.forEach((el) => {
    observer.observe(el);
  });


  /* --- 3. STICKY FOOTER LOGIC --- */
  const stickyFooter = document.getElementById('sticky-product-footer');
  const siteFooter = document.querySelector('.site-footer'); // Main footer at bottom

  if (stickyFooter) {
    
    // A. SHOW ON SCROLL
    // Instead of watching the hero, we just check if the user has scrolled down at all.
    window.addEventListener('scroll', () => {
      // 10px buffer prevents jitter on tiny movements
      if (window.scrollY > 10) {
        stickyFooter.classList.add('is-visible');
      } else {
        stickyFooter.classList.remove('is-visible');
      }
    });

    // B. HIDE WHEN REACHING BOTTOM FOOTER
    // This prevents the sticky bar from overlapping your actual footer content.
    if (siteFooter) {
      const footerObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Footer is visible -> Hide the sticky bar
            stickyFooter.classList.add('footer-reached');
          } else {
            // Footer is gone -> Allow the sticky bar to show again
            stickyFooter.classList.remove('footer-reached');
          }
        });
      }, { root: null, threshold: 0.1 }); // Trigger when 10% of footer is visible

      footerObserver.observe(siteFooter);
    }
  }
  
});