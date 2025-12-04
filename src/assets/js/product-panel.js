document.querySelectorAll('.product-panel-wrapper').forEach(wrapper => {
  const video = wrapper.querySelector('video');
  if (!video) return;

  wrapper.addEventListener('mouseenter', () => video.play());
  wrapper.addEventListener('mouseleave', () => video.pause());
});
