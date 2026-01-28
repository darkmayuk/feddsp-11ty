document.addEventListener("DOMContentLoaded", () => {

  // REUSABLE INITIALIZER
  function initProductCarousel(swiperSel, paginationSel, desktopSlides) {
    if (!document.querySelector(swiperSel)) return;

    new Swiper(swiperSel, {
      loop: false,
      watchOverflow: true,
      speed: 600,
      slidesPerView: 1,
      spaceBetween: 100, // Preserved your exact spacing
      centeredSlides: true, // Preserved your layout logic
      
      pagination: {
        el: paginationSel,
        clickable: true,
      },

      // NEW: Enable Arrows
      navigation: {
        nextEl: swiperSel + ' .swiper-button-next',
        prevEl: swiperSel + ' .swiper-button-prev',
      },
      
      breakpoints: {
        1024: {
          slidesPerView: desktopSlides,
          centeredSlides: false,
          spaceBetween: 100 // Preserved your exact spacing
        }
      }
      // Removed "on: slideChange" block completely
    });
  }

  // --- INITIALIZE CAROUSELS ---

  // 1. Samples (3 Slides)
  initProductCarousel(
    '.sample-swiper', 
    '.sample-carousel-section .swiper-pagination', 
    3
  );

  // 2. IRs (3 Slides)
  initProductCarousel(
    '.ir-swiper', 
    '.ir-carousel-section .swiper-pagination', 
    3
  );

  // 3. Free Swag (Unchanged)
  if (document.querySelector('.free-swiper')) {
    new Swiper('.free-swiper', {
      loop: false,
      speed: 600,
      slidesPerView: 2, 
      centeredSlides: false, 
      spaceBetween: 20,
      breakpoints: {
        768: {
          slidesPerView: 2,
          spaceBetween: 60
        }
      }
    });
  }

});