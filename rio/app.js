(() => {
  "use strict";

  /* ---------------------------------------------------------------
     Tunable constants. Everything you might adjust by eye is here.
     --------------------------------------------------------------- */

  // The threads
  const THREAD_COUNT = 110; // on phones this is scaled down a little, see threadCount()
  const THREAD_MIN = 70;
  const BAND_HEIGHT = 0.74; // share of the screen height the river occupies
  const SEGMENT_PX = 14; // horizontal distance between points on a thread
  const CORE_WIDTH = 0.8; // thin bright line, in CSS pixels
  const GLOW_WIDTH = 4; // wide faint line under it
  const CORE_ALPHA = 0.34;
  const GLOW_ALPHA = 0.075;
  const CORE_WHITENESS = 0.35; // how far the thin line leans from the accent toward the ink

  // The flow
  const FLOW_SPEED = 0.014; // how fast the pattern drifts downstream, left to right
  const MEANDER_AMPLITUDE = 46; // broad slow bends, in pixels
  const RIPPLE_AMPLITUDE = 11; // finer surface texture, in pixels
  const TURBULENCE = 1; // scales the ripples; live data will nudge this
  const EVOLVE_SPEED = 0.018; // how quickly the shapes themselves change

  // The breath: the whole field swells and settles
  const BREATH_PERIOD = 10; // seconds for one swell and settle
  const BREATH_DRIFT = 0.15; // the period wanders by up to this share, so it never feels mechanical
  const BREATH_BRIGHTNESS = 0.2; // brightness rises and falls by this share
  const BREATH_AMPLITUDE = 0.12; // thread bends grow and shrink by this share
  const BREATH_SPACING = 0.045; // the river widens and narrows by this share

  // The sound
  const SOUND_FILE = "stream.mp3?v=1";
  const SOUND_LEVEL = 0.8; // overall loudness once faded in
  const SOUND_FADE_SECONDS = 8; // from silence after Begin
  const LOOP_CROSSFADE = 4; // seconds the end of the recording overlaps the start of the next pass
  const LOOP_TRIM = 0.25; // seconds skipped at each end of the file, where the encoder pads
  const SWELL_DB = 2.5; // how much louder the swell is than the settle
  const FILTER_SETTLED = 3200; // low-pass cutoff in hertz when the breath settles
  const FILTER_SWELLED = 5200; // and when it swells
  const FILTER_Q = 0.5; // a soft knee, nothing resonant

  // Beginning
  const IDLE_LEVEL = 0.1; // how present the field is before Begin
  const IDLE_PACE = 0.35; // how fast it moves before Begin
  const RISE_SECONDS = 8; // the field rises into view over this long after Begin

  // Reduced motion slows everything further, it never removes the piece
  const REDUCED_PACE = 0.4;

  // The accent follows the local clock. Hours on a 24-hour clock, colors as RGB.
  const DAY_KEYS = [
    { hour: 0, color: [111, 120, 230] }, // night: deep indigo
    { hour: 4.5, color: [111, 120, 230] },
    { hour: 6.5, color: [242, 207, 138] }, // dawn: pale gold
    { hour: 9, color: [96, 206, 196] }, // day: clear water teal
    { hour: 16, color: [96, 206, 196] },
    { hour: 18.5, color: [240, 160, 140] }, // dusk: soft amber-rose
    { hour: 21, color: [111, 120, 230] },
    { hour: 24, color: [111, 120, 230] }
  ];

  /* --------------------------------------------------------------- */

  const TAU = Math.PI * 2;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("river");
  const ctx = canvas.getContext("2d", { alpha: false });
  const beginButton = document.getElementById("begin");
  const mark = document.getElementById("mark");
  const markCard = document.getElementById("markCard");

  const view = { w: 1, h: 1, ratio: 1 };
  let threads = [];

  const state = {
    running: false,
    beganAt: 0,
    level: IDLE_LEVEL, // overall presence of the field, 0 to 1
    pace: IDLE_PACE, // overall speed of time in the field
    flowTime: 0, // accumulated, so a change of pace never jumps
    breath: 0, // -1 settled to +1 swelled
    accent: colorAt(localHour()),
    // live data will steer these two, gently
    speedFactor: 1,
    turbulenceFactor: 1,
    last: 0
  };

  /* Simplex noise in three dimensions (after Stefan Gustavson), seeded once */

  const noise3 = (() => {
    const grad = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
    ];
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) p[i] = i;
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i += 1) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }
    const F3 = 1 / 3;
    const G3 = 1 / 6;

    return (xin, yin, zin) => {
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t);
      const y0 = yin - (j - t);
      const z0 = zin - (k - t);

      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }

      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
      const ii = i & 255, jj = j & 255, kk = k & 255;

      let n = 0;
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 > 0) {
        const g = grad[permMod12[ii + perm[jj + perm[kk]]]];
        t0 *= t0;
        n += t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
      }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 > 0) {
        const g = grad[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
        t1 *= t1;
        n += t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
      }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 > 0) {
        const g = grad[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
        t2 *= t2;
        n += t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
      }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 > 0) {
        const g = grad[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
        t3 *= t3;
        n += t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
      }
      return 32 * n; // roughly -1 to 1
    };
  })();

  /* The local clock picks the color of the water */

  function localHour() {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  }

  function colorAt(hour) {
    for (let i = 0; i < DAY_KEYS.length - 1; i += 1) {
      const a = DAY_KEYS[i];
      const b = DAY_KEYS[i + 1];
      if (hour >= a.hour && hour <= b.hour) {
        const span = b.hour - a.hour || 1;
        const u = (hour - a.hour) / span;
        const e = u * u * (3 - 2 * u); // ease so the turn between keyframes is soft
        return a.color.map((c, k) => c + (b.color[k] - c) * e);
      }
    }
    return DAY_KEYS[0].color.slice();
  }

  function refreshAccent() {
    const [r, g, b] = colorAt(localHour()).map(Math.round);
    document.documentElement.style.setProperty("--accent", `rgb(${r}, ${g}, ${b})`);
  }

  /* Layout */

  function threadCount() {
    // fewer threads on small screens, both for the look and for the phone
    const scale = Math.min(1, view.h / 900);
    return Math.round(THREAD_MIN + (THREAD_COUNT - THREAD_MIN) * scale);
  }

  function buildThreads() {
    const count = threadCount();
    threads = Array.from({ length: count }, (_, i) => {
      const u = (i + 0.5) / count + (Math.random() - 0.5) * (0.6 / count);
      return {
        u, // position across the river, 0 at one bank and 1 at the other
        bank: Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.9), // fainter near the banks
        seed: Math.random() * 100
      };
    });
  }

  function resize() {
    view.ratio = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(1, window.innerWidth);
    view.h = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(view.w * view.ratio);
    canvas.height = Math.floor(view.h * view.ratio);
    ctx.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
    buildThreads();
  }

  /* The breath */

  // The breath is a pure function of the clock, so the picture and the sound
  // read the same breath even while the tab is hidden and nothing is drawn.
  // Two slow sines bend the phase so the period wanders by up to BREATH_DRIFT.
  const breathPeriod = BREATH_PERIOD / (reduceMotion ? 0.7 : 1);
  const WANDER_A = { period: 97, phase: 0 };
  const WANDER_B = { period: 61, phase: 1.3 };
  const wanderShare = (BREATH_DRIFT * TAU) / breathPeriod / 2; // half the drift from each sine
  const wanderAmpA = wanderShare / (TAU / WANDER_A.period);
  const wanderAmpB = wanderShare / (TAU / WANDER_B.period);

  function breathAt(seconds) {
    const phase =
      (TAU * seconds) / breathPeriod +
      wanderAmpA * Math.sin((TAU * seconds) / WANDER_A.period + WANDER_A.phase) +
      wanderAmpB * Math.sin((TAU * seconds) / WANDER_B.period + WANDER_B.phase);
    return Math.sin(phase);
  }

  function clockSeconds() {
    return performance.now() / 1000;
  }

  /* Drawing */

  function draw() {
    const { w, h } = view;
    const t = state.flowTime;
    const breath = state.breath;
    const presence = state.level * (1 + BREATH_BRIGHTNESS * breath);
    const amplitude = 1 + BREATH_AMPLITUDE * breath;
    const band = h * BAND_HEIGHT * (1 + BREATH_SPACING * breath);
    const top = (h - band) / 2;
    const scale = Math.max(w, h) / 1000; // noise coordinates stay the same at any size
    const drift = t * FLOW_SPEED * state.speedFactor;
    const ripple = RIPPLE_AMPLITUDE * TURBULENCE * state.turbulenceFactor;
    const meander = MEANDER_AMPLITUDE * Math.max(0.6, h / 900);

    const [ar, ag, ab] = state.accent;
    const cr = Math.round(ar + (239 - ar) * CORE_WHITENESS);
    const cg = Math.round(ag + (233 - ag) * CORE_WHITENESS);
    const cb = Math.round(ab + (220 - ab) * CORE_WHITENESS);
    const glowRGB = `${Math.round(ar)}, ${Math.round(ag)}, ${Math.round(ab)}`;
    const coreRGB = `${cr}, ${cg}, ${cb}`;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const steps = Math.ceil((w + 40) / SEGMENT_PX);
    const ys = new Float32Array(steps + 1);

    for (const thread of threads) {
      const baseY = top + thread.u * band;
      const ny = baseY / (1000 * scale);
      // each thread brightens and fades on its own slow schedule
      const shimmer = 0.55 + 0.45 * noise3(thread.seed, t * 0.05, 5.1);
      const alpha = presence * thread.bank * shimmer;
      if (alpha < 0.004) continue;

      for (let s = 0; s <= steps; s += 1) {
        const x = -20 + s * SEGMENT_PX;
        const nx = x / (1000 * scale);
        const big = noise3(nx * 1.1 - drift * 0.6, ny * 1.5, t * EVOLVE_SPEED);
        const fine = noise3(nx * 3.4 - drift, ny * 3.2 + 7.3, t * EVOLVE_SPEED * 2.4 + thread.seed * 0.02);
        ys[s] = baseY + (big * meander + fine * ripple) * amplitude;
      }

      ctx.beginPath();
      ctx.moveTo(-20, ys[0]);
      for (let s = 1; s <= steps; s += 1) ctx.lineTo(-20 + s * SEGMENT_PX, ys[s]);

      ctx.strokeStyle = `rgba(${glowRGB}, ${Math.min(1, GLOW_ALPHA * alpha)})`;
      ctx.lineWidth = GLOW_WIDTH;
      ctx.stroke();

      ctx.strokeStyle = `rgba(${coreRGB}, ${Math.min(1, CORE_ALPHA * alpha)})`;
      ctx.lineWidth = CORE_WIDTH;
      ctx.stroke();
    }
  }

  function easeInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - (state.last || now)) / 1000);
    state.last = now;

    if (state.running) {
      const u = Math.min(1, (now - state.beganAt) / (RISE_SECONDS * 1000));
      const e = easeInOut(u);
      state.level = IDLE_LEVEL + (1 - IDLE_LEVEL) * e;
      state.pace = IDLE_PACE + (1 - IDLE_PACE) * e;
    }

    const pace = state.pace * (reduceMotion ? REDUCED_PACE : 1);
    state.flowTime += dt * pace;
    state.breath = breathAt(clockSeconds());

    // the accent drifts toward the clock's color, never jumps
    const target = colorAt(localHour());
    const k = 1 - Math.exp(-dt / 20);
    state.accent = state.accent.map((c, i) => c + (target[i] - c) * k);

    draw();
    requestAnimationFrame(frame);
  }

  /* The sound: a real stream, looped without a seam, breathing with the field */

  const sound = {
    ctx: null,
    buffer: null,
    breathGain: null,
    filter: null,
    master: null,
    nextVoiceAt: 0, // audio-clock time the next pass of the recording begins
    scheduledUntil: 0, // audio-clock time the breath is written up to
    timer: 0
  };

  // start downloading right away, so Begin rarely has to wait
  const soundData = fetch(SOUND_FILE)
    .then((response) => {
      if (!response.ok) throw new Error(`sound: ${response.status}`);
      return response.arrayBuffer();
    })
    .catch(() => null);

  function decode(ctx, data) {
    // the callback form still matters for older Safari
    return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
  }

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  function equalPowerCurve(fadeIn) {
    const curve = new Float32Array(128);
    for (let i = 0; i < curve.length; i += 1) {
      const u = i / (curve.length - 1);
      curve[i] = fadeIn ? Math.sin((u * Math.PI) / 2) : Math.cos((u * Math.PI) / 2);
    }
    return curve;
  }

  const FADE_IN_CURVE = equalPowerCurve(true);
  const FADE_OUT_CURVE = equalPowerCurve(false);

  // One pass of the recording. Each pass fades in over the tail of the one before
  // and fades out under the head of the one after, with equal-power curves, so the
  // loudness holds steady through the overlap.
  function startVoice(at, fadeIn) {
    const { ctx, buffer } = sound;
    const length = buffer.duration - LOOP_TRIM * 2;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();

    source.buffer = buffer;
    source.connect(gain);
    gain.connect(sound.breathGain);

    if (fadeIn) {
      gain.gain.value = 0;
      gain.gain.setValueCurveAtTime(FADE_IN_CURVE, at, LOOP_CROSSFADE);
    } else {
      gain.gain.setValueAtTime(1, at);
    }
    gain.gain.setValueCurveAtTime(FADE_OUT_CURVE, at + length - LOOP_CROSSFADE, LOOP_CROSSFADE);

    source.start(at, LOOP_TRIM, length);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };

    sound.nextVoiceAt = at + length - LOOP_CROSSFADE;
  }

  // Write the breath into the gain and the filter a few seconds ahead, in small
  // straight steps, so a slow or throttled timer never leaves the sound unsteered.
  function scheduleBreath() {
    const { ctx } = sound;
    const now = ctx.currentTime;
    // the breath runs on the page clock; map it onto the audio clock each time
    const offset = clockSeconds() - now;
    const until = now + 6;
    let t = Math.max(sound.scheduledUntil, now + 0.05);

    for (; t <= until; t += 0.1) {
      const breath = breathAt(t + offset);
      const lift = (breath + 1) / 2; // 0 settled, 1 swelled
      sound.breathGain.gain.linearRampToValueAtTime(dbToGain(SWELL_DB * (lift - 0.5)), t);
      sound.filter.frequency.linearRampToValueAtTime(
        FILTER_SETTLED * Math.pow(FILTER_SWELLED / FILTER_SETTLED, lift),
        t
      );
    }
    sound.scheduledUntil = t;

    // queue the next pass well before it is needed
    if (sound.nextVoiceAt - now < 30) startVoice(sound.nextVoiceAt, true);
  }

  async function startSound() {
    try {
      // on iPhone, play through the ring/silent switch like a music app
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch (error) {
      // not supported
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    // created inside the Begin tap, which is what lets the browser play it
    const ctx = new AudioContext();
    sound.ctx = ctx;
    ctx.resume().catch(() => {});

    const data = await soundData;
    if (!data) return; // no sound file: the river runs in silence

    try {
      sound.buffer = await decode(ctx, data);
    } catch (error) {
      return;
    }

    sound.filter = ctx.createBiquadFilter();
    sound.filter.type = "lowpass";
    sound.filter.Q.value = FILTER_Q;
    sound.breathGain = ctx.createGain();
    sound.master = ctx.createGain();

    sound.breathGain.connect(sound.filter);
    sound.filter.connect(sound.master);
    sound.master.connect(ctx.destination);

    const start = ctx.currentTime + 0.1;
    const lift = (breathAt(start + clockSeconds() - ctx.currentTime) + 1) / 2;
    sound.breathGain.gain.setValueAtTime(dbToGain(SWELL_DB * (lift - 0.5)), start);
    sound.filter.frequency.setValueAtTime(
      FILTER_SETTLED * Math.pow(FILTER_SWELLED / FILTER_SETTLED, lift),
      start
    );
    sound.scheduledUntil = start;

    // from silence, easing in the way a sound arrives from a distance
    const fade = new Float32Array(256);
    for (let i = 0; i < fade.length; i += 1) {
      const u = i / (fade.length - 1);
      const s = u * u * (3 - 2 * u);
      fade[i] = SOUND_LEVEL * s * s;
    }
    sound.master.gain.value = 0;
    sound.master.gain.setValueCurveAtTime(fade, start, SOUND_FADE_SECONDS);

    startVoice(start, false);
    scheduleBreath();
    sound.timer = setInterval(scheduleBreath, 1000);
  }

  // iPhone can pause the sound for a call or a lock; pick it up again quietly
  function wakeSound() {
    if (sound.ctx && sound.ctx.state !== "running" && sound.ctx.state !== "closed") {
      sound.ctx.resume().catch(() => {});
    }
  }

  document.addEventListener("pointerdown", wakeSound, { passive: true });

  /* Staying awake */

  let wakeLock = null;

  async function holdWake() {
    try {
      if ("wakeLock" in navigator && !document.hidden) {
        wakeLock = await navigator.wakeLock.request("screen");
      }
    } catch (error) {
      // unsupported or refused: the river runs anyway
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.running) {
      holdWake();
      wakeSound();
    }
  });

  /* Beginning */

  function begin() {
    if (state.running) return;
    state.running = true;
    state.beganAt = performance.now();
    document.body.classList.add("running");
    markCard.hidden = true;
    startSound();
    holdWake();
  }

  beginButton.addEventListener("click", begin);

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !state.running && event.target === document.body) {
      event.preventDefault();
      begin();
    }
  });

  mark.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = markCard.hidden;
    markCard.hidden = !open;
    mark.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (!markCard.hidden && !markCard.contains(event.target)) {
      markCard.hidden = true;
      mark.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("resize", resize, { passive: true });

  refreshAccent();
  setInterval(refreshAccent, 60 * 1000);
  resize();
  requestAnimationFrame(frame);
})();
