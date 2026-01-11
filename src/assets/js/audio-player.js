document.addEventListener("DOMContentLoaded", function () {
  
  // --- 1. SELECTORS ---
  const playBtn = document.getElementById("audio-play-toggle");
  const playIcon = playBtn ? playBtn.querySelector("i") : null;
  
  const mixToggle = document.getElementById("audio-mix-toggle");
  const toggleKnob = mixToggle ? mixToggle.querySelector(".toggle-knob") : null;
  const toggleWrapper = mixToggle ? mixToggle.querySelector(".toggle-ui-wrapper") : null;
  
  const trackBtns = document.querySelectorAll(".track-btn-text"); // UPDATED CLASS
  const bars = document.querySelectorAll(".visualizer-bar");
  const visualizerWrapper = document.getElementById("visualizer-wrapper"); // UPDATED ID

  // --- 2. STATE ---
  let isPlaying = false;
  let isWet = false; // false = Dry, true = Wet
  let audioContext = null;
  
  // Source Nodes
  let drySource = null;
  let wetSource = null;
  
  // Gain & Analyzer
  let dryGain = null;
  let wetGain = null;
  let analyzer = null;
  let animationId = null;
  
  // Buffers
  let currentDryBuffer = null;
  let currentWetBuffer = null;

  // Race Condition Fix
  let currentLoadRequestId = 0;

  // --- 3. INITIALIZATION ---
  async function initAudio() {
    if (audioContext) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    
    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();
    
    analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 64; // Keep it chunky for that retro look
    
    dryGain.connect(analyzer);
    wetGain.connect(analyzer);
    analyzer.connect(audioContext.destination); 

    updateMix(); // Apply initial volume states
  }

  // --- 4. LOAD LOGIC ---
  async function loadTrack(dryUrl, wetUrl) {
    if (!dryUrl || !wetUrl) return; // Guard against empty tracks

    const myRequestId = ++currentLoadRequestId;
    stopAudio(); // Stop current playback

    // UI Feedback: Show loading state (optional, can add spinner here)
    
    try {
      const [dryRes, wetRes] = await Promise.all([
        fetch(dryUrl),
        fetch(wetUrl)
      ]);

      const dryArray = await dryRes.arrayBuffer();
      const wetArray = await wetRes.arrayBuffer();

      if (myRequestId !== currentLoadRequestId) return;

      const decodedDry = await audioContext.decodeAudioData(dryArray);
      const decodedWet = await audioContext.decodeAudioData(wetArray);

      if (myRequestId !== currentLoadRequestId) return;

      currentDryBuffer = decodedDry;
      currentWetBuffer = decodedWet;

      playAudio();
      
    } catch (err) {
      if (myRequestId === currentLoadRequestId) {
        console.error("Error loading audio:", err);
      }
    }
  }

  // --- 5. PLAYBACK LOGIC ---
  function playAudio() {
    if (!currentDryBuffer || !currentWetBuffer) return;

    stopAudioSourceNodes();

    drySource = audioContext.createBufferSource();
    drySource.buffer = currentDryBuffer;
    drySource.connect(dryGain);
    drySource.loop = true;

    wetSource = audioContext.createBufferSource();
    wetSource.buffer = currentWetBuffer;
    wetSource.connect(wetGain);
    wetSource.loop = true;

    const startTime = audioContext.currentTime + 0.05;
    drySource.start(startTime);
    wetSource.start(startTime);

    isPlaying = true;
    if (playIcon) {
      playIcon.classList.remove("bi-play-fill");
      playIcon.classList.add("bi-pause-fill");
    }
    
    if (!animationId) drawVisualizer();
  }

  function stopAudio() {
    stopAudioSourceNodes();
    isPlaying = false;
    
    if (playIcon) {
      playIcon.classList.remove("bi-pause-fill");
      playIcon.classList.add("bi-play-fill");
    }
    
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    resetBars();
  }

  function stopAudioSourceNodes() {
    if (drySource) {
      try { drySource.stop(); } catch(e) {}
      drySource.disconnect();
      drySource = null;
    }
    if (wetSource) {
      try { wetSource.stop(); } catch(e) {}
      wetSource.disconnect();
      wetSource = null;
    }
  }

  // --- 6. MIXING & UI LOGIC ---
  function updateMix() {
    if (!dryGain || !wetGain) return;
    const now = audioContext.currentTime;
    
    const dryLabel = mixToggle.querySelector(".label-dry");
    const wetLabel = mixToggle.querySelector(".label-wet");

    if (isWet) {
      // WET MODE
      dryGain.gain.setTargetAtTime(0, now, 0.1);
      wetGain.gain.setTargetAtTime(1, now, 0.1);
      
      // UI Updates
      if(toggleKnob) toggleKnob.style.transform = "translateX(26px)"; // Moved further for bigger switch
      if(toggleWrapper) toggleWrapper.style.background = "var(--brand-pink)";
      
      if(dryLabel) dryLabel.classList.add('text-black-50');
      if(wetLabel) {
        wetLabel.classList.remove('text-black-50');
        wetLabel.style.color = "var(--brand-pink)";
      }

      // Turn ON Rainbow Visualizer
      if(visualizerWrapper) visualizerWrapper.classList.add('is-wet');

    } else {
      // DRY MODE
      dryGain.gain.setTargetAtTime(1, now, 0.1);
      wetGain.gain.setTargetAtTime(0, now, 0.1);
      
      // UI Updates
      if(toggleKnob) toggleKnob.style.transform = "translateX(0px)";
      if(toggleWrapper) toggleWrapper.style.background = "black";
      
      if(dryLabel) dryLabel.classList.remove('text-black-50');
      if(wetLabel) {
        wetLabel.classList.add('text-black-50');
        wetLabel.style.color = ""; // Reset
      }

      // Turn OFF Rainbow Visualizer
      if(visualizerWrapper) visualizerWrapper.classList.remove('is-wet');
    }
  }

  // --- 7. VISUALIZER ---
  function drawVisualizer() {
    animationId = requestAnimationFrame(drawVisualizer);
    if (!analyzer) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyzer.getByteFrequencyData(dataArray);

    bars.forEach((bar, index) => {
      // Map the 32 frequency bins to our ~35 bars
      // We wrap around the data if we have more bars than bins
      const value = dataArray[index % bufferLength] || 0; 
      const heightPercent = Math.max(10, (value / 255) * 100);
      bar.style.height = `${heightPercent}%`;
    });
  }

  function resetBars() {
    bars.forEach(bar => bar.style.height = "10%");
  }

  // --- 8. EVENT LISTENERS ---

  // Play Button
  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      await initAudio(); 
      
      if (!currentDryBuffer) {
        // Find the active button to load initially
        const activeBtn = document.querySelector(".track-btn-text.active");
        if (activeBtn) {
          const dry = activeBtn.dataset.dry;
          const wet = activeBtn.dataset.wet;
          // Guard against null tracks
          if(dry && wet) {
             await loadTrack(dry, wet);
          }
          return; 
        }
      }

      if (isPlaying) {
        stopAudio();
      } else {
        playAudio();
      }
    });
  }

  // Track Buttons
  trackBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const dry = e.target.dataset.dry;
      const wet = e.target.dataset.wet;

      // 1. Guard against empty/null tracks
      if (!dry || !wet || dry === "null" || wet === "null") {
        console.warn("Track audio missing");
        return; 
      }

      // 2. UI Update
      trackBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");

      // 3. Init & Load
      await initAudio();
      loadTrack(dry, wet);
    });
  });

  // Toggle Switch
  if (mixToggle) {
    mixToggle.addEventListener("click", () => {
      isWet = !isWet;
      updateMix();
    });
  }

});