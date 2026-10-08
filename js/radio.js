/* ============================================================
   NEON FM · 主控逻辑
   ============================================================ */

(function () {
  const FREQ_MIN = 88;
  const FREQ_MAX = 108;
  const LOCK_THRESHOLD = 0.6;

  const state = {
    powered: false,
    currentFreq: 88.1,
    currentStation: -1,
    isDragging: false,
    isTuning: false
  };

  const $ = (id) => document.getElementById(id);
  const screenBody = $("screen-body");
  const freqScale = $("freq-scale");
  const freqTicks = $("freq-ticks");
  const freqStations = $("freq-stations");
  const indicator = $("freq-indicator");
  const digitalFreq = $("digital-freq");
  const screenFreq = $("screen-freq");
  const stationName = $("station-name");
  const stationCall = $("station-call");
  const signalMeters = $("signal-meters");
  const npText = $("np-text");
  const bootOverlay = $("boot-overlay");
  const bootBtn = $("boot-btn");
  const powerSwitch = $("power-switch");
  const vuBars = $("vu-bars");
  const cassetteReels = document.querySelectorAll(".cassette-reel");

  // ===== 刻度 =====
  function buildTicks() {
    for (let f = FREQ_MIN; f <= FREQ_MAX; f += 0.5) {
      const isMajor = Number.isInteger(f);
      const tick = document.createElement("div");
      tick.className = "tick " + (isMajor ? "major" : "minor");
      tick.style.left = freqToPercent(f) + "%";
      freqTicks.appendChild(tick);
      if (isMajor && f % 2 === 0) {
        const label = document.createElement("div");
        label.className = "tick-label";
        label.style.left = freqToPercent(f) + "%";
        label.textContent = f;
        freqTicks.appendChild(label);
      }
    }
  }

  // ===== 电台星标 =====
  function buildStations() {
    CHANNELS.forEach((ch) => {
      const star = document.createElement("div");
      star.className = "station-star";
      star.style.left = freqToPercent(ch.freq) + "%";
      star.textContent = "★";
      star.dataset.id = ch.id;
      freqStations.appendChild(star);
    });
  }

  // ===== 工具 =====
  function freqToPercent(f) {
    return ((f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * 100;
  }
  function percentToFreq(p) {
    return FREQ_MIN + (p / 100) * (FREQ_MAX - FREQ_MIN);
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function nearestStation(freq) {
    let best = null;
    let bestDist = Infinity;
    CHANNELS.forEach((ch) => {
      const d = Math.abs(parseFloat(ch.freq) - freq);
      if (d < bestDist) {
        bestDist = d;
        best = ch;
      }
    });
    return { station: best, dist: bestDist };
  }

  function setIndicator(freq) {
    state.currentFreq = freq;
    indicator.style.left = freqToPercent(freq) + "%";
    digitalFreq.textContent = freq.toFixed(1);
    screenFreq.textContent = freq.toFixed(1);
  }

  // ===== VHS 故障转场 =====
  function vhsGlitch() {
    const target = document.querySelector(".content-screen");
    target.classList.remove("vhs-glitch");
    void target.offsetWidth;
    target.classList.add("vhs-glitch");
  }

  // ===== 锁定电台 =====
  async function lockStation(station) {
    if (state.currentStation === station.id) return;
    state.currentStation = station.id;

    document.querySelectorAll(".station-star").forEach((s) => {
      s.classList.toggle("locked", parseInt(s.dataset.id) === station.id);
    });

    signalMeters.classList.add("locked");
    stationName.textContent = station.name;
    stationCall.textContent = "SIGNAL: LOCKED";
    npText.textContent = `FM ${station.freq} · ${station.name} · ${station.style}`;

    // VHS 故障转场
    vhsGlitch();

    // 内容切换
    screenBody.style.opacity = "0";
    setTimeout(() => {
      screenBody.innerHTML = station.content;
      screenBody.style.opacity = "1";
    }, 200);

    if (state.powered) {
      await AudioSystem.switchChannel(station.id, 0.5);
    }
  }

  function unlockStation() {
    if (state.currentStation === -1) return;
    state.currentStation = -1;
    document.querySelectorAll(".station-star").forEach((s) => s.classList.remove("locked"));
    signalMeters.classList.remove("locked");
    stationName.textContent = "——";
    stationCall.textContent = "SIGNAL: SEARCHING";
    npText.textContent = "搜索信号中…";
  }

  // ===== 调频 =====
  function tuneTo(freq) {
    freq = clamp(freq, FREQ_MIN, FREQ_MAX);
    setIndicator(freq);
    const { station, dist } = nearestStation(freq);
    if (dist <= LOCK_THRESHOLD) {
      const targetFreq = parseFloat(station.freq);
      setIndicator(targetFreq);
      lockStation(station);
    } else {
      unlockStation();
      if (state.powered && !state.isTuning) AudioSystem.playStatic(0.3);
    }
  }

  // ===== 拖动 =====
  function getFreqFromEvent(e) {
    const rect = freqScale.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return percentToFreq(clamp(pct, 0, 100));
  }

  function onDragStart(e) {
    if (!state.powered) return;
    state.isDragging = true;
    e.preventDefault();
    tuneTo(getFreqFromEvent(e));
  }
  function onDragMove(e) {
    if (!state.isDragging) return;
    e.preventDefault();
    tuneTo(getFreqFromEvent(e));
  }
  function onDragEnd() {
    state.isDragging = false;
  }

  // ===== 按钮切换 =====
  function nextStation() {
    if (!state.powered) return;
    const sorted = [...CHANNELS].sort((a, b) => parseFloat(a.freq) - parseFloat(b.freq));
    let idx = sorted.findIndex((c) => c.id === state.currentStation);
    idx = (idx + 1) % sorted.length;
    animateTuneTo(parseFloat(sorted[idx].freq));
  }
  function prevStation() {
    if (!state.powered) return;
    const sorted = [...CHANNELS].sort((a, b) => parseFloat(a.freq) - parseFloat(b.freq));
    let idx = sorted.findIndex((c) => c.id === state.currentStation);
    idx = (idx - 1 + sorted.length) % sorted.length;
    animateTuneTo(parseFloat(sorted[idx].freq));
  }

  function animateTuneTo(targetFreq) {
    if (state.isTuning) return;
    state.isTuning = true;
    const start = state.currentFreq;
    const startTime = performance.now();
    const duration = 500;

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setIndicator(start + (targetFreq - start) * eased);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        setIndicator(targetFreq);
        const { station } = nearestStation(targetFreq);
        lockStation(station);
        state.isTuning = false;
      }
    }
    if (state.powered) AudioSystem.playStatic(0.4);
    requestAnimationFrame(step);
  }

  // ===== VU 表动画 =====
  function animateVU() {
    if (!state.powered) {
      document.querySelectorAll(".vu-bar").forEach((b) => b.classList.remove("active", "hot"));
      return;
    }
    document.querySelectorAll(".vu-bar").forEach((b) => {
      const r = Math.random();
      b.classList.remove("active", "hot");
      if (r > 0.3) b.classList.add("active");
      if (r > 0.75) b.classList.add("hot");
      b.style.height = (8 + Math.random() * 28) + "px";
    });
  }

  // ===== 开机 =====
  async function boot() {
    bootBtn.disabled = true;
    bootBtn.textContent = "启动中…";

    await AudioSystem.resume();
    await AudioSystem.init();

    state.powered = true;
    powerSwitch.classList.add("on");
    bootOverlay.classList.add("hidden");

    // 磁带转动
    cassetteReels.forEach((r) => r.classList.add("spinning"));

    const first = CHANNELS[0];
    setIndicator(parseFloat(first.freq));
    lockStation(first);
    AudioSystem.playFirst(0);

    bootBtn.disabled = false;
    bootBtn.textContent = "▶ 启动电台";
  }

  // ===== 事件 =====
  function bindEvents() {
    bootBtn.addEventListener("click", boot);

    freqScale.addEventListener("mousedown", onDragStart);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    freqScale.addEventListener("touchstart", onDragStart, { passive: false });
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd);

    $("btn-prev").addEventListener("click", prevStation);
    $("btn-next").addEventListener("click", nextStation);

    document.addEventListener("keydown", (e) => {
      if (!state.powered) return;
      if (e.key === "ArrowLeft") prevStation();
      if (e.key === "ArrowRight") nextStation();
    });

    screenBody.style.transition = "opacity 0.2s";

    // VU 表循环
    setInterval(animateVU, 150);
  }

  window.addEventListener("load", () => {
    buildTicks();
    buildStations();
    setIndicator(88.1);
    bindEvents();
  });
})();
