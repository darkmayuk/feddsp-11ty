document.addEventListener("DOMContentLoaded", function () {
    
    // --- 1. USER CONFIGURATION (TWEAK THESE) ---
    const CONFIG = {
        // PERFORMANCE
        frameSkip: 2,           // 1 = 60fps (Smooth), 2 = 30fps (Efficient)
        
        // VISUALIZER "FEEL"
        smoothing: 0.2,        // 0.1 = Jittery/Fast, 0.9 = Slow/Smooth
        minHeight: 4,           // Minimum bar height in pixels (when silent)
        maxHeight: 80,          // Maximum bar height in pixels (when loud)
        
        // EQUALIZATION (The Power Curve)
        bassBoost: 0.8,         // Multiplier for low frequencies (Left side)
        trebleBoost: 5.0,       // Multiplier for high frequencies (Right side)
        curveSteepness: 2.0,    // Higher number = more bias towards treble
        usefulFreqRange: 0.8,  // 1.0 = Use all data (including empty 22kHz air)
        // 0.85 = Ignore top 15% of empty frequencies (Stretches the active sound to fit)
    };

    // --- STATE ---
    const state = {
        isPlaying: false,
        currentMix: 0, 
        loadedBuffers: {}, 
        activeSourceNodes: [],
        currentSampleName: null,
        
        // Critical for preventing double-plays
        // Every time we click play/stop, we increment this.
        // If a load finishes and the ID doesn't match, we abort.
        latestRequestId: 0, 

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

    // --- INITIALIZATION ---
    function initAudioContext() {
        if (state.ctx) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.ctx = new AudioContext();

        state.gainDry = state.ctx.createGain();
        state.gainWet = state.ctx.createGain();
        state.gainDry.gain.value = 1 - state.currentMix;
        state.gainWet.gain.value = state.currentMix;
        state.analyser = state.ctx.createAnalyser();
        
        state.analyser.fftSize = 128; 
        state.analyser.smoothingTimeConstant = CONFIG.smoothing; 

        state.gainDry.connect(state.analyser);
        state.gainWet.connect(state.analyser);
        state.analyser.connect(state.ctx.destination);

        preloadAllTracks(); // Kick off background loading
        drawVisualizer();   // Start animation loop
    }

    async function preloadAllTracks() {
        // Fire and forget - just cache them in state.loadedBuffers
        Array.from(ui.trackBtns).forEach(async (btn) => {
            const name = btn.innerText.trim();
            const dryUrl = btn.dataset.dry;
            const wetUrl = btn.dataset.wet;
            if (!dryUrl || !wetUrl || state.loadedBuffers[name]) return;

            try {
                const [dryBuf, wetBuf] = await Promise.all([
                    fetchAndDecode(dryUrl),
                    fetchAndDecode(wetUrl)
                ]);
                state.loadedBuffers[name] = { dry: dryBuf, wet: wetBuf };
            } catch (e) {
                console.warn(`Background preload failed for ${name}`, e);
            }
        });
    }

    async function fetchAndDecode(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await state.ctx.decodeAudioData(arrayBuffer);
    }

    // --- PLAYBACK ENGINE ---

    async function playSample(name) {
        // 1. Generate a new Request ID
        const requestId = ++state.latestRequestId;

        // 2. Ensure Audio Context is Ready
        if (!state.ctx) initAudioContext();
        if (state.ctx.state === 'suspended') await state.ctx.resume();

        // 3. STOP EVERYTHING IMMEDIATELY
        stopAudioSources(); 
        
        // 4. Check if we need to load (First click scenario)
        if (!state.loadedBuffers[name]) {
            const btn = Array.from(ui.trackBtns).find(b => b.innerText.trim() === name);
            if (!btn) return;

            try {
                const [dryBuf, wetBuf] = await Promise.all([
                    fetchAndDecode(btn.dataset.dry),
                    fetchAndDecode(btn.dataset.wet)
                ]);
                state.loadedBuffers[name] = { dry: dryBuf, wet: wetBuf };
            } catch (e) {
                console.error("Load failed", e);
                return;
            }
        }

        // 5. CRITICAL CHECK: Has the user clicked Stop or another track 
        // while we were waiting for the load/decode above?
        if (state.latestRequestId !== requestId) {
            // Yes, they have. Abort. Do not play.
            return; 
        }

        // 6. Play
        const buffers = state.loadedBuffers[name];
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
        // Increment request ID to invalidate any pending loads
        state.latestRequestId++; 
        
        stopAudioSources();
        state.isPlaying = false;
        updatePlayButtonUI();
    }

    function stopAudioSources() {
        state.activeSourceNodes.forEach(node => {
            try { node.stop(); } catch(e){}
            try { node.disconnect(); } catch(e){}
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
            } else if(ui.trackBtns.length > 0) {
                // If nothing selected, pick the first one
                ui.trackBtns[0].click();
            }
        }
    }

    // --- VISUALIZER ENGINE ---
    
    let frameCount = 0;
    const dataArray = new Uint8Array(64); 

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);

        frameCount++;
        if (frameCount % CONFIG.frameSkip !== 0) return;

        // CASE 1: STOPPED
        if (!state.isPlaying) {
            ui.visualizerWrapper.classList.remove('is-wet');
            ui.bars.forEach(bar => {
                bar.style.height = `${CONFIG.minHeight}px`;
                bar.style.opacity = '1'; 
                bar.style.display = ''; 
            });
            return;
        }

        // CASE 2: PLAYING
        updateVisualizerState();
        if(state.analyser) state.analyser.getByteFrequencyData(dataArray);

        ui.bars.forEach((bar, i) => {
            bar.style.display = ''; 
            bar.style.opacity = '1';

            // FIX: CROP THE DATA RANGE
            // Instead of i corresponding 1:1 to data, we stretch it.
            // When i=63 (Last bar), we only read from index ~55 (Last active sound).
            const rawIndex = Math.floor(i * CONFIG.usefulFreqRange);
            let val = dataArray[rawIndex] || 0;

            // Apply Power Curve Equalization
            const percent = i / ui.bars.length;
            const multiplier = CONFIG.bassBoost + Math.pow(percent, CONFIG.curveSteepness) * CONFIG.trebleBoost;
            
            val = val * multiplier;
            val = Math.min(255, val); 

            const targetHeight = Math.max(CONFIG.minHeight, (val / 255) * CONFIG.maxHeight); 
            bar.style.height = `${targetHeight}px`;
        });
    }

    // --- UI HELPERS ---

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

    // --- EVENTS ---

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
            setMix(0); // Reset to dry
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

    document.body.addEventListener('click', initAudioContext, { once: true });
});