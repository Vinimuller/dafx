// noiseBurst.js — build a decaying-noise impulse response (synthetic reverb).
//
// The textbook recipe for a diffuse reverb IR: white noise shaped by a sharp
// attack and an exponential decay. Convolving a dry sound with it smears the
// sound across the decay time -> a reverb tail. Longer decay = bigger "room".
//
// Framework-free: plain numbers in, Float32Array out.

/**
 * A small deterministic PRNG (mulberry32) so generated IRs are reproducible
 * across reloads — useful when comparing displays during a lecture.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the raw samples of a decaying-noise IR.
 *
 * @param {object}  opts
 * @param {number}  opts.sampleRate   samples per second
 * @param {number}  opts.decayMs      time to decay ~60 dB, in milliseconds
 * @param {number} [opts.attackMs=2]  short fade-in to avoid a hard click
 * @param {number} [opts.seed=1]      PRNG seed
 * @returns {Float32Array} mono samples
 */
export function noiseBurstSamples({ sampleRate, decayMs, attackMs = 2, seed = 1 }) {
  const decaySec = Math.max(0.005, decayMs / 1000);
  const length = Math.max(1, Math.round(decaySec * sampleRate));
  const attack = Math.max(1, Math.round((attackMs / 1000) * sampleRate));
  const rng = mulberry32(seed);

  // exp decay reaching -60 dB (factor 1e-3) at the end of the buffer
  const tau = decaySec / Math.log(1000);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const noise = rng() * 2 - 1; // white noise in [-1, 1)
    let env = Math.exp(-t / tau);
    if (i < attack) env *= i / attack; // linear attack ramp
    out[i] = noise * env;
  }
  return out;
}

/**
 * Build a decaying-noise IR as an AudioBuffer.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} opts  see noiseBurstSamples
 * @returns {AudioBuffer} mono buffer
 */
export function noiseBurstBuffer(ctx, opts) {
  const samples = noiseBurstSamples({ sampleRate: ctx.sampleRate, ...opts });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
