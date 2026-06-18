// firHighpass.js — build a windowed-sinc FIR highpass impulse response.
//
// This is the bridge from "convolution" to "filtering": an FIR filter is just a
// set of coefficients you convolve with. Here the IR *is* the filter. We design
// a highpass two steps:
//
//   1. windowed-sinc LOWPASS at the cutoff (ideal sinc × a Hamming window, which
//      tames the ringing you'd get from truncating the infinite sinc)
//   2. SPECTRAL INVERSION:  h_hp[n] = δ[n - M/2] − h_lp[n]  flips it to a highpass
//
// The tap count is forced ODD (a Type-I linear-phase filter). An even-length FIR
// forces a zero at Nyquist, which would gut a highpass. More taps -> steeper
// rolloff and a longer IR. Coefficients are scaled so the passband (Nyquist)
// gain is unity, so the IR reads ~0 dB in the passband on the spectrum view.
//
// Framework-free: takes plain numbers, returns a Float32Array of samples.

/**
 * Build the raw coefficients of an FIR highpass IR.
 *
 * @param {object}  opts
 * @param {number}  opts.sampleRate       samples per second (e.g. 48000)
 * @param {number} [opts.cutoffHz=1000]   -6 dB cutoff frequency, in Hz
 * @param {number} [opts.numTaps=101]     filter length / sharpness (forced odd, >= 3)
 * @returns {Float32Array} mono samples (the filter coefficients)
 */
export function firHighpassSamples({ sampleRate, cutoffHz = 1000, numTaps = 101 }) {
  let N = Math.max(3, Math.floor(numTaps));
  if (N % 2 === 0) N += 1; // force odd (Type-I, needed for a highpass)
  const M = N - 1;
  // normalized cutoff in cycles/sample, clamped to (0, 0.5)
  const fc = Math.min(0.499, Math.max(1e-4, cutoffHz / sampleRate));

  const h = new Float32Array(N);
  let nyq = 0; // accumulates the gain at Nyquist, for normalization
  for (let i = 0; i < N; i++) {
    const k = i - M / 2;
    const lp = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / M); // Hamming
    const hp = (k === 0 ? 1 : 0) - lp * w; // spectral inversion of windowed lowpass
    h[i] = hp;
    nyq += hp * (i % 2 === 0 ? 1 : -1);
  }
  if (nyq !== 0) for (let i = 0; i < N; i++) h[i] /= nyq; // unity passband gain
  return h;
}

/**
 * Build an FIR highpass IR as an AudioBuffer ready for a ConvolverNode.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} opts  see firHighpassSamples
 * @returns {AudioBuffer} mono buffer
 */
export function firHighpassBuffer(ctx, opts) {
  const samples = firHighpassSamples({ sampleRate: ctx.sampleRate, ...opts });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
