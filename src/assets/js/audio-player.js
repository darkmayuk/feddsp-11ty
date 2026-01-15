document.addEventListener("DOMContentLoaded", function () {
    
    // --- CONFIGURATION ---
    const CONFIG = {
        gravity: 0.6,      
        frameSkip: 2,      // 2 = 30fps
    };

    // --- STATE ---
    const state = {
        isPlaying: false,
        currentMix: 0, 
        loadedBuffers: {}, 
        activeSourceNodes: [],
        currentSampleName: null,
        ctx: null,
        analyser: null,
        gainDry: null,
        gainWet: null,
    };

    // --- DOM ELEMENTS ---
    const ui = {
        playBtn: document.getElementById("audio-play-toggle"),
        playIcon: document.getElementById("audio-play-toggle")?.querySelector("i"),
        mixToggle: document.getElementById("audio-mix-toggle"),
        toggleKnob: document.querySelector(".toggle-knob"),
        visualizerWrapper: document.getElementById("visualizer-wrapper"),
        bars: document.querySelectorAll(".visualizer-bar"),
        trackBtns: document.querySelectorAll(".track-btn-text"),
    };

    // --- 1. INITIALIZATION ---
    function initAudioContext() {
        if (state.ctx) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.ctx = new AudioContext();

        state.gainDry = state.ctx.createGain();
        state.gainWet = state.ctx.createGain();
        state.analyser = state.ctx.createAnalyser();
        
        state.analyser.fftSize = 128; 
        state.analyser.smoothingTimeConstant = 0.35; 

        state.gainDry.connect(state.analyser);
        state.gainWet.connect(state.analyser);
        state.analyser.connect(state.ctx.destination);

        // Start preloading in the background
        preloadAllTracks();
        
        // Start the visualizer loop
        drawVisualizer();
    }

    async function preloadAllTracks() {
        // Map over buttons to fire off all requests
        const promises = Array.from(ui.trackBtns).map(async (btn) => {
            const name = btn.innerText.trim();
            const dryUrl = btn.dataset.dry;
            const wetUrl = btn.dataset.wet;
            if (!dryUrl || !wetUrl) return;
            
            // If already loaded, skip
            if (state.loadedBuffers[name]) return;

            try {
                const [dryBuf, wetBuf] = await Promise.all([
                    fetchAndDecode(dryUrl),
                    fetchAndDecode(wetUrl)
                ]);
                state.loadedBuffers[name] = { dry: dryBuf, wet: wetBuf };
            } catch (e) {
                console.warn(`Failed to preload ${name}`, e);
            }
        });
        await Promise.all(promises);
    }

    async function fetchAndDecode(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await state.ctx.decodeAudioData(arrayBuffer);
    }

    // --- 2. PLAYBACK CONTROL ---

    async function playSample(name) {
        if (!state.ctx) initAudioContext();
        if (state.ctx.state === 'suspended') state.ctx.resume();

        stopAudioSources();

        // FIX: If buffers aren't ready (First Click), load them NOW.
        if (!state.loadedBuffers[name]) {
            // Find the button to get URLs
            const btn = Array.from(ui.trackBtns).find(b => b.innerText.trim() === name);
            if (btn) {
                const dryUrl = btn.dataset.dry;
                const wetUrl = btn.dataset.wet;
                try {
                    const [dryBuf, wetBuf] = await Promise.all([
                        fetchAndDecode(dryUrl),
                        fetchAndDecode(wetUrl)
                    ]);
                    state.loadedBuffers[name] = { dry: dryBuf, wet: wetBuf };
                } catch (e) {
                    console.error("Playback failed load:", e);
                    return;
                }
            }
        }

        const buffers = state.loadedBuffers[name];
        if (!buffers) return; 

        const sourceDry = state.ctx.createBufferSource();
        const sourceWet = state.ctx.createBufferSource();

        sourceDry.buffer = buffers.dry;
        sourceWet.buffer = buffers.wet;

        sourceDry.loop = true;
        sourceWet.loop = true;

        sourceDry.connect(state.gainDry);
        sourceWet.connect(state.gainWet);

        sourceDry.start(0);
        sourceWet.start(0);

        state.activeSourceNodes = [sourceDry, sourceWet];
        state.isPlaying = true;
        state.currentSampleName = name;
        
        updatePlayButtonUI();
    }

    function stopAudio() {
        stopAudioSources();
        state.isPlaying = false;
        updatePlayButtonUI();
    }

    function stopAudioSources() {
        state.activeSourceNodes.forEach(node => {
            try { node.stop(); } catch(e){}
        });
        state.activeSourceNodes = [];
    }

    function togglePlay() {
        if (state.isPlaying) {
            stopAudio();
        } else {
            const activeBtn = document.querySelector(".track-btn-text.active");
            if (activeBtn) {
                playSample(activeBtn.innerText.trim());
            } else {
                if(ui.trackBtns.length > 0) ui.trackBtns[0].click();
            }
        }
    }

    function updatePlayButtonUI() {
        if (!ui.playIcon) return;
        if (state.isPlaying) {
            ui.playIcon.classList.remove("bi-play-fill");
            ui.playIcon.classList.add("bi-pause-fill");
        } else {
            ui.playIcon.classList.add("bi-play-fill");
            ui.playIcon.classList.remove("bi-pause-fill");
        }
    }

    // --- 3. MIX CONTROL ---

    function setMix(value) { // 0 = DRY, 1 = WET
        state.currentMix = value;
        const isWet = value === 1;

        if (state.ctx) {
            const t = state.ctx.currentTime;
            state.gainDry.gain.setTargetAtTime(1 - value, t, 0.1);
            state.gainWet.gain.setTargetAtTime(value, t, 0.1);
        }

        if (ui.toggleKnob) {
            ui.toggleKnob.style.transform = isWet ? "translateX(26px)" : "translateX(0px)";
        }
        
        updateVisualizerState();
    }

    function updateVisualizerState() {
        if (state.isPlaying && state.currentMix === 1) {
            ui.visualizerWrapper.classList.add('is-wet');
        } else {
            ui.visualizerWrapper.classList.remove('is-wet');
        }
    }

    // --- 4. VISUALIZER LOOP ---
    
    let frameCount = 0;
    const dataArray = new Uint8Array(64); 

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);

        frameCount++;
        if (frameCount % CONFIG.frameSkip !== 0) return;

        // CASE 1: STOPPED STATE
        if (!state.isPlaying) {
            ui.visualizerWrapper.classList.remove('is-wet');
            
            ui.bars.forEach((bar, i) => {
                if (i >= 30 && i <= 32) {
                    bar.style.height = '10px'; 
                    bar.style.opacity = '1'; 
                    bar.style.display = 'block'; 
                } else {
                    bar.style.height = '4px';
                    bar.style.opacity = '0';
                    bar.style.display = ''; 
                }
            });
            return;
        }

        // CASE 2: PLAYING STATE
        updateVisualizerState();
        if(state.analyser) state.analyser.getByteFrequencyData(dataArray);

        ui.bars.forEach((bar, i) => {
            bar.style.display = ''; 
            bar.style.opacity = '1';

            let val = dataArray[i] || 0;

            // POWER CURVE EQUALIZATION
            const percent = i / ui.bars.length;
            const multiplier = 0.5 + Math.pow(percent, 2) * 5.0;
            
            val = val * multiplier;
            val = Math.min(255, val);

            const targetHeight = Math.max(4, (val / 255) * 80); 
            bar.style.height = `${targetHeight}px`;
        });
    }

    // --- EVENT LISTENERS ---

    if (ui.playBtn) {
        ui.playBtn.addEventListener("click", () => {
            if (!state.ctx) initAudioContext();
            togglePlay();
        });
    }

    ui.trackBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            ui.trackBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");

            // Reset to DRY on change
            setMix(0);

            playSample(e.target.innerText.trim());
        });
    });

    if (ui.mixToggle) {
        ui.mixToggle.addEventListener("click", () => {
            if (!state.ctx) initAudioContext();
            const target = state.currentMix === 0 ? 1 : 0;
            setMix(target);
        });
    }

    // Optional: Pre-init on first document interaction to speed things up
    document.body.addEventListener('click', initAudioContext, { once: true });
});