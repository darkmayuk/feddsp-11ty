document.addEventListener("DOMContentLoaded", function() {
  
  /* --- 1. GLOBAL AUTOMATION --- */
  // Find standard elements that should always animate, and tag them.
  // This saves you from having to manually add the class to every single paragraph.
  const autoTargets = document.querySelectorAll("section h2, section p, section img, section .btn, section video");
  
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
  
});