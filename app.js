(() => {
  "use strict";

  const LOCATION = { name: "San Diego, California", lat: 32.7157, lon: -117.1611, timezone: "America/Los_Angeles" };
  const REFRESH_MS = 15 * 60 * 1000;
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d", { alpha: true });
  const intro = document.getElementById("intro");
  const startButton = document.getElementById("start");
  const quietControl = document.getElementById("quietControl");
  const conditionEl = document.getElementById("condition");
  const detailsEl = document.getElementById("details");
  const statusEl = document.getElementById("status");
  const aboutButton = document.getElementById("aboutButton");
  const closeAbout = document.getElementById("closeAbout");
  const aboutPanel = document.getElementById("aboutPanel");

  const state = {
    running: false, paused: false, lastFrame: 0, width: 0, height: 0, dpr: 1,
    windSpeed: 9, windDirection: 285, gusts: 13, temperature: 18, isDay: false,
    targetSpeed: 0.42, speed: 0.42, particles: [], dataTime: null, source: "live"
  };

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
      ctx.strokeStyle = state.isDay ? `rgba(231, 222, 203, ${p.alpha})` : `rgba(204, 219, 225, ${p.alpha})`;
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

  function begin() {
    if (state.running) return;
    state.running = true;
    state.paused = false;
    state.lastFrame = performance.now();
    document.body.classList.add("running");
    quietControl.hidden = false;
    quietControl.textContent = "Pause";
    quietControl.setAttribute("aria-pressed", "false");
    loadWeather();
  }

  function togglePause() {
    if (!state.running) return begin();
    state.paused = !state.paused;
    quietControl.textContent = state.paused ? "Resume" : "Pause";
    quietControl.setAttribute("aria-pressed", String(state.paused));
    statusEl.textContent = state.paused ? "The field is held." : (state.dataTime ? `Updated ${formatUpdated(state.dataTime)} · live conditions` : "Listening for the wind.");
  }

  function toggleAbout(force) {
    const open = typeof force === "boolean" ? force : aboutPanel.hidden;
    aboutPanel.hidden = !open;
    aboutButton.setAttribute("aria-expanded", String(open));
    if (open) closeAbout.focus();
    else aboutButton.focus();
  }

  startButton.addEventListener("click", begin);
  quietControl.addEventListener("click", togglePause);
  aboutButton.addEventListener("click", () => toggleAbout());
  closeAbout.addEventListener("click", () => toggleAbout(false));
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && !["BUTTON", "A"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      state.running ? togglePause() : begin();
    }
    if (event.key === "Escape" && !aboutPanel.hidden) toggleAbout(false);
  });

  resize();
  renderReading();
  requestAnimationFrame(draw);
  loadWeather();
  setInterval(loadWeather, REFRESH_MS);
})();
