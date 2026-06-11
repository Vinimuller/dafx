<script>
  // Waveform.svelte — time-domain view. Draws the dry, IR and output signals as
  // three stacked lanes on a SHARED time axis: the longest signal fills the full
  // width, and shorter signals occupy a proportional left-portion (length /
  // maxLen) at the same samples-per-pixel scale. So the lanes line up in time and
  // their relative durations are visible. A per-lane duration readout gives the
  // absolute scale. Static redraw on buffer change (no animation loop — the
  // signals are fixed buffers).
  import { app } from '../lib/state.svelte.js';
  import { fitCanvas, drawGrid, cssVar } from '../lib/draw.js';

  let canvas;

  // Draw the entire signal across the full lane width, using a peak (min/max)
  // envelope per pixel column so single-sample pulses are never skipped when
  // there are more samples than pixels.
  function drawTrace(ctx, data, x0, y0, w, h, color) {
    const mid = y0 + h / 2;
    const amp = h / 2 - 2;
    const n = data.length;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const i0 = Math.floor((px / w) * n);
      const i1 = Math.floor(((px + 1) / w) * n);
      let min = 1, max = -1;
      for (let i = i0; i < i1 && i < n; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (i1 <= i0) { min = max = data[Math.min(i0, n - 1)] || 0; }
      const yTop = mid - max * amp;
      const yBot = mid - min * amp;
      ctx.moveTo(x0 + px + 0.5, yTop);
      ctx.lineTo(x0 + px + 0.5, yBot);
    }
    ctx.stroke();
  }

  // human-readable duration for a buffer's length
  function durationLabel(buffer) {
    const sec = buffer.length / buffer.sampleRate;
    return sec < 1 ? `${Math.round(sec * 1000)} ms` : `${sec.toFixed(2)} s`;
  }

  function render() {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    // three lanes on a shared time axis — scaled so the longest signal fills the
    // width and shorter ones occupy a proportional left-portion
    const lanes = [
      { buffer: app.dryBuffer, label: 'DRY', color: cssVar('--sig-dry') },
      { buffer: app.irBuffer, label: 'IR', color: cssVar('--sig-ir') },
      { buffer: app.outputBuffer, label: 'OUTPUT', color: cssVar('--sig-out') },
    ];
    const maxLen = Math.max(
      app.dryBuffer?.length ?? 0,
      app.irBuffer?.length ?? 0,
      app.outputBuffer?.length ?? 0,
      1,
    );

    const padTop = 14, gap = 12;
    const laneH = (h - padTop - gap * (lanes.length - 1)) / lanes.length - 2;

    ctx.font = '11px ' + cssVar('--mono');
    lanes.forEach((lane, i) => {
      const y = padTop + i * (laneH + gap);
      ctx.save();
      ctx.translate(0, y);
      drawGrid(ctx, w, laneH, { cols: 10, rows: 2, centerAxis: true });
      ctx.restore();
      if (lane.buffer) {
        // draw the full signal across its proportional share of the width
        const laneW = w * (lane.buffer.length / maxLen);
        drawTrace(ctx, lane.buffer.getChannelData(0), 0, y, laneW, laneH, lane.color);
      }
      // lane label (left) and duration readout (right)
      ctx.textAlign = 'left';
      ctx.fillStyle = cssVar('--ink-dim');
      ctx.fillText(lane.label, 6, y + 12);
      if (lane.buffer) {
        ctx.textAlign = 'right';
        ctx.fillStyle = cssVar('--ink-faint');
        ctx.fillText(durationLabel(lane.buffer), w - 6, y + 12);
      }
    });
    ctx.textAlign = 'left';
  }

  // redraw whenever buffers change
  $effect(() => {
    // touch reactive deps so the effect re-runs
    app.dryBuffer; app.irBuffer; app.outputBuffer;
    render();
  });

  $effect(() => {
    const ro = new ResizeObserver(() => render());
    ro.observe(canvas);
    return () => ro.disconnect();
  });
</script>

<div class="wrap">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .wrap { width: 100%; height: 100%; }
  canvas { width: 100%; height: 100%; display: block; }
</style>
