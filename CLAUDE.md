# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WebApp (DAFX Explorer) of interactive DSP demos from *DAFX — Digital Audio Effects* (Zölzer, 2nd ed.). Currently one demo ships: **convolution as an audio effect** (§2.2.4), built to be heard *and* seen — dragging one slider morphs a rhythm of discrete echoes into a comb-filter timbre.

The original brief is `docs/convolution-demo-plan.md`. The repo has since diverged from that plan's layout (see below) — trust the code over the plan doc.

## Commands

The app lives in `app/` — **all npm commands run from there**, not the repo root.

```bash
cd app
npm install
npm run dev          # vite dev server, http://localhost:5173 (HMR)
npm run build        # static bundle into app/dist
npm run preview      # serve the built bundle (use this for lectures, not dev)
npm run gen-assets   # regenerate every .wav in public/sounds via scripts/gen-assets.js
```

There is **no test runner, linter, or formatter** configured. "Verifying" means running `npm run dev` and listening/looking in a browser — Web Audio has no headless path here.

Always serve over `localhost`: Web Audio needs a secure context, so opening built `index.html` via `file://` fails. The user must click **Enable audio** before any sound (browsers require a user gesture).

## Deployment

The app deploys to **GitHub Pages** at `https://vinimuller.github.io/dafx/` via `.github/workflows/deploy.yml` — every push to `main` (or a manual `workflow_dispatch`) runs `npm ci && npm run build` from `app/` and publishes `app/dist`. Pages is configured with Source: **GitHub Actions** (set once in repo Settings → Pages).

`vite.config.js` uses `base: './'` (relative asset paths) so the bundle works under the `/dafx/` subpath without hardcoding it. Pages serves over HTTPS, which satisfies Web Audio's secure-context requirement. If client-side routing is ever added, switch `base` to `'/dafx/'`.

## Architecture

The hard rule, and the reason the code reads the way it does: **DSP and audio code under `lib/dsp` and `lib/audio` import no Svelte and take/return plain numbers, `Float32Array`s, and `AudioBuffer`s.** They are framework-free teaching material. Svelte reactivity lives only in `.svelte` files and `state.svelte.js`.

Data flow (one direction):

```
state.svelte.js  ──watched by──▶  App.svelte $effects  ──call──▶  engine.js  ──▶  dsp/ + audio/graph.js
   (runes)                         (the ONLY orchestrator)         (bridge)        write AudioBuffers back to state
                                                                                            │
components (Transport/IRPanel/Waveform/Spectrum) ◀── read buffers & draw ────────────────────┘
```

- **`src/lib/state.svelte.js`** — the single `app` reactive store (Svelte 5 runes: `$state`/`$derived`). Holds controls (dry source, IR mode + params, `byHand` toggle) and the three live buffers (`dryBuffer`, `irBuffer`, `outputBuffer`). Contains no logic. `app.irKey` is a derived signature string of all IR-defining params used to trigger rebuilds cheaply. The `DRY_SOUNDS` / `RECORDED_IRS` arrays here map keys → `.wav` filenames.
- **`src/App.svelte`** — the **only** place that watches state and drives audio. Three `$effect`s: load dry sound on `drySource` change; rebuild IR on `irKey` change; re-render output on dry/ir/`byHand` change. Each uses a `stale` flag to discard out-of-order async results. Also owns layout and keyboard shortcuts.
- **`src/lib/audio/engine.js`** — plain-JS bridge between `app` state and the audio/DSP helpers (`buildCurrentIr`, `renderCurrentOutput`, `playBuffer`, `stopAll`). Not in the original plan; it keeps App.svelte thin.
- **`src/lib/audio/context.js`** — single shared `AudioContext`, created lazily inside the Enable-audio gesture; `getContext()` everywhere downstream.
- **`src/lib/audio/graph.js`** — `play()` routes a buffer through gain → shared `AnalyserNode` → destination (one source at a time; the analyser drives the live Spectrum). `renderOutput()` produces the convolved output as a concrete `AudioBuffer` two ways: an **offline `ConvolverNode`** render (default) or the **direct-sum `convolveBuffers`** (the `byHand` learning toggle). Both peak-normalise identically so they match sample-for-sample — that equivalence is a teaching point; preserve it.
- **`src/lib/audio/assets.js`** — `loadSound(file)`: fetch from `public/sounds/`, `decodeAudioData`, downmix to mono, cache.
- **`src/lib/dsp/`** — `impulseTrain.js` (the morph IR), `noiseBurst.js` (reverb IR), `convolve.js` (direct-sum reference + `normalizePeak`), `spectrum.js` (radix-2 `fft` + `magnitudeDb` for static buffer spectra). Each exports a pure `*Samples`/array function and, where relevant, an `*Buffer` wrapper that wraps the result in an `AudioBuffer`.
- **`src/lib/draw.js`** — canvas helpers (`fitCanvas` for devicePixelRatio, `cssVar` to read theme colors, `drawGrid`). Components run their own `requestAnimationFrame` loops, started in `$effect`/`onMount` and cancelled on teardown.

## Conventions

- **Mono everywhere** — simpler graph, clearer teaching. Don't introduce stereo without a reason.
- **Color belongs to the signal only.** Controls, grids, labels stay monochrome; the live waveform/spectrum trace is the single chromatic element. This is a deliberate design discipline (plan §6), not incidental.
- Audio assets are **synthesized procedurally** by `scripts/gen-assets.js` (no external recordings — repo is self-contained and license-free). The "recorded" IRs are physical-model approximations. To swap in a real recording, drop a mono `.wav` into `public/sounds/` matching the filename in `DRY_SOUNDS`/`RECORDED_IRS`.
- New DSP modules go in `lib/dsp` as framework-free pure functions; wire them into the demo only through `engine.js` + an App.svelte effect. Keep `lib/dsp`/`lib/audio` free of Svelte imports.
