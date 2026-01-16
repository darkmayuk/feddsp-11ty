document.addEventListener("DOMContentLoaded", function () {
  
  const section = document.querySelector(".features-section");
  const track = document.getElementById("featuresScrollTrack");
  
  if (!section || !track) return;

  function initScroll() {
    // 1. Calculate dimensions
    const trackWidth = track.scrollWidth;
    const viewWidth = window.innerWidth;
    const scrollDist = trackWidth - viewWidth;

    if (scrollDist <= 0) {
      section.style.height = "auto";
      return;
    }

    // 2. THE FIX: Acceleration Factor
    // Higher number = Faster scroll = Less vertical margin/height
    const scrollSpeed = 1; 

    // We divide the distance by the speed to require less vertical scrolling
    const targetHeight = (scrollDist / scrollSpeed) + window.innerHeight;
    section.style.height = `${targetHeight}px`;
    
    // 3. The Scroll Listener
    window.addEventListener("scroll", () => {
      const sectionTop = section.getBoundingClientRect().top;
      
      // Calculate progress based on our accelerated height
      // We multiply by scrollSpeed to map the shorter vertical scroll to the longer horizontal track
      let progress = -sectionTop * scrollSpeed;
      
      // Clamp the values so we don't overshoot
      progress = Math.max(0, Math.min(progress, scrollDist));
      
      track.style.transform = `translateX(-${progress}px)`;
    });
  }

  initScroll();
  window.addEventListener("resize", initScroll);
});