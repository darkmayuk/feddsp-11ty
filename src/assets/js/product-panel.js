document.querySelectorAll('.product-panel').forEach(panel => {
  const video = panel.querySelector('video');
  panel.addEventListener('mouseenter', () => video.play());
  panel.addEventListener('mouseleave', () => video.pause());
});
