document.addEventListener("DOMContentLoaded", function() {
  const detailsElements = document.querySelectorAll('.faq-v2 details');

  detailsElements.forEach((targetDetail) => {
    targetDetail.addEventListener('toggle', () => {
      // If this item has just been opened...
      if (targetDetail.open) {
        // ...close all the others.
        detailsElements.forEach((otherDetail) => {
          if (otherDetail !== targetDetail) {
            otherDetail.removeAttribute('open');
          }
        });
      }
    });
  });
});