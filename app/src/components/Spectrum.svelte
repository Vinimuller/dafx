<script>
  // Spectrum.svelte — the frequency-domain view, laid out like Waveform: three
  // STACKED lanes on a shared frequency axis (not overlaid), so dry |A(f)|,
  // IR |B(f)| and output |A(f)·B(f)| each get their own graph. Reading top to
  // bottom you see the product relationship — the IR's comb/resonances carve the
  // dry spectrum into the output.
  //
  // Two sources, toggled:
  //   BUFFERS — static magnitude spectra of the three buffers. Recomputed on
  //             change, so dragging the morph slider animates the comb teeth in.
  //   LIVE    — the lane of whatever is currently playing animates from the
  //             AnalyserNode; the other two keep their static spectra (dimmed).
  //
  // Linear frequency axis (20 Hz .. 20 kHz): an impulse train's comb teeth are
  // evenly spaced in linear Hz, so the comb reads as a uniform comb here.
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

  function maxDb(db, binHz) {
    const [kMin, kMax] = binRange(db, binHz);
    let m = -Infinity;
    for (let k = kMin; k <= kMax; k++) if (db[k] > m) m = db[k];
    return m;
  }

  // draw one spectrum into a lane box (x0,y0,w,h), autoscaled to its own peak
  function drawSpectrum(ctx, spec, x0, y0, w, h, color, { fill = true, width = 1.75, ceil } = {}) {
    const { db, binHz } = spec;
    const top = ceil ?? maxDb(db, binHz) + 4;
    const floor = top - DB_RANGE;
    const yForDb = (d) => {
      const v = (d - floor) / (top - floor);
      return y0 + h - Math.max(0, Math.min(1, v)) * h;
    };
    const [kMin, kMax] = binRange(db, binHz);
    if (kMax < kMin) return;

    ctx.beginPath();
    for (let k = kMin; k <= kMax; k++) {
      const x = x0 + xForHz(k * binHz, w);
      const y = yForDb(db[k]);
      if (k === kMin) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();

    if (fill) {
      // close the curve down to the lane baseline and fill the area under it
      ctx.lineTo(x0 + xForHz(kMax * binHz, w), y0 + h);
      ctx.lineTo(x0 + xForHz(kMin * binHz, w), y0 + h);
      ctx.closePath();
      ctx.fillStyle = color.replace('hsl', 'hsla').replace(')', ' / 0.12)');
      ctx.fill();
    }
  }

  // evenly-spaced (linear) vertical gridlines, every 2 kHz, within one lane box
  function frequencyGrid(ctx, x0, y0, w, h) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssVar('--grid');
    ctx.beginPath();
    for (let hz = 2000; hz < MAX_HZ; hz += 2000) {
      const x = Math.round(x0 + xForHz(hz, w)) + 0.5;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + h);
    }
    ctx.stroke();
  }

  // ---- spectrum sources ----
  // static FFTs are expensive, so cache per buffer (keyed on buffer identity);
  // in live mode only the playing lane recomputes each frame.
  let specCache = new WeakMap();
  function staticSpec(buf) {
    if (!buf) return null;
    let s = specCache.get(buf);
    if (!s) {
      const { db, size } = magnitudeDb(buf.getChannelData(0));
      s = { db, binHz: getContext().sampleRate / size };
      specCache.set(buf, s);
    }
    return s;
  }

  function liveSpec() {
    const analyser = getAnalyser();
    const bins = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    return { db: bins, binHz: getContext().sampleRate / analyser.fftSize };
  }

  function render() {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    // app.playing uses 'output'; lanes are keyed 'out'
    const playingKey = app.playing === 'output' ? 'out' : app.playing;
    const live = mode === 'live';

    const lanes = [
      { key: 'dry', label: '|A| DRY', color: cssVar('--sig-dry'), buffer: app.dryBuffer },
      { key: 'ir', label: '|B| IR', color: cssVar('--sig-ir'), buffer: app.irBuffer },
      { key: 'out', label: '|A·B| OUTPUT', color: cssVar('--sig-out'), buffer: app.outputBuffer },
    ];

    const padTop = 14, padBottom = 18, gap = 12;
    const laneH = (h - padTop - padBottom - gap * (lanes.length - 1)) / lanes.length - 2;

    ctx.font = '11px ' + cssVar('--mono');
    let lastLaneBottom = padTop;
    lanes.forEach((lane, i) => {
      const y = padTop + i * (laneH + gap);
      lastLaneBottom = y + laneH;

      ctx.save();
      ctx.translate(0, y);
      drawGrid(ctx, w, laneH, { cols: 1, rows: 4 }); // horizontal (dB) lines
      ctx.restore();
      frequencyGrid(ctx, 0, y, w, laneH);            // vertical (Hz) lines

      // pick this lane's spectrum: live for the playing lane, static otherwise
      const isLive = live && lane.key === playingKey;
      const spec = isLive ? liveSpec() : staticSpec(lane.buffer);
      if (spec) {
        // in live mode, dim the lanes that aren't the one playing
        const dim = live && playingKey && !isLive;
        if (dim) ctx.globalAlpha = 0.35;
        const ceil = isLive ? Math.max(-30, maxDb(spec.db, spec.binHz) + 4) : undefined;
        drawSpectrum(ctx, spec, 0, y, w, laneH, lane.color, { ceil });
        ctx.globalAlpha = 1;
      }

      // lane label on the right, tinted with the trace color (doubles as key)
      ctx.textAlign = 'right';
      ctx.fillStyle = lane.color;
      ctx.fillText(lane.label, w - 6, y + 12);
      ctx.textAlign = 'left';
    });

    // shared frequency ruler along the bottom, aligned to the 2 kHz gridlines
    const ry = lastLaneBottom + 13;
    ctx.fillStyle = cssVar('--ink-faint');
    ctx.textAlign = 'center';
    for (let hz = 2000; hz < MAX_HZ; hz += 2000) {
      ctx.fillText(`${hz / 1000}k`, xForHz(hz, w), ry);
    }
    ctx.textAlign = 'left';
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // drive whichever source is active
  $effect(() => {
    stopLoop();
    if (mode === 'live') {
      const loop = () => { render(); raf = requestAnimationFrame(loop); };
      loop();
    } else {
      // re-run when any buffer changes
      app.dryBuffer; app.irBuffer; app.outputBuffer;
      render();
    }
    return stopLoop;
  });

  $effect(() => {
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="head">
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
    display: flex; align-items: center; justify-content: flex-end;
    gap: 1rem; margin-bottom: 0.5rem;
  }
  .toggle { display: flex; gap: 0; }
  .toggle button { border-radius: 0; padding: 0.3rem 0.7rem; font-size: 0.8rem; }
  .toggle button:first-child { border-radius: var(--r) 0 0 var(--r); }
  .toggle button:last-child { border-radius: 0 var(--r) var(--r) 0; border-left: none; }
  .wrap { width: 100%; flex: 1; min-height: 0; }
  canvas { width: 100%; height: 100%; display: block; }
</style>
