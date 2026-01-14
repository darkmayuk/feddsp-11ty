document.addEventListener("DOMContentLoaded", function() {
  const slider = document.getElementById('featuresScroll');
  
  // STATE VARIABLES
  let isDown = false;
  let startX;
  let scrollLeft;
  let autoScrollId;
  let isAutoScrolling = true; // Start true, stop once user interacts
  
  // SETTINGS
  const autoScrollSpeed = 0.5; // Lower is slower

  // --- 1. MOUSE DRAG LOGIC ---
  
  slider.addEventListener('mousedown', (e) => {
    isDown = true;
    isAutoScrolling = false; // Stop auto-scroll permanently if user grabs it
    cancelAnimationFrame(autoScrollId);
    
    slider.classList.add('active'); // CSS class for 'grabbing' cursor
    
    // Calculate anchor point
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('active');
  });

  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('active');
  });

  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return; // Stop if mouse isn't clicked
    e.preventDefault();  // Prevent text selection
    
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 2; // *2 is the scroll speed multiplier
    slider.scrollLeft = scrollLeft - walk;
  });
  
  // --- 2. TOUCH LOGIC (Pause Auto-scroll) ---
  // Mobile natively handles scrolling, we just need to stop the auto-player
  slider.addEventListener('touchstart', () => {
    isAutoScrolling = false;
    cancelAnimationFrame(autoScrollId);
  });


  // --- 3. AUTO SCROLL ENGINE ---
  function autoScrollLoop() {
    if (isAutoScrolling) {
      slider.scrollLeft += autoScrollSpeed;
      
      // Infinite Loop Logic (Optional: Reset to 0 if at end)
      // Note: For true infinite scroll, we'd need to duplicate DOM elements.
      // This simple version just stops or lets you scroll back when it hits the end.
      if (slider.scrollLeft >= (slider.scrollWidth - slider.clientWidth)) {
         // Optional: Reset to start? 
         // slider.scrollLeft = 0; 
         isAutoScrolling = false; // Or just stop when done
      }
      
      autoScrollId = requestAnimationFrame(autoScrollLoop);
    }
  }

  // Start the engine
  requestAnimationFrame(autoScrollLoop);
});