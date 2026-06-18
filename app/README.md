# Convolution Demo

An interactive web app that demonstrates **discrete convolution as an audio effect**
(DAFX, Zölzer §2.2.4). Built to be heard and seen: drag one slider and watch a
rhythm of discrete echoes fuse into a pitched comb-filter timbre — the same
operation at two time scales.

See [`docs/convolution-demo-plan.md`](../docs/convolution-demo-plan.md) for the full brief.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (dev, hot reload)
```

For a lecture, build once and serve the static bundle (don't depend on the dev
server starting cleanly on the day):

```bash
npm run build
npm run preview      # serves the built app on localhost
```

Always serve over `localhost` — Web Audio needs a secure context, so opening the
built `index.html` via `file://` will **not** work. Click **Enable audio** first
(browsers require a user gesture before audio can start).

### Keyboard (live control)

| key | action |
|-----|--------|
| `space` | play / stop output |
| `d` `i` `o` | play dry / IR / output |
| `esc` | stop |

## What to show

1. **The morph** (Impulse train mode): drag *Pulse spacing*. Wide → distinct
   echoes / rhythm, flat spectrum. Tight → fused pitched timbre, comb teeth in
   the spectrum. The readout shows the implied pitch `1 / spacing`.
2. **Click as dry signal**: convolving a single click with any IR returns the IR
   itself — the cleanest way to "see" what an impulse response is.
3. **Recorded IRs** (Bell / Vowel / Room): convolving imposes that sound's
   resonances onto the dry signal. Switch the Spectrum view to **Buffers** to see
   `|A|·|B| = |output|` — the IR's formants/comb carving into the dry spectrum.
4. **FIR highpass** mode: a designed filter as an IR — _the IR is the filter_.
   A windowed-sinc highpass (Hamming window + spectral inversion,
   `src/lib/dsp/firHighpass.js`). In the **Buffers** spectrum the IR lane shows a
   flat ~0 dB passband with a corner at the *Cutoff* (default 1 kHz); drag
   *Cutoff* to slide the corner, raise *Taps* to steepen the rolloff (and lengthen
   the IR in the time view). The bridge from "convolution" to "filtering".
5. **Compute by hand**: toggles a plain-JS direct-sum convolution
   (`src/lib/dsp/convolve.js`) in place of the `ConvolverNode`; the output matches.

## Audio assets

All sounds in `public/sounds/` are **synthesized procedurally** by
`scripts/gen-assets.js` (regenerate with `npm run gen-assets`) — no external
recordings, so the repo is self-contained and licensing-free. The "recorded" IRs
are physically-modelled approximations (damped modal synthesis for the bell and
vowel, early-reflections + decaying noise for the room).

**To use real recordings instead**, drop a mono `.wav` into `public/sounds/` with
the matching filename (see `DRY_SOUNDS` / `RECORDED_IRS` in
`src/lib/state.svelte.js`) — e.g. a handclap in a stairwell as `ir-room.wav`, a
struck glass as `ir-bell.wav`, a sustained vowel as `ir-vowel.wav`. Note the
source/license here if you do.

## Architecture

DSP is kept strictly separate from UI (no Svelte imports in `lib/dsp` or
`lib/audio`) so the teaching code stays readable and portable:

```
src/
  lib/
    dsp/        impulseTrain · noiseBurst · firHighpass · convolve (direct-sum reference) · spectrum (FFT)
    audio/      context (gesture/resume) · graph (play + offline render) · assets · engine (state↔dsp bridge)
    state.svelte.js   shared reactive state (runes)
    draw.js     canvas helpers
  components/   Transport · IRPanel (morph slider) · Waveform · Spectrum
  App.svelte    layout + orchestration effects
public/sounds/  generated .wav assets
scripts/gen-assets.js   asset synthesis
```

Built with Vite + Svelte 5 (runes) and the Web Audio API. No audio libraries.
