<script>
  // IRPanel.svelte — choose the IR mode and its parameters. Houses the morph
  // slider (impulse-train spacing), the presentation centerpiece.
  import { app, RECORDED_IRS } from '../lib/state.svelte.js';
  import { playFreshOutput } from '../lib/audio/engine.js';

  const MODES = [
    { key: 'train', label: 'Impulse train' },
    { key: 'noise', label: 'Decaying noise' },
    { key: 'fir', label: 'FIR highpass' },
    { key: 'recorded', label: 'Recorded' },
  ];

  // readout for the FIR cutoff slider (Hz below 1k, else k)
  const firCutoffLabel = $derived(
    app.firCutoffHz < 1000
      ? `${app.firCutoffHz} Hz`
      : `${(app.firCutoffHz / 1000).toFixed(app.firCutoffHz % 1000 === 0 ? 0 : 1)} kHz`,
  );

  // implied comb pitch from pulse spacing (1 / spacing). Below ~50 Hz the ear
  // hears discrete echoes; above it, a pitch. This is the rhythm<->timbre line.
  const pitchHz = $derived(1000 / app.spacingMs);
  const regime = $derived(app.spacingMs > 50 ? 'echoes / rhythm' : 'comb timbre');

  // auto-play the fresh output when the morph slider is released, so the new
  // spacing is heard immediately (only when output is the active sound).
  function onMorphRelease() {
    if (app.playing === 'output') playFreshOutput();
  }
</script>

<div class="panel">
  <div class="modes" role="group" aria-label="Impulse response mode">
    {#each MODES as m}
      <button class:active={app.irMode === m.key} aria-pressed={app.irMode === m.key} onclick={() => (app.irMode = m.key)}>
        {m.label}
      </button>
    {/each}
  </div>

  {#if app.irMode === 'train'}
    <!-- THE MORPH: spacing drives rhythm -> timbre -->
    <div class="morph">
      <div class="morph-head">
        <span class="eyebrow">Pulse spacing — the morph</span>
        <span class="readout num">
          {app.spacingMs.toFixed(app.spacingMs < 10 ? 1 : 0)} ms
          <span class="sep">·</span>
          {pitchHz < 1000 ? pitchHz.toFixed(pitchHz < 100 ? 1 : 0) : (pitchHz / 1000).toFixed(2) + 'k'} Hz
          <span class="regime">{regime}</span>
        </span>
      </div>
      <input
        class="morph-slider"
        type="range"
        min="1.5" max="400" step="0.5"
        bind:value={app.spacingMs}
        onchange={onMorphRelease}
        aria-label="Pulse spacing in milliseconds"
      />
      <div class="scale num"><span>tight · timbre</span><span>wide · echoes</span></div>
    </div>

    <div class="param">
      <label for="count">Pulses <span class="num">{app.pulseCount}</span></label>
      <input id="count" type="range" min="1" max="32" step="1" bind:value={app.pulseCount} />
    </div>
    <div class="param">
      <label for="decay">Per-pulse decay <span class="num">{app.trainDecay.toFixed(2)}</span></label>
      <input id="decay" type="range" min="0.3" max="1" step="0.01" bind:value={app.trainDecay} />
    </div>

  {:else if app.irMode === 'noise'}
    <div class="param wide">
      <label for="ndecay">Decay time <span class="num">{app.decayMs} ms</span></label>
      <input id="ndecay" type="range" min="80" max="3000" step="10" bind:value={app.decayMs} />
      <p class="note">White noise × exponential decay — the textbook diffuse-reverb IR.</p>
    </div>

  {:else if app.irMode === 'fir'}
    <div class="param">
      <label for="fircut">Cutoff <span class="num">{firCutoffLabel}</span></label>
      <input id="fircut" type="range" min="100" max="8000" step="10" bind:value={app.firCutoffHz} />
    </div>
    <div class="param wide">
      <label for="firtaps">Taps — sharpness <span class="num">{app.firTaps}</span></label>
      <input id="firtaps" type="range" min="11" max="301" step="2" bind:value={app.firTaps} />
      <p class="note">A windowed-sinc highpass — here the IR <em>is</em> the filter. More taps = steeper rolloff.</p>
    </div>

  {:else}
    <div class="recorded">
      {#each RECORDED_IRS as r}
        <button class:active={app.recordedKey === r.key} aria-pressed={app.recordedKey === r.key} onclick={() => (app.recordedKey = r.key)}>
          {r.label}
        </button>
      {/each}
      <p class="note">Convolving with a recorded sound imposes its resonances on the dry signal.</p>
    </div>
  {/if}
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 1rem; }
  .modes, .recorded { display: flex; gap: 0; flex-wrap: wrap; }
  .modes button { border-radius: 0; }
  .modes button:first-child { border-radius: var(--r) 0 0 var(--r); }
  .modes button:last-child { border-radius: 0 var(--r) var(--r) 0; }
  .modes button:not(:first-child) { border-left: none; }

  .morph {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--r);
    padding: 0.9rem 1rem 1rem;
  }
  .morph-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.7rem; }
  .readout { font-size: 1.05rem; color: var(--ink); }
  .readout .sep { color: var(--ink-faint); margin: 0 0.3rem; }
  .readout .regime { color: var(--ink-dim); font-size: 0.78rem; margin-left: 0.5rem; }
  .morph-slider { height: 6px; }
  .morph-slider::-webkit-slider-thumb { width: 24px; height: 24px; }
  .morph-slider::-moz-range-thumb { width: 24px; height: 24px; }
  .scale { display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--ink-faint); margin-top: 0.5rem; }

  .param { display: flex; flex-direction: column; gap: 0.4rem; }
  .param label { display: flex; justify-content: space-between; }
  .param.wide .note, .recorded .note { margin: 0.3rem 0 0; font-size: 0.75rem; color: var(--ink-faint); }

  .recorded button { border-radius: 0; }
  .recorded button:first-of-type { border-radius: var(--r) 0 0 var(--r); }
  .recorded button:nth-of-type(3) { border-radius: 0 var(--r) var(--r) 0; }
  .recorded button:not(:first-of-type) { border-left: none; }
  .recorded .note { flex-basis: 100%; }
</style>
