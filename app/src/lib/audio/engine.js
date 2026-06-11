// engine.js — the bridge between reactive state and the audio/DSP modules.
//
// Plain JS (no runes): it reads the current app state, calls the framework-free
// DSP/graph helpers, and offers play actions. App.svelte's effects use
// buildCurrentIr / renderCurrentOutput to keep app.irBuffer / app.outputBuffer
// fresh; the transport buttons use playBuffer / stopAll.

import { app, DRY_SOUNDS, RECORDED_IRS } from '../state.svelte.js';
import { getContext } from './context.js';
import { loadSound } from './assets.js';
import { play, stop, renderOutput } from './graph.js';
import { impulseTrainBuffer } from '../dsp/impulseTrain.js';
import { noiseBurstBuffer } from '../dsp/noiseBurst.js';

/** Load the currently-selected dry sound. @returns {Promise<AudioBuffer>} */
export function loadCurrentDry() {
  const d = DRY_SOUNDS.find((s) => s.key === app.drySource) ?? DRY_SOUNDS[0];
  return loadSound(d.file);
}

/** Build the IR for the current IR mode + parameters. @returns {Promise<AudioBuffer>} */
export async function buildCurrentIr() {
  const ctx = getContext();
  switch (app.irMode) {
    case 'train':
      return impulseTrainBuffer(ctx, {
        spacingMs: app.spacingMs,
        count: app.pulseCount,
        decay: app.trainDecay,
      });
    case 'noise':
      return noiseBurstBuffer(ctx, { decayMs: app.decayMs });
    case 'recorded': {
      const rec = RECORDED_IRS.find((r) => r.key === app.recordedKey) ?? RECORDED_IRS[0];
      return loadSound(rec.file);
    }
    default:
      throw new Error(`unknown IR mode: ${app.irMode}`);
  }
}

/** Render dry * ir for the current buffers + by-hand toggle. @returns {Promise<AudioBuffer|null>} */
export async function renderCurrentOutput() {
  if (!app.dryBuffer || !app.irBuffer) return null;
  return renderOutput(app.dryBuffer, app.irBuffer, { byHand: app.byHand });
}

/**
 * Play one of the three buffers and reflect it in app.playing.
 * @param {'dry'|'ir'|'output'} which
 */
export function playBuffer(which) {
  const buf =
    which === 'dry' ? app.dryBuffer : which === 'ir' ? app.irBuffer : app.outputBuffer;
  if (!buf) return;
  app.playing = which;
  play(buf, () => {
    if (app.playing === which) app.playing = null;
  });
}

/** Stop playback. */
export function stopAll() {
  stop();
  app.playing = null;
}

/**
 * Re-render the output from the current state and play it. Used on morph-slider
 * release so the audience hears the new spacing without a stale-buffer race.
 */
export async function playFreshOutput() {
  const out = await renderCurrentOutput();
  if (!out) return;
  app.outputBuffer = out;
  playBuffer('output');
}
