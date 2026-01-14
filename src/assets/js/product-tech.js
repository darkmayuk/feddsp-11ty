function updateTechSpec(element) {
    // 1. Trigger the "Interacted" State
    // This tells the CSS: "User has started exploring, dim the non-active items"
    const wrapper = element.closest('.tech-titles-wrapper');
    if (wrapper) {
        wrapper.classList.add('interacted');
    }

    // 2. Handle Active State (Colors)
    const allTitles = document.querySelectorAll('.tech-item-title');
    allTitles.forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    // 3. Update Text
    const textTarget = document.getElementById('tech-text-target');
    const newText = element.getAttribute('data-text');

    if (textTarget.style.opacity === '0') {
        textTarget.innerText = newText;
        textTarget.style.opacity = 1;
    } else {
        textTarget.style.opacity = 0;
        setTimeout(() => {
            textTarget.innerText = newText;
            textTarget.style.opacity = 1;
        }, 150);
    }

    // 4. Update Background Image
    const bgLayer = document.getElementById('tech-bg-layer');
    const newBg = element.getAttribute('data-bg');

    if (newBg) {
        bgLayer.style.backgroundImage = `url('${newBg}')`;
    }
}