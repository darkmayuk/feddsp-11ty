document.addEventListener("DOMContentLoaded", () => {

  // Shared Helper to update buttons
  function updateBuyButton(swiper, buttonId) {
    if (!buttonId) return; // Exit if no button (e.g. Free section)
    
    const buyBtn = document.getElementById(buttonId);
    if (!buyBtn) return;

    const activeSlide = swiper.slides[swiper.activeIndex];
    const buyLink = activeSlide.getAttribute('data-buy-link');

    if (buyLink) {
      buyBtn.setAttribute('href', buyLink);
    }
  }

  // REUSABLE INITIALIZER
  // Accepts: selector, pagination selector, button ID, and # of desktop slides
  function initProductCarousel(swiperSel, paginationSel, buttonId, desktopSlides) {
    if (!document.querySelector(swiperSel)) return;

    const swiper = new Swiper(swiperSel, {
      loop: true,
      speed: 600,
      slidesPerView: 1,
      spaceBetween: 100,
      centeredSlides: true,
      
      pagination: {
        el: paginationSel,
        clickable: true,
      },
      
      breakpoints: {
        1024: {
          slidesPerView: desktopSlides,
          centeredSlides: false,
          spaceBetween: 100
        }
      },

      on: {
        init: function (s) { updateBuyButton(s, buttonId); },
        slideChange: function (s) { updateBuyButton(s, buttonId); }
      }
    });
  }

  // --- INITIALIZE CAROUSELS ---

  // 1. Samples (3 Slides)
  initProductCarousel(
    '.sample-swiper', 
    '.sample-carousel-section .swiper-pagination', 
    'sample-buy-btn', 
    3
  );

  // 2. IRs (3 Slides)
  initProductCarousel(
    '.ir-swiper', 
    '.ir-carousel-section .swiper-pagination', 
    'ir-buy-btn', 
    3
  );

  // 3. Free Swag (Custom Init: 2 slides always)
  if (document.querySelector('.free-swiper')) {
    new Swiper('.free-swiper', {
      loop: false, // if you only have 2 items, have loop: false
      speed: 600,
      
      // FORCE 2 SLIDES ON MOBILE
      slidesPerView: 2, 
      centeredSlides: false, 
      spaceBetween: 20, // Tighter spacing on mobile so they fit
      
      breakpoints: {
        768: {
          slidesPerView: 2, // Keep 2 on desktop too
          spaceBetween: 60  // Wider spacing on desktop
        }
      }
    });
  }

});