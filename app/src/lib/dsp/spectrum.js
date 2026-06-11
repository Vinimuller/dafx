// spectrum.js — a small radix-2 FFT and magnitude helper for STATIC buffers.
//
// The AnalyserNode gives us a live spectrum of whatever is playing, but to show
// clean before/after spectra of the buffers themselves — |A(f)|, |B(f)| and the
// output |A(f)·B(f)| — we want to analyse a fixed buffer on demand. This is that
// helper. Framework-free.

/**
 * In-place iterative radix-2 Cooley–Tukey FFT.
 * @param {Float32Array} re  real parts (length must be a power of two)
 * @param {Float32Array} im  imaginary parts (same length, typically zeros)
 */
export function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('fft length must be a power of two');

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Next power of two >= n. */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Magnitude spectrum of a real signal, in decibels, smoothed onto a log-ish set
 * of bins suitable for drawing. Returns the lower half (0..Nyquist).
 *
 * @param {Float32Array|number[]} signal
 * @param {object}  [opts]
 * @param {number}  [opts.fftSize]      analysis size (power of two); defaults to nextPow2 of signal length, capped
 * @param {number}  [opts.maxSize=32768] cap so very long buffers stay cheap
 * @param {boolean} [opts.window=true]  apply a Hann window
 * @returns {{ db: Float32Array, binHz: number }}  db[k] for k in 0..fftSize/2
 */
export function magnitudeDb(signal, { fftSize, maxSize = 32768, window = true } = {}) {
  const size = Math.min(maxSize, fftSize || nextPow2(signal.length));
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const n = Math.min(signal.length, size);

  for (let i = 0; i < n; i++) {
    let s = signal[i];
    if (window) {
      // Hann window reduces spectral leakage so comb teeth read cleanly
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      s *= w;
    }
    re[i] = s;
  }

  fft(re, im);

  const half = size / 2;
  const db = new Float32Array(half + 1);
  for (let k = 0; k <= half; k++) {
    const mag = Math.hypot(re[k], im[k]) / size;
    db[k] = 20 * Math.log10(mag + 1e-12);
  }
  return { db, size };
}
