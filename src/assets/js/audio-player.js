document.addEventListener("DOMContentLoaded", function () {
  const playBtn = document.getElementById("audio-play-toggle");
  const playIcon = playBtn.querySelector("i");
  const mixToggle = document.getElementById("audio-mix-toggle");
  const toggleKnob = mixToggle.querySelector(".toggle-knob");
  const trackBtns = document.querySelectorAll(".track-btn");
  const bars = document.querySelectorAll(".visualizer-bar");
  
  // State
  let isPlaying = false;
  let isWet = false; // false = Dry, true = Wet
  let audioContext = null;
  
  // Source Nodes (The actual audio players)
  let drySource = null;
  let wetSource = null;
  
  // Gain & Analyzer Nodes
  let dryGain = null;
  let wetGain = null;
  let analyzer = null;
  let animationId = null;
  
  // Buffers (The loaded audio data)
  let currentDryBuffer = null;
  let currentWetBuffer = null;

  // RACE CONDITION FIX: Track the latest load request
  let currentLoadRequestId = 0;

  // 1. Initialize Audio Context (must happen on user interaction)
  async function initAudio() {
    if (audioContext) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    
    // Create Gain Nodes (Volume controls)
    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();
    
    // Create Analyzer (Visualizer)
    analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 64; 
    
    // Connect Gains to Analyzer, then Analyzer to Speakers
    dryGain.connect(analyzer);
    wetGain.connect(analyzer);
    analyzer.connect(audioContext.destination); 

    // Set initial volumes
    updateMix();
  }

  // 2. Load Audio Files with Guard Clause
  async function loadTrack(dryUrl, wetUrl) {
    // Increment ID: This is now the ONLY valid request. 
    // Any previous requests still loading are now considered "stale".
    const myRequestId = ++currentLoadRequestId;

    // Stop whatever is currently making noise
    stopAudio();

    try {
      // Fetch both files in parallel
      const [dryRes, wetRes] = await Promise.all([
        fetch(dryUrl),
        fetch(wetUrl)
      ]);

      const dryArray = await dryRes.arrayBuffer();
      const wetArray = await wetRes.arrayBuffer();

      // Guard Clause: Before we do the heavy decoding, check if user clicked something else
      if (myRequestId !== currentLoadRequestId) return;

      // Decode audio data
      const decodedDry = await audioContext.decodeAudioData(dryArray);
      const decodedWet = await audioContext.decodeAudioData(wetArray);

      // Guard Clause 2: Check again after decoding (decoding takes time)
      if (myRequestId !== currentLoadRequestId) return;

      // Success! Update the buffers
      currentDryBuffer = decodedDry;
      currentWetBuffer = decodedWet;

      // Auto-play the new track (standard behavior for sample switchers)
      playAudio();
      
    } catch (err) {
      // Only log errors if this is still the active request
      if (myRequestId === currentLoadRequestId) {
        console.error("Error loading audio:", err);
      }
    }
  }

  // 3. Play Logic
  function playAudio() {
    // Safety check
    if (!currentDryBuffer || !currentWetBuffer) return;

    // Double check we stopped everything before creating new sources
    stopAudioSourceNodes();

    // Create Buffer Sources (these are one-time use)
    drySource = audioContext.createBufferSource();
    drySource.buffer = currentDryBuffer;
    drySource.connect(dryGain);
    drySource.loop = true;

    wetSource = audioContext.createBufferSource();
    wetSource.buffer = currentWetBuffer;
    wetSource.connect(wetGain);
    wetSource.loop = true;

    // Start them exactly together
    const startTime = audioContext.currentTime + 0.05; // tiny buffer
    drySource.start(startTime);
    wetSource.start(startTime);

    isPlaying = true;
    playIcon.classList.remove("bi-play-fill");
    playIcon.classList.add("bi-pause-fill");
    
    // Start Visualizer Loop if not already running
    if (!animationId) drawVisualizer();
  }

  function stopAudio() {
    stopAudioSourceNodes();
    isPlaying = false;
    playIcon.classList.remove("bi-pause-fill");
    playIcon.classList.add("bi-play-fill");
    
    // Stop Visualizer
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    resetBars();
  }

  // Helper to strictly kill the source nodes
  function stopAudioSourceNodes() {
    if (drySource) {
      try { drySource.stop(); } catch(e) {} // Ignore errors if already stopped
      drySource.disconnect();
      drySource = null;
    }
    if (wetSource) {
      try { wetSource.stop(); } catch(e) {}
      wetSource.disconnect();
      wetSource = null;
    }
  }

  // 4. A/B Mixing Logic
  function updateMix() {
    if (!dryGain || !wetGain) return;
    const now = audioContext.currentTime;
    
    if (isWet) {
      // Wet Mode
      dryGain.gain.setTargetAtTime(0, now, 0.1);
      wetGain.gain.setTargetAtTime(1, now, 0.1);
      toggleKnob.style.left = "26px"; 
      mixToggle.querySelector(".label-dry").style.opacity = "0.5";
      mixToggle.querySelector(".label-wet").style.opacity = "1";
    } else {
      // Dry Mode
      dryGain.gain.setTargetAtTime(1, now, 0.1);
      wetGain.gain.setTargetAtTime(0, now, 0.1);
      toggleKnob.style.left = "4px";
      mixToggle.querySelector(".label-dry").style.opacity = "1";
      mixToggle.querySelector(".label-wet").style.opacity = "0.5";
    }
  }

  // 5. Visualizer Logic
  function drawVisualizer() {
    animationId = requestAnimationFrame(drawVisualizer);
    
    if (!analyzer) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyzer.getByteFrequencyData(dataArray);

    bars.forEach((bar, index) => {
      const value = dataArray[index] || 0; 
      // Convert 0-255 to percentage height (min 10%)
      const heightPercent = Math.max(10, (value / 255) * 100);
      bar.style.height = `${heightPercent}%`;
    });
  }

  function resetBars() {
    bars.forEach(bar => bar.style.height = "10%"); // Reset to min height
  }

  // --- EVENT LISTENERS ---

  // Play Button
  playBtn.addEventListener("click", async () => {
    await initAudio(); 
    
    // If no buffer loaded yet, load the active track
    if (!currentDryBuffer) {
      const activeBtn = document.querySelector(".track-btn.active");
      if (activeBtn) {
        // This will load AND play
        await loadTrack(activeBtn.dataset.dry, activeBtn.dataset.wet);
        return; 
      }
    }

    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  });

  // Track Buttons
  trackBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      // Avoid reloading if clicking the same active track? 
      // Optionally uncomment next line:
      // if (btn.classList.contains('active') && isPlaying) return;

      // UI Update
      trackBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");

      await initAudio();

      const dry = e.target.dataset.dry;
      const wet = e.target.dataset.wet;
      
      // Load and auto-play
      loadTrack(dry, wet);
    });
  });

  // Toggle Switch
  mixToggle.addEventListener("click", () => {
    isWet = !isWet;
    updateMix();
  });

});