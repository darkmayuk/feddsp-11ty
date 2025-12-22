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
  let drySource = null;
  let wetSource = null;
  let dryGain = null;
  let wetGain = null;
  let analyzer = null;
  let animationId = null;
  
  // Buffers to store loaded audio data
  let currentDryBuffer = null;
  let currentWetBuffer = null;

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
    analyzer.fftSize = 64; // Low number for chunkier bars (we have 20 bars)
    
    // Connect Gains to Analyzer, then Analyzer to Speakers
    dryGain.connect(analyzer);
    wetGain.connect(analyzer);
    analyzer.connect(audioContext.destination); // Output to speakers

    // Set initial volumes
    updateMix();
  }

  // 2. Load Audio Files
  async function loadTrack(dryUrl, wetUrl) {
    // Stop current if playing
    if (isPlaying) stopAudio();

    try {
      // Fetch both files in parallel
      const [dryRes, wetRes] = await Promise.all([
        fetch(dryUrl),
        fetch(wetUrl)
      ]);

      const dryArray = await dryRes.arrayBuffer();
      const wetArray = await wetRes.arrayBuffer();

      // Decode audio data
      currentDryBuffer = await audioContext.decodeAudioData(dryArray);
      currentWetBuffer = await audioContext.decodeAudioData(wetArray);

      // If we were playing, restart immediately
      if (isPlaying) playAudio();
      
    } catch (err) {
      console.error("Error loading audio:", err);
    }
  }

  // 3. Play Logic
  function playAudio() {
    if (!currentDryBuffer || !currentWetBuffer) return;

    // Create Buffer Sources (these are one-time use fire-and-forget)
    drySource = audioContext.createBufferSource();
    drySource.buffer = currentDryBuffer;
    drySource.connect(dryGain);
    drySource.loop = true;

    wetSource = audioContext.createBufferSource();
    wetSource.buffer = currentWetBuffer;
    wetSource.connect(wetGain);
    wetSource.loop = true;

    // Start them exactly together
    const startTime = audioContext.currentTime + 0.1; // tiny buffer
    drySource.start(startTime);
    wetSource.start(startTime);

    isPlaying = true;
    playIcon.classList.remove("bi-play-fill");
    playIcon.classList.add("bi-pause-fill");
    
    // Start Visualizer Loop
    drawVisualizer();
  }

  function stopAudio() {
    if (drySource) drySource.stop();
    if (wetSource) wetSource.stop();
    isPlaying = false;
    playIcon.classList.remove("bi-pause-fill");
    playIcon.classList.add("bi-play-fill");
    cancelAnimationFrame(animationId);
    resetBars();
  }

  // 4. A/B Mixing Logic
  function updateMix() {
    if (!dryGain || !wetGain) return;
    
    if (isWet) {
      // Wet Mode
      dryGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
      wetGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.1);
      toggleKnob.style.left = "26px"; // Move knob right
      mixToggle.querySelector(".label-dry").style.opacity = "0.5";
      mixToggle.querySelector(".label-wet").style.opacity = "1";
    } else {
      // Dry Mode
      dryGain.gain.setTargetAtTime(1, audioContext.currentTime, 0.1);
      wetGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
      toggleKnob.style.left = "4px"; // Move knob left
      mixToggle.querySelector(".label-dry").style.opacity = "1";
      mixToggle.querySelector(".label-wet").style.opacity = "0.5";
    }
  }

  // 5. Visualizer Logic
  function drawVisualizer() {
    animationId = requestAnimationFrame(drawVisualizer);
    
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyzer.getByteFrequencyData(dataArray);

    // Update bar heights based on frequency data
    // We have 20 bars, dataArray has 32 bins (fftSize/2). We step through them.
    bars.forEach((bar, index) => {
      // Simple mapping: use the first 20 bins
      const value = dataArray[index]; 
      // Convert 0-255 to percentage height (min 10% so it doesn't disappear)
      const heightPercent = Math.max(10, (value / 255) * 100);
      bar.style.height = `${heightPercent}%`;
    });
  }

  function resetBars() {
    bars.forEach(bar => bar.style.height = "5%");
  }

  // --- EVENT LISTENERS ---

  // Play Button
  playBtn.addEventListener("click", async () => {
    await initAudio(); // First interaction unlocks AudioContext
    
    // If no buffer loaded yet, load the active track
    if (!currentDryBuffer) {
      const activeBtn = document.querySelector(".track-btn.active");
      await loadTrack(activeBtn.dataset.dry, activeBtn.dataset.wet);
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
      // UI Update
      trackBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");

      // Initialize if needed
      await initAudio();

      // Load new audio
      const dry = e.target.dataset.dry;
      const wet = e.target.dataset.wet;
      await loadTrack(dry, wet); // This handles stopping/restarting automatically
    });
  });

  // Toggle Switch
  mixToggle.addEventListener("click", () => {
    isWet = !isWet;
    updateMix();
  });

});