// impulseTrain.js — build an impulse-train impulse response.
//
// An impulse train is the heart of the rhythm -> timbre morph. The IR is mostly
// zeros, with a value of 1.0 at evenly spaced sample indices. Convolving a dry
// sound with this IR copies the sound to every pulse:
//
//   - wide spacing (e.g. 250 ms) -> you hear distinct echoes / a rhythm
//   - narrow spacing (e.g. 2 ms) -> the copies fuse into a pitched comb-filter
//     timbre, pitch = 1 / spacing
//
// Same operation, two time scales. That is the whole point of the demo.
//
// Framework-free: takes plain numbers, returns a Float32Array of samples.

/**
 * Build the raw samples of an impulse-train IR.
 *
 * @param {object}  opts
 * @param {number}  opts.sampleRate   samples per second (e.g. 48000)
 * @param {number}  opts.spacingMs    time between pulses, in milliseconds
 * @param {number}  opts.count        number of pulses (>= 1)
 * @param {number} [opts.decay=1]     geometric amplitude decay per pulse (1 = no decay)
 * @returns {Float32Array} mono samples, length = (count-1)*spacing + 1
 */
export function impulseTrainSamples({ sampleRate, spacingMs, count, decay = 1 }) {
  const spacing = Math.max(1, Math.round((spacingMs / 1000) * sampleRate));
  const n = Math.max(1, Math.floor(count));
  const length = (n - 1) * spacing + 1;
  const out = new Float32Array(length); // zero-filled

  let amp = 1;
  for (let i = 0; i < n; i++) {
    out[i * spacing] = amp;
    amp *= decay;
  }
  return out;
}

/**
 * Build an impulse-train IR as an AudioBuffer ready for a ConvolverNode.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} opts  see impulseTrainSamples
 * @returns {AudioBuffer} mono buffer
 */
export function impulseTrainBuffer(ctx, opts) {
  const samples = impulseTrainSamples({ sampleRate: ctx.sampleRate, ...opts });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
