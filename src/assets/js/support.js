document.addEventListener('DOMContentLoaded', function () {
  const searchInput = document.getElementById('faqSearch');
  const faqContainer = document.getElementById('faqContainer');
  const faqItems = document.querySelectorAll('.faq-item');
  const categories = document.querySelectorAll('.faq-category');
  const noResults = document.getElementById('noResults');

  searchInput.addEventListener('keyup', function (e) {
    const term = e.target.value.toLowerCase();
    let hasVisibleItems = false;

    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question').textContent.toLowerCase();
      const answer = item.querySelector('.faq-answer').textContent.toLowerCase();

      if (question.includes(term) || answer.includes(term)) {
        item.style.display = 'block';
        // Open the details if searching so user sees the answer
        if (term.length > 2) {
          item.setAttribute('open', '');
        }
        hasVisibleItems = true;
      } else {
        item.style.display = 'none';
        item.removeAttribute('open');
      }
    });

    // Hide empty categories
    categories.forEach(cat => {
      const visibleChildren = cat.querySelectorAll('.faq-item[style="display: block;"]');
      // If we are searching, we base visibility on block display. 
      // If search is empty, everything is block by default.
      const allChildren = cat.querySelectorAll('.faq-item');

      // Count how many are NOT hidden
      let visibleCount = 0;
      allChildren.forEach(child => {
        if (child.style.display !== 'none') visibleCount++;
      });

      if (visibleCount === 0) {
        cat.style.display = 'none';
      } else {
        cat.style.display = 'block';
      }
    });

    // Show/Hide "No Results"
    if (!hasVisibleItems && term.length > 0) {
      noResults.classList.remove('d-none');
    } else {
      noResults.classList.add('d-none');
    }
  });
});