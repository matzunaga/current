(() => {
  "use strict";

  const CITIES = {
    "san-diego": {
      name: "San Diego, California",
      shortName: "San Diego",
      lat: 32.7157,
      lon: -117.1611,
      timezone: "America/Los_Angeles"
    },
    "los-angeles": {
      name: "Los Angeles, California",
      shortName: "Los Angeles",
      lat: 34.0522,
      lon: -118.2437,
      timezone: "America/Los_Angeles"
    },
    "san-francisco": {
      name: "San Francisco, California",
      shortName: "San Francisco",
      lat: 37.7749,
      lon: -122.4194,
      timezone: "America/Los_Angeles"
    },
    "new-york": {
      name: "New York, New York",
      shortName: "New York",
      lat: 40.7128,
      lon: -74.006,
      timezone: "America/New_York"
    },
    "mexico-city": {
      name: "Mexico City, Mexico",
      shortName: "Mexico City",
      lat: 19.4326,
      lon: -99.1332,
      timezone: "America/Mexico_City"
    },
    london: {
      name: "London, United Kingdom",
      shortName: "London",
      lat: 51.5072,
      lon: -0.1276,
      timezone: "Europe/London"
    },
    tokyo: {
      name: "Tokyo, Japan",
      shortName: "Tokyo",
      lat: 35.6762,
      lon: 139.6503,
      timezone: "Asia/Tokyo"
    }
  };

  const DEFAULT_CITY_ID = "san-diego";
  const STORAGE_KEY = "current-city";
  const REFRESH_MS = 15 * 60 * 1000;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d", { alpha: true });

  const intro = document.getElementById("intro");
  const reading = document.getElementById("reading");
  const startButton = document.getElementById("start");
  const pauseBtn = document.getElementById("pauseBtn");
  const conditionEl = document.getElementById("condition");
  const detailsEl = document.getElementById("details");
  const statusEl = document.getElementById("status");

  const aboutButton = document.getElementById("aboutButton");
  const closeAbout = document.getElementById("closeAbout");
  const aboutPanel = document.getElementById("aboutPanel");

  const toneToggle = document.getElementById("toneToggle");

  const mark = document.getElementById("mark");
  const markCard = document.getElementById("markCard");

  const placeEl = document.getElementById("place");
  const locationButton = document.getElementById("locationButton");
  const locationPanel = document.getElementById("locationPanel");
  const closeLocation = document.getElementById("closeLocation");
  const cityList = document.getElementById("cityList");
  const pageDescription = document.getElementById("pageDescription");

  // storage can be blocked in private windows; the saved city is only a convenience
  let savedCityId = null;
  try {
    savedCityId = localStorage.getItem(STORAGE_KEY);
  } catch (error) {}
  const initialCityId = CITIES[savedCityId] ? savedCityId : DEFAULT_CITY_ID;

  const state = {
    cityId: initialCityId,
    city: CITIES[initialCityId],
    running: false,
    paused: false,
    lastFrame: 0,
    width: 0,
    height: 0,
    dpr: 1,
    windSpeed: 9,
    windDirection: 285,
    gusts: 13,
    temperature: 18,
    isDay: false,
    targetSpeed: 0.42,
    speed: 0.42,
    particles: [],
    dataTime: null,
    lastFetch: 0,
    toneOn: false
  };

  const audio = {
    ctx: null,
    source: null,
    filter: null,
    gain: null,
    lfo: null,
    lfoGain: null,
    started: false
  };

  function initAudio() {
    if (audio.ctx) return;

    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();

    const sampleRate = audio.ctx.sampleRate;
    const buffer = audio.ctx.createBuffer(1, sampleRate * 4, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;

      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;

      data[i] =
        (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;

      b6 = white * 0.115926;
    }

    audio.source = audio.ctx.createBufferSource();
    audio.source.buffer = buffer;
    audio.source.loop = true;

    audio.filter = audio.ctx.createBiquadFilter();
    audio.filter.type = "lowpass";
    audio.filter.frequency.value = 550;
    audio.filter.Q.value = 0.6;

    audio.gain = audio.ctx.createGain();
    audio.gain.gain.value = 0;

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

    if (audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }

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
    const count = Math.min(
      210,
      Math.max(105, Math.floor((state.width * state.height) / 9000))
    );

    state.particles = Array.from({ length: count }, (_, index) => ({
      x: seededNoise(index * 4.3) * state.width,
      y: seededNoise(index * 8.1 + 3) * state.height,
      drift: seededNoise(index * 2.7 + 8) * 1.35 + 0.45,
      phase: seededNoise(index * 6.5 + 1) * Math.PI * 2,
      alpha: 0.035 + seededNoise(index * 9.7) * 0.18,
      length: 18 + seededNoise(index * 3.1) * 54
    }));
  }

  function directionWords(degrees) {
    const labels = [
      "north",
      "northeast",
      "east",
      "southeast",
      "south",
      "southwest",
      "west",
      "northwest"
    ];

    return labels[Math.round((degrees % 360) / 45) % 8];
  }

  function compass(degrees) {
    const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return labels[Math.round((degrees % 360) / 45) % 8];
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
    return new Intl.DateTimeFormat("en-US", {
      timeZone: state.city.timezone,
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function renderReading() {
    conditionEl.textContent = windPhrase(
      state.windSpeed,
      state.windDirection
    );

    const speed = Math.round(state.windSpeed);
    const gust = Math.round(state.gusts);
    const temperature = Math.round(state.temperature);

    detailsEl.textContent =
      `${compass(state.windDirection)} · ${speed} mph` +
      `${gust > speed + 3 ? ` · gusts ${gust}` : ""}` +
      ` · ${temperature}°`;
  }

  function clearReading() {
    conditionEl.textContent = "The air is moving.";
    detailsEl.textContent = "";
  }

  function updateLocationUI() {
    const { city } = state;

    placeEl.textContent = city.name;
    locationButton.textContent = `Place: ${city.shortName}`;
    document.title = `Current — ${city.shortName}`;

    if (pageDescription) {
      pageDescription.setAttribute(
        "content",
        `Current — a living field shaped by the wind in ${city.name}.`
      );
    }

    cityList.querySelectorAll(".city-option").forEach((button) => {
      const isSelected = button.dataset.city === state.cityId;
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function toggleLocation(force) {
    const open = typeof force === "boolean" ? force : locationPanel.hidden;

    locationPanel.hidden = !open;
    locationButton.setAttribute("aria-expanded", String(open));

    if (open) {
      closeLocation.focus();
    } else {
      locationButton.focus();
    }
  }

  function selectCity(cityId) {
    if (!CITIES[cityId] || cityId === state.cityId) {
      toggleLocation(false);
      return;
    }

    state.cityId = cityId;
    state.city = CITIES[cityId];
    state.dataTime = null;
    conditionEl.textContent = "Listening for the wind.";
    detailsEl.textContent = "";

    try {
      localStorage.setItem(STORAGE_KEY, cityId);
    } catch (error) {}

    updateLocationUI();
    toggleLocation(false);

    statusEl.textContent = `Listening for the wind in ${state.city.shortName}.`;
    loadWeather();
  }

  async function loadWeather() {
    const cityAtRequest = state.city;
    state.lastFetch = Date.now();

    const params = new URLSearchParams({
      latitude: cityAtRequest.lat,
      longitude: cityAtRequest.lon,
      current:
        "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
      wind_speed_unit: "mph",
      temperature_unit: "fahrenheit",
      timezone: cityAtRequest.timezone
    });

    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`
      );

      if (!response.ok) {
        throw new Error(`Weather request failed: ${response.status}`);
      }

      const data = await response.json();
      const current = data.current;

      if (!current) {
        throw new Error("Weather response has no current conditions");
      }

      if (cityAtRequest !== state.city) return;

      state.windSpeed = Number(current.wind_speed_10m) || 0;
      state.windDirection = Number(current.wind_direction_10m) || 0;
      state.gusts = Number(current.wind_gusts_10m) || state.windSpeed;
      state.temperature = Number(current.temperature_2m) || 0;
      state.isDay = Boolean(current.is_day);
      state.targetSpeed = Math.max(
        0.08,
        Math.min(1.65, state.windSpeed / 17)
      );
      state.dataTime = new Date();

      renderReading();
    } catch (error) {
      console.warn(error);

      if (cityAtRequest !== state.city) return;

      // keep the last real reading if there is one; otherwise move without claiming numbers
      if (!state.dataTime) clearReading();
    }

    statusEl.textContent = statusText();
  }

  function statusText() {
    if (!state.dataTime) {
      return "Present conditions unavailable · moving in ambient mode";
    }

    return `Updated ${formatUpdated(state.dataTime)} · live conditions`;
  }

  function draw(now) {
    requestAnimationFrame(draw);

    if (!state.running || state.paused) return;

    const delta = Math.min(40, now - state.lastFrame || 16.7);
    state.lastFrame = now;

    state.speed += (state.targetSpeed - state.speed) * 0.006 * delta;

    const width = state.width;
    const height = state.height;

    ctx.clearRect(0, 0, width, height);

    const radians = ((state.windDirection + 90) * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    const px = -dy;
    const py = dx;

    // with reduced motion the field keeps its direction but drifts slowly, without gusting
    const gustPulse = reduceMotion
      ? 0.83
      : 0.83 + Math.sin(now * 0.00037) * 0.11 + Math.sin(now * 0.0011) * 0.06;

    const motion = state.speed * gustPulse * (reduceMotion ? 0.25 : 1);

    const wash = ctx.createRadialGradient(
      width * 0.5,
      height * 0.53,
      0,
      width * 0.5,
      height * 0.53,
      Math.max(width, height) * 0.7
    );

    wash.addColorStop(
      0,
      state.isDay
        ? "rgba(205, 182, 135, 0.034)"
        : "rgba(103, 128, 153, 0.034)"
    );

    wash.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    for (const particle of state.particles) {
      const sway =
        Math.sin(
          now * 0.00048 +
          particle.phase +
          (particle.x + particle.y) * 0.008
        ) * (4 + motion * 10);

      const lineLength = particle.length * (0.5 + motion * 0.68);

      const x2 = particle.x - dx * lineLength + px * sway;
      const y2 = particle.y - dy * lineLength + py * sway;

      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);

      ctx.quadraticCurveTo(
        particle.x - dx * lineLength * 0.46 + px * sway * 0.25,
        particle.y - dy * lineLength * 0.46 + py * sway * 0.25,
        x2,
        y2
      );

      ctx.strokeStyle = state.isDay
        ? `rgba(231, 222, 203, ${particle.alpha})`
        : `rgba(214, 224, 230, ${particle.alpha})`;

      ctx.lineWidth = 0.45 + motion * 0.35;
      ctx.stroke();

      particle.x +=
        dx * motion * particle.drift * delta * 0.022 +
        px * Math.sin(now * 0.0005 + particle.phase) * 0.012;

      particle.y +=
        dy * motion * particle.drift * delta * 0.022 +
        py * Math.cos(now * 0.0004 + particle.phase) * 0.012;

      const pad = 90;

      if (particle.x < -pad) particle.x = width + pad;
      if (particle.x > width + pad) particle.x = -pad;
      if (particle.y < -pad) particle.y = height + pad;
      if (particle.y > height + pad) particle.y = -pad;
    }
  }

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

    intro.hidden = true;
    reading.hidden = false;
    detailsEl.hidden = false;

    pauseBtn.hidden = false;
    pauseBtn.textContent = "Pause";

    if (state.toneOn) startAudio();
  }

  function togglePause() {
    if (!state.running) {
      begin();
      return;
    }

    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";

    if (state.paused) {
      stopAudio();
    } else if (state.toneOn) {
      startAudio();
    }

    statusEl.textContent = state.paused
      ? "The field is held."
      : statusText();
  }

  function toggleTone() {
    state.toneOn = !state.toneOn;

    toneToggle.textContent = `Ocean Tone: ${state.toneOn ? "On" : "Off"}`;
    toneToggle.setAttribute("aria-pressed", String(state.toneOn));

    if (state.toneOn) {
      if (state.running && !state.paused) {
        startAudio();
      }
    } else {
      stopAudio();
    }
  }

  function toggleAbout(force) {
    const open = typeof force === "boolean" ? force : aboutPanel.hidden;

    aboutPanel.hidden = !open;
    aboutButton.setAttribute("aria-expanded", String(open));

    if (open) {
      closeAbout.focus();
    } else {
      aboutButton.focus();
    }
  }

  function toggleMark(force) {
    const open = typeof force === "boolean" ? force : markCard.hidden;

    markCard.hidden = !open;
    mark.setAttribute("aria-expanded", String(open));
  }

  startButton.addEventListener("click", begin);

  mark.addEventListener("click", () => toggleMark());

  // the meaning card and the city list close with Escape or a click anywhere outside them
  window.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#markCard, #mark")) toggleMark(false);

    if (
      !locationPanel.hidden &&
      !event.target.closest("#locationPanel, #locationButton")
    ) {
      toggleLocation(false);
    }
  });
  pauseBtn.addEventListener("click", togglePause);
  toneToggle.addEventListener("click", toggleTone);

  locationButton.addEventListener("click", () => toggleLocation());
  closeLocation.addEventListener("click", () => toggleLocation(false));

  cityList.addEventListener("click", (event) => {
    const button = event.target.closest(".city-option");

    if (!button) return;

    selectCity(button.dataset.city);
  });

  aboutButton.addEventListener("click", () => toggleAbout());
  closeAbout.addEventListener("click", () => toggleAbout(false));

  window.addEventListener("resize", resize, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      state.running ? togglePause() : begin();
    }

    if (event.key === "Escape") {
      if (!locationPanel.hidden) toggleLocation(false);
      if (!aboutPanel.hidden) toggleAbout(false);
      toggleMark(false);
    }
  });

  let lastMove = 0;

  window.addEventListener("mousemove", () => {
    if (!state.running) return;

    const now = Date.now();

    if (now - lastMove > 200) {
      lastMove = now;
      showControls();
    }
  });

  window.addEventListener(
    "touchstart",
    () => {
      if (state.running) showControls();
    },
    { passive: true }
  );

  updateLocationUI();
  resize();
  requestAnimationFrame(draw);
  // refresh only while the page is visible, and catch up when it returns
  function refreshIfStale() {
    if (!document.hidden && Date.now() - state.lastFetch >= REFRESH_MS) {
      loadWeather();
    }
  }

  loadWeather();
  setInterval(refreshIfStale, 60 * 1000);
  document.addEventListener("visibilitychange", refreshIfStale);
})();
