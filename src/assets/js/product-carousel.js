document.addEventListener('DOMContentLoaded', function () {
  const carouselEl = document.querySelector('#productsCarousel');
  if (!carouselEl) return;

  const swiper = new Swiper('#productsCarousel', {
    loop: false,
    speed: 700,
    effect: 'slide',
    slideToClickedSlide: false,

    autoplay: {
      delay: 8000,
      pauseOnMouseEnter: true,
      disableOnInteraction: true
    },

    // mobile-first defaults
    centeredSlides: false,
    slidesPerView: 1,
    spaceBetween: 0,

    pagination: {
      el: '#productsCarousel .swiper-pagination',
      clickable: true,
      bulletElement: 'button'
    },

    navigation: {
      nextEl: '#productsCarousel .swiper-button-next',
      prevEl: '#productsCarousel .swiper-button-prev'
    },

    breakpoints: {
      0: {
        slidesPerView: 1,
        centeredSlides: false,
        spaceBetween: 0
      },
      992: {
        slidesPerView: 1.1,     // peek left + right
        centeredSlides: true,
        spaceBetween: -60
      }
    }
  });

  const buyBtn   = document.getElementById('carouselBuy');
  const learnBtn = document.getElementById('carouselLearn');

  function updateButtons() {
    if (!buyBtn || !learnBtn) return;

    const activeSlide = swiper.slides[swiper.activeIndex];
    if (!activeSlide) return;

    const buy   = activeSlide.getAttribute('data-buy');
    const learn = activeSlide.getAttribute('data-learn');

    if (buy)   buyBtn.href   = buy;
    if (learn) learnBtn.href = learn;
  }

  swiper.on('slideChange', updateButtons);
  updateButtons();

  // Smooth behaviour:
  // - click active slide image → navigate
  // - click peeking slide image → slide into centre
  carouselEl.addEventListener('click', function (e) {
    const img = e.target.closest('.product-main-img');
    if (!img) return;

    const slideEl = img.closest('.swiper-slide');
    if (!slideEl) return;

    const isActive = slideEl.classList.contains('swiper-slide-active');
    const isPrev   = slideEl.classList.contains('swiper-slide-prev');
    const isNext   = slideEl.classList.contains('swiper-slide-next');
    const learn    = slideEl.getAttribute('data-learn');

    if (isActive) {
      if (learn) window.location.href = learn;
      return;
    }

    if (isPrev) {
      swiper.slidePrev();
      return;
    }

    if (isNext) {
      swiper.slideNext();
      return;
    }
  });
});
