document.addEventListener("DOMContentLoaded", function () {
  
  const playBtn = document.getElementById("audio-play-toggle");
  const playIcon = playBtn ? playBtn.querySelector("i") : null;
  const mixToggle = document.getElementById("audio-mix-toggle");
  const toggleKnob = mixToggle ? mixToggle.querySelector(".toggle-knob") : null;
  
  const trackBtns = document.querySelectorAll(".track-btn-text");
  const bars = document.querySelectorAll(".visualizer-bar");
  const visualizerWrapper = document.getElementById("visualizer-wrapper");

  let isPlaying = false;
  let isWet = false; 
  let audioContext = null;
  
  let drySource = null;
  let wetSource = null;
  let dryGain = null;
  let wetGain = null;
  let analyzer = null;
  let animationId = null;
  
  let currentDryBuffer = null;
  let currentWetBuffer = null;
  let currentLoadRequestId = 0;

  async function initAudio() {
    if (audioContext) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    
    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();
    
    analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256; 
    
    dryGain.connect(analyzer);
    wetGain.connect(analyzer);
    analyzer.connect(audioContext.destination); 

    updateMix(); 
  }

  async function loadTrack(dryUrl, wetUrl) {
    if (!dryUrl || !wetUrl) return; 

    const myRequestId = ++currentLoadRequestId;
    stopAudio(); 

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

  function updateMix() {
    if (!dryGain || !wetGain) return;
    const now = audioContext.currentTime;

    if (isWet) {
      dryGain.gain.setTargetAtTime(0, now, 0.1);
      wetGain.gain.setTargetAtTime(1, now, 0.1);
      
      if(toggleKnob) toggleKnob.style.transform = "translateX(26px)"; 
      if(visualizerWrapper) visualizerWrapper.classList.add('is-wet');

    } else {
      dryGain.gain.setTargetAtTime(1, now, 0.1);
      wetGain.gain.setTargetAtTime(0, now, 0.1);
      
      if(toggleKnob) toggleKnob.style.transform = "translateX(0px)";
      if(visualizerWrapper) visualizerWrapper.classList.remove('is-wet');
    }
  }

  function drawVisualizer() {
    animationId = requestAnimationFrame(drawVisualizer);
    if (!analyzer) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyzer.getByteFrequencyData(dataArray);

    const barCount = bars.length;
    const step = Math.ceil(bufferLength / barCount); 

    bars.forEach((bar, index) => {
      const dataIndex = Math.floor(index * step * 0.3);   
      const safeIndex = Math.min(dataIndex, bufferLength - 1);
      const value = dataArray[safeIndex] || 0; 
      const heightPercent = Math.max(2, (value / 255) * 100); 
      bar.style.height = `${heightPercent}%`;
    });
  }

  function resetBars() {
    bars.forEach(bar => bar.style.height = "1%");
  }

  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      await initAudio(); 
      
      if (!currentDryBuffer) {
        const activeBtn = document.querySelector(".track-btn-text.active");
        if (activeBtn) {
          const dry = activeBtn.dataset.dry;
          const wet = activeBtn.dataset.wet;
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

  trackBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const dry = e.target.dataset.dry;
      const wet = e.target.dataset.wet;

      if (!dry || !wet || dry === "null" || wet === "null") {
        console.warn("Track audio missing");
        return; 
      }

      trackBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");

      await initAudio();
      loadTrack(dry, wet);
    });
  });

  if (mixToggle) {
    mixToggle.addEventListener("click", () => {
      isWet = !isWet;
      updateMix();
    });
  }

});