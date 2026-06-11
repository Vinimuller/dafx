// convolve.js — direct-sum (time-domain) convolution. TEACHING REFERENCE.
//
// This is the definition of discrete convolution, written plainly so it can be
// shown next to the ConvolverNode output and verified to match sample-for-sample:
//
//   y[n] = sum over k of  x[k] * h[n - k]
//
// Output length is x.length + h.length - 1. This is O(N*M) — fine for the short
// IRs in this demo, and deliberately NOT optimised: legibility is the point.
// (For long IRs the Web Audio ConvolverNode uses FFT-based convolution; see the
// stretch goals in the plan.)

/**
 * Convolve two real signals by the direct sum.
 *
 * @param {Float32Array|number[]} x  input signal
 * @param {Float32Array|number[]} h  impulse response
 * @returns {Float32Array} y, length x.length + h.length - 1
 */
export function convolve(x, h) {
  const nx = x.length;
  const nh = h.length;
  const y = new Float32Array(nx + nh - 1);

  // For each input sample, add a scaled, shifted copy of the IR into the output.
  // (Equivalent to the y[n] = sum x[k] h[n-k] form, reorganised so the inner
  //  loop walks the IR — this is the "scatter" view that matches the picture of
  //  stamping the IR at every input sample.)
  for (let k = 0; k < nx; k++) {
    const xk = x[k];
    if (xk === 0) continue; // skip zeros — makes impulse-train IRs fast and is honest about what convolution does
    for (let j = 0; j < nh; j++) {
      y[k + j] += xk * h[j];
    }
  }
  return y;
}

/**
 * Convolve two mono AudioBuffers, returning a new AudioBuffer. Peak-normalised
 * to avoid clipping (the same normalisation is applied to the ConvolverNode path
 * so the two can be A/B'd at equal level).
 *
 * @param {BaseAudioContext} ctx
 * @param {AudioBuffer} dry
 * @param {AudioBuffer} ir
 * @returns {AudioBuffer}
 */
export function convolveBuffers(ctx, dry, ir) {
  const a = dry.getChannelData(0);
  const b = ir.getChannelData(0);
  // Convolution is commutative, and convolve() skips zeros in its FIRST argument.
  // Feed the sparser signal first so a sparse IR (e.g. an impulse train, mostly
  // zeros) makes this O(nonzeros * other) instead of O(N*M) — the difference
  // between instant and a multi-second main-thread stall during the morph.
  const [x, h] = countNonzero(b) < countNonzero(a) ? [b, a] : [a, b];
  const y = convolve(x, h);
  normalizePeak(y, 0.98);
  const out = ctx.createBuffer(1, y.length, ctx.sampleRate);
  out.copyToChannel(y, 0);
  return out;
}

/** Count nonzero samples (cheap O(n) scan) to decide the cheaper loop order. */
function countNonzero(a) {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) c++;
  return c;
}

/**
 * Scale a signal in place so its peak magnitude equals `target`.
 * @param {Float32Array} y
 * @param {number} target  peak magnitude (e.g. 0.98)
 */
export function normalizePeak(y, target = 0.98) {
  let peak = 0;
  for (let i = 0; i < y.length; i++) {
    const a = Math.abs(y[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const g = target / peak;
    for (let i = 0; i < y.length; i++) y[i] *= g;
  }
  return y;
}
