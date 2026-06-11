<script>
  // Spectrum.svelte — the signature display (plan §6).
  //
  // Two views, toggled:
  //   BUFFERS — static magnitude spectra of the three buffers overlaid:
  //             |A(f)| (dry), |B(f)| (IR) and the output |A(f)·B(f)|. This makes
  //             the product relationship visible: the IR's resonances/comb carve
  //             into the dry spectrum to give the output. Recomputed on every
  //             change, so dragging the morph slider animates the comb teeth in.
  //   LIVE    — AnalyserNode spectrum of whatever is currently playing.
  //
  // Linear frequency axis (0..maxHz): an impulse train's comb teeth are evenly
  // spaced in linear Hz, so they read as an unmistakable comb here.
  import { app } from '../lib/state.svelte.js';
  import { getAnalyser } from '../lib/audio/graph.js';
  import { getContext } from '../lib/audio/context.js';
  import { magnitudeDb } from '../lib/dsp/spectrum.js';
  import { fitCanvas, drawGrid, cssVar } from '../lib/draw.js';

  let canvas;
  let mode = $state('buffers'); // 'buffers' | 'live'
  const MIN_HZ = 20;
  const MAX_HZ = 20000;
  const DB_RANGE = 80;
  // linear frequency axis (20 Hz .. 20 kHz): an impulse train's comb teeth are
  // evenly spaced in linear Hz, so the comb reads as a uniform comb here.

  // legend solo: null = show all; otherwise only the named signal is drawn.
  // Click a legend entry to isolate it; click it again to show all.
  let solo = $state(null); // null | 'dry' | 'ir' | 'out'
  const shown = (key) => solo === null || solo === key;
  function toggleSolo(key) {
    solo = solo === key ? null : key;
  }

  let raf = 0;

  function xForHz(hz, w) {
    return ((hz - MIN_HZ) / (MAX_HZ - MIN_HZ)) * w;
  }

  // bin index range covering the visible 20 Hz .. 20 kHz window
  function binRange(db, binHz) {
    const kMin = Math.max(1, Math.ceil(MIN_HZ / binHz));
    const kMax = Math.min(db.length - 1, Math.floor(MAX_HZ / binHz));
    return [kMin, kMax];
  }

  // draw one spectrum given a dB array + its bin width, autoscaled to `ceil`
  function drawSpectrum(ctx, db, binHz, w, h, color, ceil, { fill = false, width = 1.5 } = {}) {
    const floor = ceil - DB_RANGE;
    const yForDb = (d) => {
      const v = (d - floor) / (ceil - floor);
      return h - Math.max(0, Math.min(1, v)) * h;
    };
    const [kMin, kMax] = binRange(db, binHz);
    if (kMax < kMin) return;

    ctx.beginPath();
    for (let k = kMin; k <= kMax; k++) {
      const x = xForHz(k * binHz, w);
      const y = yForDb(db[k]);
      if (k === kMin) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (fill) {
      ctx.lineTo(xForHz(kMax * binHz, w), h);
      ctx.lineTo(xForHz(kMin * binHz, w), h);
      ctx.closePath();
      ctx.fillStyle = color.replace('hsl', 'hsla').replace(')', ' / 0.12)');
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function maxDb(db, binHz) {
    const [kMin, kMax] = binRange(db, binHz);
    let m = -Infinity;
    for (let k = kMin; k <= kMax; k++) if (db[k] > m) m = db[k];
    return m;
  }

  // evenly-spaced (linear) vertical gridlines + kHz labels every 2 kHz
  function frequencyGrid(ctx, w, h) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssVar('--grid');
    ctx.font = '10px ' + cssVar('--mono');
    for (let hz = 2000; hz < MAX_HZ; hz += 2000) {
      const x = Math.round(xForHz(hz, w)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = cssVar('--ink-faint');
      ctx.fillText(`${hz / 1000}k`, x + 3, h - 5);
    }
  }

  // ---- buffers view ----
  let cache = { dry: null, ir: null, out: null };
  function renderBuffers() {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h, { cols: 1, rows: 4 }); // horizontal (dB) lines only
    frequencyGrid(ctx, w, h);                  // log-spaced vertical (Hz) lines

    const sr = getContext().sampleRate;
    const specOf = (buf) => {
      if (!buf) return null;
      const { db, size } = magnitudeDb(buf.getChannelData(0));
      return { db, binHz: sr / size };
    };
    const dry = specOf(app.dryBuffer);
    const ir = specOf(app.irBuffer);
    const out = specOf(app.outputBuffer);

    // shared autoscale anchored on a visible signal (prefer output)
    const ref = (shown('out') && out) || (shown('dry') && dry) || (shown('ir') && ir) || out || dry || ir;
    const ceil = ref ? maxDb(ref.db, ref.binHz) + 4 : 0;

    if (dry && shown('dry')) drawSpectrum(ctx, dry.db, dry.binHz, w, h, cssVar('--sig-dry'), ceil, { width: 1.25, fill: solo === 'dry' });
    if (ir && shown('ir')) drawSpectrum(ctx, ir.db, ir.binHz, w, h, cssVar('--sig-ir'), ceil, { width: 1.25, fill: solo === 'ir' });
    if (out && shown('out')) drawSpectrum(ctx, out.db, out.binHz, w, h, cssVar('--sig-out'), ceil, { fill: true, width: 2 });
  }

  // ---- live view ----
  function renderLive() {
    if (!canvas) return;
    const analyser = getAnalyser();
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h, { cols: 1, rows: 4 });
    frequencyGrid(ctx, w, h);

    const bins = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    const binHz = getContext().sampleRate / analyser.fftSize;
    const ceil = Math.max(-30, maxDb(bins, binHz) + 4);
    const color = app.playing === 'dry' ? cssVar('--sig-dry')
      : app.playing === 'ir' ? cssVar('--sig-ir')
      : cssVar('--sig-out');
    drawSpectrum(ctx, bins, binHz, w, h, color, ceil, { fill: true, width: 2 });

    raf = requestAnimationFrame(renderLive);
  }

  function stopLive() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // drive whichever view is active
  $effect(() => {
    stopLive();
    if (mode === 'live') {
      renderLive();
    } else {
      // re-run when any buffer changes or the solo selection changes
      app.dryBuffer; app.irBuffer; app.outputBuffer; solo;
      renderBuffers();
    }
    return stopLive;
  });

  $effect(() => {
    const ro = new ResizeObserver(() => { if (mode === 'buffers') renderBuffers(); });
    ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="head">
  <div class="legend num" role="group" aria-label="Show signal (click to isolate)">
    <button class="leg" class:dim={solo !== null && solo !== 'dry'} aria-pressed={solo === 'dry'} onclick={() => toggleSolo('dry')}>
      <span class="dot dry"></span>|A| dry
    </button>
    <button class="leg" class:dim={solo !== null && solo !== 'ir'} aria-pressed={solo === 'ir'} onclick={() => toggleSolo('ir')}>
      <span class="dot ir"></span>|B| IR
    </button>
    <button class="leg" class:dim={solo !== null && solo !== 'out'} aria-pressed={solo === 'out'} onclick={() => toggleSolo('out')}>
      <span class="dot out"></span>|A·B| output
    </button>
  </div>
  <div class="toggle" role="group" aria-label="Spectrum source">
    <button class:active={mode === 'buffers'} aria-pressed={mode === 'buffers'} onclick={() => (mode = 'buffers')}>Buffers</button>
    <button class:active={mode === 'live'} aria-pressed={mode === 'live'} onclick={() => (mode = 'live')}>Live</button>
  </div>
</div>
<div class="wrap">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; margin-bottom: 0.5rem;
  }
  .legend { font-size: 0.72rem; color: var(--ink-dim); display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
  .leg {
    display: inline-flex; align-items: center; gap: 0.3rem;
    font-size: 0.72rem; color: var(--ink-dim);
    background: transparent; border: 1px solid transparent;
    border-radius: var(--r); padding: 0.2rem 0.45rem;
    transition: opacity 0.12s, border-color 0.12s, background 0.12s;
  }
  .leg:hover { background: var(--panel-2); border-color: var(--line); }
  .leg[aria-pressed="true"] { border-color: var(--line); background: var(--panel-2); color: var(--ink); }
  .leg.dim { opacity: 0.38; }
  .dot { display: inline-block; width: 10px; height: 3px; border-radius: 2px; }
  .dot.dry { background: var(--sig-dry); }
  .dot.ir  { background: var(--sig-ir); }
  .dot.out { background: var(--sig-out); }
  .toggle { display: flex; gap: 0; }
  .toggle button { border-radius: 0; padding: 0.3rem 0.7rem; font-size: 0.8rem; }
  .toggle button:first-child { border-radius: var(--r) 0 0 var(--r); }
  .toggle button:last-child { border-radius: 0 var(--r) var(--r) 0; border-left: none; }
  .wrap { width: 100%; flex: 1; min-height: 0; }
  canvas { width: 100%; height: 100%; display: block; }
</style>
