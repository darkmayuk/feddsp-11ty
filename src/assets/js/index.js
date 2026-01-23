document.addEventListener("DOMContentLoaded", () => {

  // --- Shared Helper Function ---
  function updateBuyButton(swiper, buttonId) {
    const buyBtn = document.getElementById(buttonId);
    if (!buyBtn) return;

    const activeSlide = swiper.slides[swiper.activeIndex];
    const buyLink = activeSlide.getAttribute('data-buy-link');

    if (buyLink) {
      buyBtn.setAttribute('href', buyLink);
    }
  }

  // --- 1. SAMPLE CAROUSEL ---
  if (document.querySelector('.sample-swiper')) {
    const sampleSwiper = new Swiper('.sample-swiper', {
      loop: true,
      speed: 600,
      slidesPerView: 1,
      spaceBetween: 100,
      centeredSlides: true,
      
      pagination: {
        // FIX: Look inside the SECTION, not the swiper div
        el: '.sample-carousel-section .swiper-pagination', 
        clickable: true,
      },
      
      breakpoints: {
        1024: {
          slidesPerView: 3,
          centeredSlides: false,
          spaceBetween: 100
        }
      },

      on: {
        init: function (swiper) {
          updateBuyButton(swiper, 'sample-buy-btn');
        },
        slideChange: function (swiper) {
          updateBuyButton(swiper, 'sample-buy-btn');
        }
      }
    });
  }

  // --- 2. IR CAROUSEL ---
  if (document.querySelector('.ir-swiper')) {
    const irSwiper = new Swiper('.ir-swiper', {
      loop: true,
      speed: 600,
      slidesPerView: 1,
      spaceBetween: 100,
      centeredSlides: true,
      
      pagination: {
        // FIX: Look inside the SECTION, not the swiper div
        el: '.ir-carousel-section .swiper-pagination', 
        clickable: true,
      },
      
      breakpoints: {
        1024: {
          slidesPerView: 3,
          centeredSlides: false,
          spaceBetween: 100
        }
      },

      on: {
        init: function (swiper) {
          updateBuyButton(swiper, 'ir-buy-btn');
        },
        slideChange: function (swiper) {
          updateBuyButton(swiper, 'ir-buy-btn');
        }
      }
    });
  }

});