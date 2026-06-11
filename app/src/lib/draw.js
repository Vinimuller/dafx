// draw.js — small canvas helpers shared by the display components.

/**
 * Size a canvas's backing store to its CSS box * devicePixelRatio so lines stay
 * crisp on hi-dpi / projector displays. Returns the 2D context and CSS-pixel
 * dimensions to draw against.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number }}
 */
export function fitCanvas(canvas) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

/** Read a CSS custom property from :root. */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Draw a measurement grid (instrument-screen look). Monochrome only.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {object} [opts]
 * @param {number} [opts.cols=10]
 * @param {number} [opts.rows=4]
 * @param {boolean} [opts.centerAxis=false]  draw a brighter horizontal midline
 */
export function drawGrid(ctx, w, h, { cols = 10, rows = 4, centerAxis = false } = {}) {
  const grid = cssVar('--grid') || 'rgba(120,140,160,0.25)';
  const axis = cssVar('--grid-axis') || 'rgba(140,160,180,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeStyle = grid;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) {
    const x = Math.round((c / cols) * w) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let r = 1; r < rows; r++) {
    const y = Math.round((r / rows) * h) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  if (centerAxis) {
    ctx.strokeStyle = axis;
    ctx.beginPath();
    const y = Math.round(h / 2) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}
