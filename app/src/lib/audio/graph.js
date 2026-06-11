// graph.js — playback + offline rendering of the convolved output.
//
// Two responsibilities:
//   1. play(buffer): route a buffer through gain -> analyser -> destination so a
//      live spectrum is available while it plays. Only one source at a time.
//   2. renderOutput(dry, ir): produce the convolved output as a concrete
//      AudioBuffer, either via a real ConvolverNode (offline render) or via the
//      direct-sum teaching convolution — so the waveform and static spectrum can
//      be drawn, and the two methods compared.

import { getContext } from './context.js';
import { convolveBuffers, normalizePeak } from '../dsp/convolve.js';

/** @type {AnalyserNode | null} */
let analyser = null;
/** @type {GainNode | null} */
let masterGain = null;
/** @type {AudioBufferSourceNode | null} */
let current = null;

function ensureNodes() {
  const ctx = getContext();
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.6;
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
  }
  return { ctx, analyser, masterGain };
}

/** The shared AnalyserNode driving the live spectrum view. */
export function getAnalyser() {
  return ensureNodes().analyser;
}

/** Stop whatever is currently playing. */
export function stop() {
  if (current) {
    try {
      current.onended = null;
      current.stop();
    } catch {
      /* already stopped */
    }
    current = null;
  }
}

/**
 * Play a mono AudioBuffer. Replaces any currently-playing source.
 * @param {AudioBuffer} buffer
 * @param {() => void} [onended]  called when playback finishes naturally
 * @returns {AudioBufferSourceNode}
 */
export function play(buffer, onended) {
  const { ctx, masterGain } = ensureNodes();
  stop();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(masterGain);
  src.onended = () => {
    if (current === src) current = null;
    onended?.();
  };
  src.start();
  current = src;
  return src;
}

/**
 * Render dry * ir into an AudioBuffer.
 *
 * @param {AudioBuffer} dry
 * @param {AudioBuffer} ir
 * @param {object} [opts]
 * @param {boolean} [opts.byHand=false]  use the direct-sum teaching convolution
 *                                       instead of an offline ConvolverNode
 * @returns {Promise<AudioBuffer>}
 */
export async function renderOutput(dry, ir, { byHand = false } = {}) {
  const ctx = getContext();
  if (byHand) {
    // Direct-sum convolution in plain JS (peak-normalised inside).
    return convolveBuffers(ctx, dry, ir);
  }

  // Real path: offline ConvolverNode render. normalize=false so the result is a
  // straight convolution we can peak-normalise identically to the by-hand path,
  // making the two directly comparable.
  const length = dry.length + ir.length - 1;
  const offline = new OfflineAudioContext(1, length, ctx.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = dry;
  const conv = offline.createConvolver();
  conv.normalize = false;
  conv.buffer = ir;
  src.connect(conv);
  conv.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  // copy out and peak-normalise to 0.98 to match convolveBuffers
  const data = rendered.getChannelData(0);
  const copy = new Float32Array(data.length);
  copy.set(data);
  normalizePeak(copy, 0.98);
  const out = ctx.createBuffer(1, copy.length, ctx.sampleRate);
  out.copyToChannel(copy, 0);
  return out;
}
