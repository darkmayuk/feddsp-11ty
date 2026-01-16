document.addEventListener("DOMContentLoaded", function () {
  
  const section = document.querySelector(".features-section");
  const track = document.getElementById("featuresScrollTrack");
  
  if (!section || !track) return;

  function initScroll() {
    // 1. Calculate dimensions
    const trackWidth = track.scrollWidth;
    const viewWidth = window.innerWidth;
    const scrollDist = trackWidth - viewWidth;

    // 2. CHECK: Does the content fit on the screen? (Big Monitor logic)
    if (scrollDist <= 0) {
      // It fits! Disable scrolling and CENTER the content
      section.style.height = "auto";
      track.style.transform = "none";
      track.style.margin = "0 auto"; // <--- This centers it
      return;
    }

    // 3. It doesn't fit (Standard Scroll logic)
    // Force left alignment so we can scroll through it
    track.style.margin = "0"; 

    // Acceleration Factor (Higher = shorter page height)
    const scrollSpeed = 3; 
    const targetHeight = (scrollDist / scrollSpeed) + window.innerHeight;
    section.style.height = `${targetHeight}px`;
    
    // 4. The Scroll Listener
    // Note: We define this here to capture the current math variables
    const handleScroll = () => {
       const sectionTop = section.getBoundingClientRect().top;
       
       // Only animate if we are somewhat near/in the section to save resources
       if (sectionTop > window.innerHeight || -sectionTop > targetHeight) return;

       let progress = -sectionTop * scrollSpeed;
       progress = Math.max(0, Math.min(progress, scrollDist));
       
       track.style.transform = `translateX(-${progress}px)`;
    };

    // Remove old listener if exists (cleaner) and add new one
    window.removeEventListener("scroll", window.featuresScrollListener);
    window.featuresScrollListener = handleScroll;
    window.addEventListener("scroll", handleScroll);
  }

  initScroll();
  window.addEventListener("resize", initScroll);
});