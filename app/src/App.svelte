<script>
  // App.svelte — layout + orchestration.
  //
  // The orchestration here is deliberately the ONLY place that watches reactive
  // state and drives the (framework-free) audio/DSP modules: load the dry sound,
  // build the IR, render the output, and write the buffers back to state for the
  // display components to draw. Components stay thin.
  import { app } from './lib/state.svelte.js';
  import { ensureAudio } from './lib/audio/context.js';
  import {
    loadCurrentDry,
    buildCurrentIr,
    renderCurrentOutput,
    playBuffer,
    stopAll,
  } from './lib/audio/engine.js';
  import Transport from './components/Transport.svelte';
  import IRPanel from './components/IRPanel.svelte';
  import Waveform from './components/Waveform.svelte';
  import Spectrum from './components/Spectrum.svelte';

  // view toggle: hide the frequency-domain panel to give the time-domain view
  // the full display height
  let showSpectrum = $state(false);

  async function enable() {
    await ensureAudio();
    app.audioReady = true;
    app.status = 'Ready. Drag the morph slider; play dry / IR / output.';
  }

  // --- orchestration effects (only run once audio is enabled) ---

  // load the selected dry sound
  $effect(() => {
    if (!app.audioReady) return;
    app.drySource; // track
    let stale = false;
    loadCurrentDry()
      .then((buf) => { if (!stale) app.dryBuffer = buf; })
      .catch((e) => (app.status = `Dry load failed: ${e.message}`));
    return () => { stale = true; };
  });

  // build the IR from the current mode + params (irKey tracks all of them)
  $effect(() => {
    if (!app.audioReady) return;
    app.irKey; // track every IR-defining param
    let stale = false;
    buildCurrentIr()
      .then((buf) => { if (!stale) app.irBuffer = buf; })
      .catch((e) => (app.status = `IR build failed: ${e.message}`));
    return () => { stale = true; };
  });

  // render the convolved output whenever dry, IR, or the by-hand toggle changes
  $effect(() => {
    const dry = app.dryBuffer;
    const ir = app.irBuffer;
    app.byHand; // track
    if (!dry || !ir) return;
    let stale = false;
    renderCurrentOutput()
      .then((buf) => { if (!stale && buf) app.outputBuffer = buf; })
      .catch((e) => (app.status = `Render failed: ${e.message}`));
    return () => { stale = true; };
  });

  // keyboard shortcuts for live stage control
  function onKey(e) {
    if (!app.audioReady) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case ' ': e.preventDefault(); app.playing === 'output' ? stopAll() : playBuffer('output'); break;
      case 'd': playBuffer('dry'); break;
      case 'i': playBuffer('ir'); break;
      case 'o': playBuffer('output'); break;
      case 'Escape': stopAll(); break;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header>
    <div class="title">
      <h1>Convolution</h1>
      <span class="eyebrow">discrete convolution as an audio effect · DAFX §2.2.4</span>
    </div>
    <div class="head-right">
      {#if app.audioReady}
        <button
          class="view-toggle"
          aria-pressed={!showSpectrum}
          onclick={() => (showSpectrum = !showSpectrum)}
        >
          {showSpectrum ? 'Hide' : 'Show'} spectrum
        </button>
      {/if}
      <div class="status num">{app.status}</div>
    </div>
  </header>

  {#if !app.audioReady}
    <div class="gate">
      <div class="gate-card">
        <h2>Enable audio</h2>
        <p>Web Audio needs a click to start. This demo runs entirely on your machine — nothing is uploaded.</p>
        <button class="enable" onclick={enable}>▶ Enable audio</button>
      </div>
    </div>
  {:else}
    <main>
      <section class="displays" class:solo-wave={!showSpectrum}>
        {#if showSpectrum}
          <div class="panel display spectrum">
            <Spectrum />
          </div>
        {/if}
        <div class="panel display waveform">
          <div class="display-label eyebrow">
            Time domain — dry · IR · output
            <span class="hint">scroll to zoom · drag to pan · double-click to reset</span>
          </div>
          <div class="canvas-host"><Waveform /></div>
        </div>
      </section>

      <section class="controls">
        <div class="panel">
          <div class="panel-label eyebrow">Signal &amp; transport</div>
          <Transport />
        </div>
        <div class="panel">
          <div class="panel-label eyebrow">Impulse response</div>
          <IRPanel />
        </div>
      </section>
    </main>

    <footer class="keys num">
      <span><kbd>space</kbd> play/stop output</span>
      <span><kbd>d</kbd> dry</span>
      <span><kbd>i</kbd> IR</span>
      <span><kbd>o</kbd> output</span>
      <span><kbd>esc</kbd> stop</span>
    </footer>
  {/if}
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem 1.25rem;
    gap: 0.9rem;
    max-width: 1500px;
    margin: 0 auto;
  }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .title { display: flex; align-items: baseline; gap: 0.8rem; flex-wrap: wrap; }
  h1 { font-size: 1.5rem; }
  .head-right { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
  .view-toggle { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
  .status { font-size: 0.75rem; color: var(--ink-dim); }

  .gate { flex: 1; display: grid; place-items: center; }
  .gate-card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 2rem 2.25rem; max-width: 26rem; text-align: center;
  }
  .gate-card h2 { font-size: 1.2rem; margin-bottom: 0.6rem; }
  .gate-card p { color: var(--ink-dim); font-size: 0.9rem; line-height: 1.5; }
  .enable { margin-top: 1.2rem; font-size: 1.05rem; padding: 0.7rem 1.4rem; }

  main { flex: 1; display: grid; grid-template-rows: 1fr auto; gap: 0.9rem; min-height: 0; }

  .displays { display: grid; grid-template-rows: 1.4fr 1fr; gap: 0.9rem; min-height: 0; }
  .displays.solo-wave { grid-template-rows: 1fr; } /* spectrum hidden — waveform fills */
  .panel {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 0.85rem 1rem;
  }
  .display { display: flex; flex-direction: column; min-height: 0; }
  .display-label, .panel-label { margin-bottom: 0.5rem; }
  .display-label .hint { margin-left: 0.6rem; color: var(--ink-faint); text-transform: none; letter-spacing: 0; }
  .spectrum { min-height: 0; }
  .canvas-host { flex: 1; min-height: 0; }
  .waveform .canvas-host { min-height: 170px; }

  .controls { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.9rem; align-items: start; }

  footer.keys { display: flex; gap: 1.2rem; flex-wrap: wrap; font-size: 0.72rem; color: var(--ink-faint); }
  kbd {
    font-family: var(--mono); font-size: 0.7rem;
    background: var(--panel-2); border: 1px solid var(--line);
    border-radius: 4px; padding: 0.05rem 0.35rem; margin-right: 0.3rem;
  }

  @media (max-width: 880px) {
    .controls { grid-template-columns: 1fr; }
  }
</style>
