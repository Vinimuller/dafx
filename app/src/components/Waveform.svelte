<script>
  // Waveform.svelte — time-domain view. Draws the dry, IR and output signals as
  // three stacked lanes on a SHARED time axis: the longest signal fills the full
  // width, and shorter signals occupy a proportional left-portion (length /
  // maxLen) at the same samples-per-pixel scale. So the lanes line up in time and
  // their relative durations are visible. Each lane's name and duration sit
  // together on the right as a legend, the name tinted with the trace color so it
  // doubles as the color key. Static redraw on buffer change (no animation loop —
  // the signals are fixed buffers).
  //
  // ZOOM: the shared axis is a TIME axis (all buffers share the one
  // AudioContext sample rate), so the visible window is held in SECONDS —
  // `view.start`..`view.end` (null end = full extent). Holding it in seconds
  // means it survives IR/output rebuilds that change the buffer lengths. Wheel
  // zooms (centered on the cursor), drag pans, double-click resets.
  import { app } from '../lib/state.svelte.js';
  import { fitCanvas, drawGrid, cssVar } from '../lib/draw.js';

  let canvas;

  // visible time window in SECONDS; null end = "full extent"
  let view = $state({ start: 0, end: null });
  let dragging = $state(null); // { x, start, end } captured at pointerdown

  // Draw a signal across the full lane width for the shared time window
  // [tStart, tEnd] (seconds), using a peak (min/max) envelope per pixel column
  // so single-sample pulses are never skipped. The lane self-truncates where
  // the buffer runs out of samples — at the default full-extent window this
  // reproduces the old proportional-left-portion layout.
  function drawTrace(ctx, data, sr, x0, y0, w, h, color, tStart, tEnd) {
    const mid = y0 + h / 2;
    const amp = h / 2 - 2;
    const n = data.length;
    const span = tEnd - tStart;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const i0 = Math.floor((tStart + (px / w) * span) * sr);
      const i1 = Math.floor((tStart + ((px + 1) / w) * span) * sr);
      if (i0 >= n) break;          // signal ended before this column
      if (i1 <= 0) continue;       // window starts before the signal
      // anchor the envelope to the center axis (0) so a lone single-sample
      // pulse — e.g. a 1-count impulse-train IR, whose buffer holds no
      // surrounding zeros — still draws from the baseline up to its peak
      let min = 0, max = 0;
      for (let i = Math.max(0, i0); i < i1 && i < n; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (i1 <= i0) { // zoomed in past 1 sample/px — fold in the nearest sample
        const v = data[Math.min(Math.max(0, i0), n - 1)] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yTop = mid - max * amp;
      const yBot = mid - min * amp;
      // nudge the extreme edge columns inward by half a stroke width so a pulse
      // sitting at t=0 (sample 0 → px 0 → x=0.5) isn't half-clipped by the
      // canvas edge and lost — that clipping is why a 1-pulse IR, or the first
      // of a train, looked absent until you zoomed it away from the edge
      const xPad = ctx.lineWidth / 2 + 0.5;
      const x = Math.min(Math.max(x0 + px + 0.5, x0 + xPad), x0 + w - xPad);
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBot);
    }
    ctx.stroke();
  }

  // human-readable duration for a buffer's length
  function durationLabel(buffer) {
    const sec = buffer.length / buffer.sampleRate;
    return sec < 1 ? `${Math.round(sec * 1000)} ms` : `${sec.toFixed(2)} s`;
  }

  // format an axis tick time. ms while the visible span is < 1 s (with a
  // decimal once heavily zoomed); seconds otherwise.
  function fmtTime(sec, span) {
    if (span < 1) {
      const ms = sec * 1000;
      return span < 0.05 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;
    }
    return `${sec.toFixed(2)} s`;
  }

  // sample rate from whichever buffer is present (no audio-context coupling)
  function sampleRate() {
    return (app.dryBuffer ?? app.irBuffer ?? app.outputBuffer)?.sampleRate ?? 48000;
  }

  // total duration (seconds) of the longest buffer — the full extent of the axis
  function totalSec() {
    const maxLen = Math.max(
      app.dryBuffer?.length ?? 0,
      app.irBuffer?.length ?? 0,
      app.outputBuffer?.length ?? 0,
      1,
    );
    return maxLen / sampleRate();
  }

  // the effective window, clamped to the current extent
  function window_() {
    const total = totalSec();
    const minSpan = 4 / sampleRate(); // a handful of samples — no point going finer
    let start = view.start;
    let end = view.end ?? total;
    if (end > total) end = total;
    if (end - start < minSpan) start = end - minSpan;
    if (start < 0) start = 0;
    return { start, end, total };
  }

  // single clamp path for wheel + pan; stores null end when at full extent
  function setView(start, end) {
    const total = totalSec();
    const minSpan = 4 / sampleRate();
    if (end - start < minSpan) {
      const mid = (start + end) / 2;
      start = mid - minSpan / 2;
      end = mid + minSpan / 2;
    }
    if (start < 0) { end -= start; start = 0; }
    if (end > total) { start -= end - total; end = total; }
    if (start < 0) start = 0;
    view = { start, end: end >= total ? null : end };
  }

  function render() {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const sr = sampleRate();
    const { start: tStart, end: tEnd } = window_();
    const zoomed = view.end !== null || view.start > 0;

    // three lanes on a shared time axis — every lane drawn against the same
    // [tStart, tEnd] window at full width; shorter lanes self-truncate
    const lanes = [
      { buffer: app.dryBuffer, label: 'DRY', color: cssVar('--sig-dry') },
      { buffer: app.irBuffer, label: 'IR', color: cssVar('--sig-ir') },
      { buffer: app.outputBuffer, label: 'OUTPUT', color: cssVar('--sig-out') },
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
      drawGrid(ctx, w, laneH, { cols: 10, rows: 2, centerAxis: true });
      ctx.restore();
      if (lane.buffer) {
        drawTrace(ctx, lane.buffer.getChannelData(0), sr, 0, y, w, laneH, lane.color, tStart, tEnd);
      }
      // legend on the right: signal name (in its trace color) + duration readout.
      // Right-aligned so the names line up; the name doubles as the color key.
      ctx.textAlign = 'right';
      const ty = y + 12;
      if (lane.buffer) {
        ctx.fillStyle = cssVar('--ink-faint');
        ctx.fillText(durationLabel(lane.buffer), w - 6, ty);
        const durW = ctx.measureText(durationLabel(lane.buffer)).width;
        ctx.fillStyle = lane.color;
        ctx.fillText(lane.label, w - 6 - durW - 10, ty);
      } else {
        ctx.fillStyle = lane.color;
        ctx.fillText(lane.label, w - 6, ty);
      }
    });

    // shared time ruler along the bottom, aligned to the 10 grid columns
    const span = tEnd - tStart;
    const ry = lastLaneBottom + 13;
    ctx.fillStyle = cssVar('--ink-faint');
    for (let c = 0; c <= 10; c++) {
      const t = tStart + (c / 10) * span;
      ctx.textAlign = c === 0 ? 'left' : c === 10 ? 'right' : 'center';
      const lx = c === 0 ? 2 : c === 10 ? w - 2 : (c / 10) * w;
      ctx.fillText(fmtTime(t, span), lx, ry);
    }
    ctx.textAlign = 'left';

    if (zoomed) {
      ctx.fillStyle = cssVar('--ink-faint');
      ctx.fillText('zoomed · double-click to reset', 2, padTop - 4);
    }
  }

  // map a canvas-x (client px) to a time in the current window
  function timeAtX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const { start, end } = window_();
    return start + ((clientX - rect.left) / rect.width) * (end - start);
  }

  function onWheel(e) {
    e.preventDefault();
    const { start, end } = window_();
    const tc = timeAtX(e.clientX);
    const factor = Math.exp(e.deltaY * 0.0015); // >1 zooms out
    setView(tc - (tc - start) * factor, tc + (end - tc) * factor);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const { start, end } = window_();
    dragging = { x: e.clientX, start, end };
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const span = dragging.end - dragging.start;
    const dt = ((e.clientX - dragging.x) / rect.width) * span; // drag right → earlier
    setView(dragging.start - dt, dragging.end - dt);
  }

  function onPointerUp(e) {
    if (dragging) canvas.releasePointerCapture(e.pointerId);
    dragging = null;
  }

  function resetZoom() {
    view = { start: 0, end: null };
  }

  // redraw whenever buffers OR the view window change
  $effect(() => {
    // touch reactive deps so the effect re-runs
    app.dryBuffer; app.irBuffer; app.outputBuffer; view;
    render();
  });

  // wheel must be a NON-passive listener so preventDefault() stops page scroll
  $effect(() => {
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  });

  $effect(() => {
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="wrap">
  <canvas
    bind:this={canvas}
    class:dragging
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={resetZoom}
  ></canvas>
</div>

<style>
  .wrap { width: 100%; height: 100%; }
  canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
  canvas.dragging { cursor: grabbing; }
</style>
