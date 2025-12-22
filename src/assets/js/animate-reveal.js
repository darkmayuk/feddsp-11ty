document.addEventListener("DOMContentLoaded", function() {
  
  /* --- 1. GLOBAL AUTOMATION --- */
  // Find standard elements that should always animate, and tag them.
  // This saves you from having to manually add the class to every single paragraph.
  const selectors = "section h2:not(.no-reveal), section p:not(.no-reveal), section img:not(.no-reveal), section .btn:not(.no-reveal), section video:not(.no-reveal)";
  const autoTargets = document.querySelectorAll(selectors);
  
  autoTargets.forEach((el) => {
    // Only add the class if it's not already there
    el.classList.add("reveal-on-scroll");
  });


  /* --- 2. THE OBSERVER ENGINE --- */
  // Now we look for EVERYTHING with the class '.reveal-on-scroll'
  // This catches the auto-tagged elements above AND the manual ones you put in the HTML.
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
    rootMargin: "0px 0px -30px 0px" // Offset slightly so it doesn't trigger too early
  });

  // Start watching
  elementsToReveal.forEach((el) => {
    observer.observe(el);
  });

  /* --- 3. STICKY FOOTER LOGIC --- */
  const heroSection = document.querySelector('.hero-v2');
  const siteFooter = document.querySelector('.site-footer'); // Find the main footer
  const stickyFooter = document.getElementById('sticky-product-footer');

  if (heroSection && stickyFooter) {
    
    // Observer 1: Watch the Hero (Show bar when Hero is gone)
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          stickyFooter.classList.add('is-visible');
        } else {
          stickyFooter.classList.remove('is-visible');
        }
      });
    }, { root: null, threshold: 0 });
    
    heroObserver.observe(heroSection);

    // Observer 2: Watch the Footer (Hide bar when Footer appears)
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