(() => {
  "use strict";

  const LOCATION = { name: "San Diego, California", lat: 32.7157, lon: -117.1611, timezone: "America/Los_Angeles" };
  const REFRESH_MS = 15 * 60 * 1000;
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d", { alpha: true });
  const intro = document.getElementById("intro");
  const startButton = document.getElementById("start");
  const pauseBtn = document.getElementById("pauseBtn");
  const conditionEl = document.getElementById("condition");
  const detailsEl = document.getElementById("details");
  const statusEl = document.getElementById("status");
  const controlsEl = document.getElementById("controls");
  const aboutButton = document.getElementById("aboutButton");
  const closeAbout = document.getElementById("closeAbout");
  const aboutPanel = document.getElementById("aboutPanel");
  const toneToggle = document.getElementById("toneToggle");


  const state = {
    running: false, paused: false, lastFrame: 0, width: 0, height: 0, dpr: 1,
    windSpeed: 9, windDirection: 285, gusts: 13, temperature: 18, isDay: false,
    targetSpeed: 0.42, speed: 0.42, particles: [], dataTime: null, source: "live",
    toneOn: false
  };

  /* ── Audio: low-pass pink noise ocean wash ── */
  const audio = { ctx: null, source: null, filter: null, gain: null, lfo: null, lfoGain: null, started: false };

  function initAudio() {
    if (audio.ctx) return;
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();

    const sr = audio.ctx.sampleRate;
    const buf = audio.ctx.createBuffer(1, sr * 4, sr);
    const d = buf.getChannelData(0);

    // Voss-McCartney pink noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }

    audio.source = audio.ctx.createBufferSource();
    audio.source.buffer = buf;
    audio.source.loop = true;

    audio.filter = audio.ctx.createBiquadFilter();
    audio.filter.type = "lowpass";
    audio.filter.frequency.value = 550;
    audio.filter.Q.value = 0.6;

    audio.gain = audio.ctx.createGain();
    audio.gain.gain.value = 0;

    // Slow LFO for wave-like swells (~11s cycle)
    audio.lfo = audio.ctx.createOscillator();
    audio.lfo.frequency.value = 0.09;
    audio.lfoGain = audio.ctx.createGain();
    audio.lfoGain.gain.value = 0.035;
    audio.lfo.connect(audio.lfoGain);
    audio.lfoGain.connect(audio.gain.gain);

    audio.source.connect(audio.filter);
    audio.filter.connect(audio.gain);
    audio.gain.connect(audio.ctx.destination);
  }

  function startAudio() {
    if (!audio.ctx) initAudio();
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    if (!audio.started) {
      audio.source.start();
      audio.lfo.start();
      audio.started = true;
    }
    audio.gain.gain.setTargetAtTime(0.07, audio.ctx.currentTime, 2);
  }

  function stopAudio() {
    if (!audio.ctx) return;
    audio.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.8);
  }

  /* ── Noise & particles ── */
  function seededNoise(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    createParticles();
  }

  function createParticles() {
    const count = Math.min(210, Math.max(105, Math.floor((state.width * state.height) / 9000)));
    state.particles = Array.from({ length: count }, (_, i) => ({
      x: seededNoise(i * 4.3) * state.width,
      y: seededNoise(i * 8.1 + 3) * state.height,
      drift: seededNoise(i * 2.7 + 8) * 1.35 + .45,
      phase: seededNoise(i * 6.5 + 1) * Math.PI * 2,
      alpha: .035 + seededNoise(i * 9.7) * .18,
      length: 18 + seededNoise(i * 3.1) * 54
    }));
  }

  /* ── Weather text ── */
  function directionWords(degrees) {
    const labels = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
    return labels[Math.round(((degrees % 360) / 45)) % 8];
  }

  function compass(degrees) {
    const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return labels[Math.round(((degrees % 360) / 45)) % 8];
  }

  function windPhrase(speed, direction) {
    const from = directionWords(direction);
    if (speed < 2) return "The air is almost still.";
    if (speed < 7) return `A light breath arrives from the ${from}.`;
    if (speed < 15) return `The air is moving from the ${from}.`;
    if (speed < 25) return `A steady wind comes from the ${from}.`;
    return `The wind is gathering from the ${from}.`;
  }

  function formatUpdated(date) {
    return new Intl.DateTimeFormat("en-US", { timeZone: LOCATION.timezone, hour: "numeric", minute: "2-digit" }).format(date);
  }

  /* ── Live weather ── */
  async function loadWeather() {
    const params = new URLSearchParams({
      latitude: LOCATION.lat,
      longitude: LOCATION.lon,
      current: "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
      wind_speed_unit: "mph",
      temperature_unit: "fahrenheit",
      timezone: LOCATION.timezone
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
      const data = await response.json();
      const current = data.current;
      if (!current) throw new Error("Weather response has no current conditions");
      state.windSpeed = Number(current.wind_speed_10m) || 0;
      state.windDirection = Number(current.wind_direction_10m) || 0;
      state.gusts = Number(current.wind_gusts_10m) || state.windSpeed;
      state.temperature = Number(current.temperature_2m) || 0;
      state.isDay = Boolean(current.is_day);
      state.targetSpeed = Math.max(.08, Math.min(1.65, state.windSpeed / 17));
      state.dataTime = new Date();
      state.source = "live";
      renderReading();
      statusEl.textContent = `Updated ${formatUpdated(state.dataTime)} · live conditions`;
    } catch (error) {
      console.warn(error);
      state.source = "ambient";
      renderReading();
      statusEl.textContent = "Present conditions unavailable · moving in ambient mode";
    }
  }

  function renderReading() {
    conditionEl.textContent = windPhrase(state.windSpeed, state.windDirection);
    const speed = Math.round(state.windSpeed);
    const gust = Math.round(state.gusts);
    const temp = Math.round(state.temperature);
    detailsEl.textContent = `${compass(state.windDirection)} · ${speed} mph${gust > speed + 3 ? ` · gusts ${gust}` : ""} · ${temp}°`;
  }

  /* ── Render loop ── */
  function draw(now) {
    requestAnimationFrame(draw);
    if (!state.running || state.paused) return;
    const delta = Math.min(40, now - state.lastFrame || 16.7);
    state.lastFrame = now;
    state.speed += (state.targetSpeed - state.speed) * .006 * delta;

    const w = state.width, h = state.height;
    ctx.clearRect(0, 0, w, h);
    const radians = (state.windDirection - 90) * Math.PI / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    const px = -dy;
    const py = dx;
    const gustPulse = .83 + Math.sin(now * .00037) * .11 + Math.sin(now * .0011) * .06;
    const motion = state.speed * gustPulse;

    const wash = ctx.createRadialGradient(w * .5, h * .53, 0, w * .5, h * .53, Math.max(w, h) * .7);
    wash.addColorStop(0, state.isDay ? "rgba(205, 182, 135, .034)" : "rgba(103, 128, 153, .034)");
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    for (const p of state.particles) {
      const sway = Math.sin(now * .00048 + p.phase + (p.x + p.y) * .008) * (4 + motion * 10);
      const lineLength = p.length * (.5 + motion * .68);
      const x2 = p.x - dx * lineLength + px * sway;
      const y2 = p.y - dy * lineLength + py * sway;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x - dx * lineLength * .46 + px * sway * .25, p.y - dy * lineLength * .46 + py * sway * .25, x2, y2);
      ctx.strokeStyle = state.isDay ? `rgba(231, 222, 203, ${p.alpha})` : `rgba(214, 224, 230, ${p.alpha})`;
      ctx.lineWidth = .45 + motion * .35;
      ctx.stroke();
      p.x += dx * motion * p.drift * delta * .022 + px * Math.sin(now * .0005 + p.phase) * .012;
      p.y += dy * motion * p.drift * delta * .022 + py * Math.cos(now * .0004 + p.phase) * .012;
      const pad = 90;
      if (p.x < -pad) p.x = w + pad;
      if (p.x > w + pad) p.x = -pad;
      if (p.y < -pad) p.y = h + pad;
      if (p.y > h + pad) p.y = -pad;
    }
  }

  /* ── Controls ── */
  let hideTimer = null;

  function showControls() {
    document.body.classList.add("controls-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      document.body.classList.remove("controls-visible");
    }, 3500);
  }

  function begin() {
    if (state.running) return;
    state.running = true;
    state.paused = false;
    state.lastFrame = performance.now();
    document.body.classList.add("running");
    document.getElementById("reading").hidden = false;
    pauseBtn.hidden = false;
    pauseBtn.textContent = "Pause";
    if (state.toneOn) startAudio();
    loadWeather();
  }

  function togglePause() {
    if (!state.running) return begin();
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    if (state.paused) {
      stopAudio();
    } else if (state.toneOn) {
      startAudio();
    }
    statusEl.textContent = state.paused ? "The field is held." : (state.dataTime ? `Updated ${formatUpdated(state.dataTime)} · live conditions` : "Listening for the wind.");
  }

  function toggleTone() {
    state.toneOn = !state.toneOn;
    toneToggle.textContent = `Ocean Tone: ${state.toneOn ? "On" : "Off"}`;
    toneToggle.setAttribute("aria-pressed", String(state.toneOn));
    if (state.toneOn) {
      if (state.running && !state.paused) startAudio();
    } else {
      stopAudio();
    }
  }

  function toggleAbout(force) {
    const open = typeof force === "boolean" ? force : aboutPanel.hidden;
    aboutPanel.hidden = !open;
    aboutButton.setAttribute("aria-expanded", String(open));
    if (open) closeAbout.focus();
    else aboutButton.focus();
  }

  /* ── Events ── */
  startButton.addEventListener("click", begin);
  pauseBtn.addEventListener("click", togglePause);
  toneToggle.addEventListener("click", toggleTone);
  aboutButton.addEventListener("click", () => toggleAbout());
  closeAbout.addEventListener("click", () => toggleAbout(false));

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      state.running ? togglePause() : begin();
    }
    if (event.key === "Escape" && !aboutPanel.hidden) toggleAbout(false);
  });

  // Reveal controls briefly on mouse/touch movement while running
  let lastMove = 0;
  window.addEventListener("mousemove", () => {
    if (state.running) {
      const now = Date.now();
      if (now - lastMove > 200) { lastMove = now; showControls(); }
    }
  });
  window.addEventListener("touchstart", () => {
    if (state.running) showControls();
  });

  /* ── Init ── */
  resize();
  renderReading();
  requestAnimationFrame(draw);
  loadWeather();
  setInterval(loadWeather, REFRESH_MS);
})();
