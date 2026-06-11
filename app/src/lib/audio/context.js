// context.js — AudioContext lifecycle.
//
// Web Audio requires a user gesture before audio can start. We create the
// context lazily inside a click handler (the "Enable audio" button) and resume
// it if the browser has auto-suspended it. Everything downstream reads the
// single shared context from here.

/** @type {AudioContext | null} */
let ctx = null;

/**
 * Get the shared AudioContext, creating it on first call. MUST first be called
 * from within a user-gesture handler (click/keydown), or the context will start
 * suspended on some browsers.
 * @returns {AudioContext}
 */
export function getContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

/**
 * Ensure the context exists and is running. Call from a click handler.
 * @returns {Promise<AudioContext>}
 */
export async function ensureAudio() {
  const c = getContext();
  if (c.state === 'suspended') {
    await c.resume();
  }
  return c;
}

/** @returns {boolean} whether the context exists and is running */
export function isRunning() {
  return !!ctx && ctx.state === 'running';
}
