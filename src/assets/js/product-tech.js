document.addEventListener("DOMContentLoaded", function() {
    // Keep the preloader - it helps speed things up in the background
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
    // 1. Text & UI Updates (Immediate)
    const wrapper = element.closest('.tech-titles-wrapper');
    if (wrapper) wrapper.classList.add('interacted');

    const allTitles = document.querySelectorAll('.tech-item-title');
    allTitles.forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const textTarget = document.getElementById('tech-text-target');
    const newText = element.getAttribute('data-text');

    // Text Fade Logic
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

    // 2. Background Cross-Fade Logic (The Glitch Fix)
    const bg1 = document.getElementById('tech-bg-1');
    const bg2 = document.getElementById('tech-bg-2');
    const newBgUrl = element.getAttribute('data-bg');

    if (!newBgUrl) return;

    // Identify which layer is visible, and which is hidden
    const activeLayer = bg1.classList.contains('active') ? bg1 : bg2;
    const nextLayer = activeLayer === bg1 ? bg2 : bg1;

    // Optimization: If the next layer already has this image, just swap
    if (nextLayer.style.backgroundImage.includes(newBgUrl)) {
        nextLayer.classList.add('active');
        activeLayer.classList.remove('active');
        return;
    }

    // CRITICAL FIX: Load image in memory first
    const imgLoader = new Image();
    imgLoader.src = newBgUrl;

    imgLoader.onload = function() {
        // Only swap AFTER the image is fully loaded
        nextLayer.style.backgroundImage = `url('${newBgUrl}')`;
        
        nextLayer.classList.add('active');
        activeLayer.classList.remove('active');
    };
}