document.addEventListener("DOMContentLoaded", function() {
    const techItems = document.querySelectorAll('.tech-item-title');
    techItems.forEach(item => {
        const bgUrl = item.getAttribute('data-bg');
        if (bgUrl) {
            const img = new Image();
            img.src = bgUrl;
        }
    });
});

function updateTechSpec(element) {
    const wrapper = element.closest('.tech-titles-wrapper');
    if (wrapper) {
        wrapper.classList.add('interacted');
    }

    const allTitles = document.querySelectorAll('.tech-item-title');
    allTitles.forEach(el => el.classList.remove('active'));
    element.classList.add('active');

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

    const bgLayer = document.getElementById('tech-bg-layer');
    const newBg = element.getAttribute('data-bg');

    if (newBg) {
        bgLayer.style.backgroundImage = `url('${newBg}')`;
    }
}