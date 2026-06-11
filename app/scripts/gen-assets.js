// gen-assets.js — synthesize all bundled audio as committed 16-bit mono WAVs.
//
// We can't ship recorded audio (licensing/recording), so every asset here is
// generated procedurally. They are good enough to teach the concepts:
//   dry-click  : a single short impulse -> convolving with an IR returns the IR
//   dry-drum   : a percussive hit       -> echoes/rhythm read clearly
//   dry-voice  : a buzzy vowel          -> a broadband-ish source to colour
//   ir-room    : decaying noise + early reflections -> diffuse reverb
//   ir-bell    : inharmonic damped modes -> strike imposes a bell's resonance
//   ir-vowel   : damped formant modes    -> imposes vowel formants on the input
//
// Swap any of these for real recordings by dropping a .wav into public/sounds.
//
// Run: npm run gen-assets

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 48000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');
mkdirSync(OUT, { recursive: true });

// ---- helpers ---------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(x, target = 0.95) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) {
    const g = target / peak;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return x;
}

// short fade in/out to avoid clicks at buffer edges
function fade(x, ms = 5) {
  const n = Math.round((ms / 1000) * SR);
  for (let i = 0; i < n && i < x.length; i++) {
    const g = i / n;
    x[i] *= g;
    x[x.length - 1 - i] *= g;
  }
  return x;
}

// RBJ bandpass biquad, applied as a filter over a signal
function bandpass(input, f0, Q, gain = 1) {
  const w0 = (2 * Math.PI * f0) / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const cos = Math.cos(w0);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0 * gain;
  }
  return out;
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buf);
  console.log(`  ${name}  (${(n / SR).toFixed(2)}s)`);
}

// ---- dry sounds ------------------------------------------------------------

function dryClick() {
  // a single ~3 ms windowed impulse near the start
  const x = new Float32Array(Math.round(0.4 * SR));
  const w = Math.round(0.003 * SR);
  for (let i = 0; i < w; i++) {
    const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (w - 1));
    x[i + 20] = env * (i < w / 2 ? 1 : -0.6);
  }
  return normalize(x, 0.98);
}

function dryDrum() {
  // snare-ish: pitched body (decaying sine ~180Hz) + noise transient
  const dur = 0.35;
  const x = new Float32Array(Math.round(dur * SR));
  const rng = mulberry32(7);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const body = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.06);
    const snap = (rng() * 2 - 1) * Math.exp(-t / 0.09);
    x[i] = 0.6 * body + 0.7 * snap;
  }
  return fade(normalize(x, 0.95), 2);
}

function dryVoice() {
  // a buzzy "vowel" that sweeps a -> i: glottal sawtooth with vibrato, run
  // through three formant resonators whose centres glide over time.
  const dur = 1.8;
  const N = Math.round(dur * SR);
  const buzz = new Float32Array(N);
  let phase = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f0 = 130 * (1 + 0.02 * Math.sin(2 * Math.PI * 5 * t)); // vibrato
    phase += f0 / SR;
    if (phase >= 1) phase -= 1;
    buzz[i] = 2 * phase - 1; // sawtooth
  }
  // vowel /a/ formants -> /i/ formants, linearly interpolated
  const A = [700, 1100, 2600];
  const I = [300, 2300, 3000];
  const out = new Float32Array(N);
  // process in short blocks so formant centres can move
  const block = 256;
  for (let start = 0; start < N; start += block) {
    const end = Math.min(N, start + block);
    const frac = start / N;
    const seg = buzz.subarray(start, end);
    for (let k = 0; k < 3; k++) {
      const f = A[k] + (I[k] - A[k]) * frac;
      const filtered = bandpass(seg, f, 7, k === 0 ? 1 : 0.7);
      for (let i = 0; i < filtered.length; i++) out[start + i] += filtered[i];
    }
  }
  // overall amplitude envelope
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.05) * Math.min(1, (dur - t) / 0.1);
    out[i] *= env;
  }
  return fade(normalize(out, 0.9), 5);
}

// ---- recorded-style IRs ----------------------------------------------------

function irRoom() {
  // a few discrete early reflections then an exponentially-decaying noise tail
  const dur = 1.3;
  const N = Math.round(dur * SR);
  const x = new Float32Array(N);
  const rng = mulberry32(42);
  x[0] = 1; // direct sound
  const reflections = [
    [0.011, 0.6], [0.019, 0.5], [0.027, 0.45], [0.041, 0.35], [0.058, 0.3],
  ];
  for (const [t, a] of reflections) {
    const idx = Math.round(t * SR);
    if (idx < N) x[idx] += a * (rng() > 0.5 ? 1 : -1);
  }
  const tau = dur / Math.log(1000);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const tail = (rng() * 2 - 1) * Math.exp(-t / tau) * 0.5;
    // let the diffuse tail fade in after the early reflections
    x[i] += tail * Math.min(1, t / 0.06);
  }
  return normalize(x, 0.95);
}

function irBell() {
  // inharmonic damped modes -> striking the input "rings" it like a bell
  const dur = 2.2;
  const N = Math.round(dur * SR);
  const x = new Float32Array(N);
  // partials (Hz) and their decay times (s); ratios chosen to sound metallic
  const modes = [
    [220, 1.9, 1.0], [520, 1.6, 0.7], [870, 1.2, 0.5],
    [1230, 0.9, 0.4], [1740, 0.6, 0.3], [2600, 0.4, 0.2],
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let s = 0;
    for (const [f, dec, amp] of modes) {
      s += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dec);
    }
    x[i] = s;
  }
  return fade(normalize(x, 0.95), 1);
}

function irVowel() {
  // short IR with vowel /e/ formant resonances -> imposes the vowel on a
  // broadband input. Built as damped sinusoids at the formant frequencies.
  const dur = 0.32;
  const N = Math.round(dur * SR);
  const x = new Float32Array(N);
  const formants = [
    [530, 0.09, 1.0], [1840, 0.06, 0.6], [2480, 0.05, 0.4], [3400, 0.04, 0.2],
  ];
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let s = 0;
    for (const [f, dec, amp] of formants) {
      s += amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dec);
    }
    x[i] = s;
  }
  x[0] += 0.3; // a little direct click so the input isn't fully smeared
  return normalize(x, 0.95);
}

// ---- run -------------------------------------------------------------------

console.log('Generating audio assets ->', OUT);
writeWav('dry-click.wav', dryClick());
writeWav('dry-drum.wav', dryDrum());
writeWav('dry-voice.wav', dryVoice());
writeWav('ir-room.wav', irRoom());
writeWav('ir-bell.wav', irBell());
writeWav('ir-vowel.wav', irVowel());
console.log('done.');
