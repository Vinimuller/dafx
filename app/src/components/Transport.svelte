<script>
  // Transport.svelte — dry-sound selector, the three independent play actions
  // (dry / IR / output), stop, and the "compute by hand" learning toggle.
  import { app, DRY_SOUNDS } from '../lib/state.svelte.js';
  import { playBuffer, stopAll } from '../lib/audio/engine.js';

  function play(which) {
    playBuffer(which);
  }
</script>

<div class="transport">
  <div class="row">
    <label for="dry">Dry signal</label>
    <select id="dry" bind:value={app.drySource}>
      {#each DRY_SOUNDS as s}
        <option value={s.key}>{s.label}</option>
      {/each}
    </select>
  </div>

  <div class="row plays">
    <button onclick={() => play('dry')} class:playing={app.playing === 'dry'} disabled={!app.dryBuffer}>
      <span class="swatch dry"></span> Play dry
    </button>
    <button onclick={() => play('ir')} class:playing={app.playing === 'ir'} disabled={!app.irBuffer}>
      <span class="swatch ir"></span> Play IR
    </button>
    <button onclick={() => play('output')} class:playing={app.playing === 'output'} disabled={!app.outputBuffer} class:hero={true}>
      <span class="swatch out"></span> Play output
    </button>
    <button onclick={stopAll} class="stop">Stop</button>
  </div>

  <div class="row">
    <label class="check">
      <input type="checkbox" bind:checked={app.byHand} />
      Compute by hand <span class="hint num">direct-sum JS · matches ConvolverNode</span>
    </label>
  </div>
</div>

<style>
  .transport { display: flex; flex-direction: column; gap: 0.8rem; }
  .row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  select { min-width: 12rem; }
  .plays { gap: 0.5rem; }
  .plays button { display: inline-flex; align-items: center; gap: 0.45rem; }
  .plays button.hero { border-color: var(--ink-dim); }
  .plays button.playing { background: hsl(210 26% 22%); border-color: var(--ink); }
  .stop { color: var(--ink-dim); }
  .swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .swatch.dry { background: var(--sig-dry); }
  .swatch.ir  { background: var(--sig-ir); }
  .swatch.out { background: var(--sig-out); }
  .check { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--ink); cursor: pointer; }
  .check input { width: 16px; height: 16px; accent-color: var(--ink-dim); }
  .hint { font-size: 0.7rem; color: var(--ink-faint); }
</style>
