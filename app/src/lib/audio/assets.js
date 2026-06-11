// assets.js — load bundled audio (dry sounds + recorded IRs) into AudioBuffers.
//
// fetch the .wav from /public/sounds, then decodeAudioData into a mono buffer.
// Results are cached so switching back and forth is instant.

import { getContext } from './context.js';

const cache = new Map(); // file -> Promise<AudioBuffer>

/**
 * Load a sound file from /sounds into an AudioBuffer (cached).
 * @param {string} file  filename within public/sounds, e.g. 'dry-drum.wav'
 * @returns {Promise<AudioBuffer>}
 */
export function loadSound(file) {
  if (cache.has(file)) return cache.get(file);
  const p = (async () => {
    const ctx = getContext();
    const url = `${import.meta.env.BASE_URL}sounds/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
    const bytes = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes);
    return toMono(ctx, decoded);
  })();
  cache.set(file, p);
  return p;
}

/** Downmix any buffer to a single mono channel. */
function toMono(ctx, buffer) {
  if (buffer.numberOfChannels === 1) return buffer;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  const g = 1 / buffer.numberOfChannels;
  for (let i = 0; i < len; i++) out[i] *= g;
  const mono = ctx.createBuffer(1, len, buffer.sampleRate);
  mono.copyToChannel(out, 0);
  return mono;
}
