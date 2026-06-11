# Convolution Demo — Project Plan & Requirements

A local, interactive web app that demonstrates **discrete convolution as an audio effect**, built for two purposes:

1. **Learning** — make the math of section 2.2.4 (DAFX, Zölzer) tangible by hearing and seeing it.
2. **Presentation** — run live on my own notebook during a DSP lecture, projector-legible and reliable.

This document is the brief for the implementing agent (Claude Code). Build the skeleton first, get audio + one display working end to end, then layer features.

---

## 1. Concept the demo must teach

Convolution *imposes the spectral and temporal structure of one signal onto another*. The same operation reads two ways, and the demo must make **both** audible and visible:

- **Frequency domain:** the output spectrum is the **product** of the input spectra, `S(f) = A(f)·B(f)`. Convolving a dry sound with a recorded sound imposes that recording's resonances onto it (the textbook "bell" example: the bell recording *is* the bell's impulse response, so convolving with it sounds like striking the bell).
- **Time domain:** if the impulse response (IR) is a pulse at time *k*, the output is a copy of the input shifted to *k*. A *sequence* of pulses produces a copy at every pulse — rhythm, echo, or reverberation **depending on the pulse spacing**.

**The centerpiece insight** (the one a static textbook can't deliver): a single control that shrinks the spacing of an impulse train morphs the result continuously from **distinct echoes / rhythm** into **comb-filter timbre / EQ**. Rhythm and timbre are the same operation at different time scales. This is the moment to build the whole presentation around.

---

## 2. Tech stack

- **Vite + Svelte** (current Svelte; use runes — `$state`, `$derived`, `$effect`).
- **Web Audio API** for synthesis, convolution, playback, and analysis.
- **Canvas 2D** for waveform and spectrum displays.
- No backend. No audio libraries beyond Web Audio. Keep dependencies minimal.

**Why this stack:** Svelte's reactivity maps cleanly onto "control changes → recompute IR → re-apply to audio graph → redraw," which keeps the DSP logic readable instead of buried in event plumbing. Vite's HMR gives a fast tune-and-listen loop. Runs entirely on `localhost`, which is a secure context (required by Web Audio).

---

## 3. Functional requirements

### 3.1 Dry signal source
- A small set of bundled dry sounds: at minimum a **speech clip** (shows resonance transfer well), a **drum hit / short loop** (shows echo + rhythm well), and a **single click / impulse** (shows the IR directly — convolving a click with an IR returns the IR).
- Selector to switch between them. Load via `fetch` + `decodeAudioData`.

### 3.2 Impulse response source (the core)
Multiple IR modes, switchable:
- **Impulse train** — controllable **pulse spacing** (the morph control) and **pulse count**. Built by hand: allocate an `AudioBuffer`, write 1.0 at each pulse index, zeros elsewhere. This drives the headline rhythm→timbre demo.
- **Decaying noise burst** — sharp attack, exponential decay, controllable **decay time**. Produces diffuse reverb (the textbook's recipe). Built by hand: white noise × decaying envelope.
- **Recorded IRs** — a few real sounds used as impulse responses: a **room**, a **resonant/bell-like object**, and a **sung vowel**. These demonstrate "convolution with a sound imposes its resonances." Loaded from `/public`.

### 3.3 Convolution + playback
- Apply the selected IR to the selected dry sound and play the result.
- Independent **Play dry / Play IR / Play output** so the audience can hear each part and the relationship between them.
- Default path: bake the IR into an `AudioBuffer` and apply it with a `ConvolverNode`.
- **Learning toggle (recommended):** a "compute by hand" mode that runs a direct-sum convolution written in plain JS and plays the result, so it can be shown to match the `ConvolverNode` output sample-for-sample. Keep this convolution function framework-free and legible — it's teaching material.

### 3.4 Displays
- **Waveform (time domain):** show the output so the "copy at every pulse" structure and the echoes are visible. Ideally show dry and output stacked.
- **Spectrum (frequency domain):** magnitude spectrum via `AnalyserNode` (or an FFT helper on the static buffers). The key teaching view is showing `|A(f)|`, `|B(f)|`, and the output `|A(f)·B(f)|` so the **product relationship is visible** — e.g. a vowel IR's formants visibly carving into a broadband input.
- During the morph, the spectrum must update live so the audience watches the **comb teeth grow in** as the echoes fuse.

### 3.5 The morph (presentation centerpiece)
- One prominent control (slider) for impulse-train spacing.
- Wide spacing → audible discrete echoes, waveform shows separated copies, spectrum is roughly flat.
- Shrinking spacing → echoes fuse into pitched/colored tone, spectrum develops comb teeth.
- Re-applies and (re)plays smoothly on change. This interaction is the thing to rehearse.

---

## 4. Architecture

Keep the **DSP separate from the UI** so it stays portable, testable, and readable — this directly serves the learning goal.

```
src/
  lib/
    dsp/
      impulseTrain.js      # build impulse-train AudioBuffer from {spacing, count}
      noiseBurst.js        # build decaying-noise IR from {decayTime}
      convolve.js          # direct-sum convolution (teaching reference), framework-free
      spectrum.js          # FFT magnitude helper (if not relying solely on AnalyserNode)
    audio/
      context.js           # AudioContext lifecycle, resume-on-gesture
      graph.js             # source -> convolver -> analyser -> destination wiring
    state.svelte.js        # shared reactive state (runes)
  components/
    Transport.svelte       # play dry / IR / output, mode selectors
    IRPanel.svelte         # IR mode + parameters (incl. the morph slider)
    Waveform.svelte        # time-domain canvas
    Spectrum.svelte        # frequency-domain canvas
  App.svelte
public/
  sounds/                  # dry sounds + recorded IRs (.wav)
```

- DSP functions in `lib/dsp` take plain numbers/arrays and return `AudioBuffer`s or `Float32Array`s — **no Svelte imports**.
- Components are thin: read reactive state, call DSP functions, draw.
- Drawing loops (`requestAnimationFrame`) start in `onMount` and are cancelled on teardown.

---

## 5. Web Audio specifics (don't get tripped up)

- **User gesture required:** create or `resume()` the `AudioContext` inside a click handler (a "Start"/"Enable audio" button), never on page load.
- **Secure context:** `localhost` (the Vite dev server and `vite preview`) counts as secure. Opening a built `index.html` via `file://` does **not** — so always run through a server, never double-click the file.
- **Loading audio:** `fetch` the `/public` assets, then `decodeAudioData` into `AudioBuffer`s. Synthetic IRs are written into an `AudioBuffer` directly.
- **Spectrum:** `AnalyserNode` + a `requestAnimationFrame` canvas loop for the live view; a static FFT helper if you want clean before/after spectra of the buffers.
- **Mono:** keep everything mono unless there's a reason not to — simpler graph, clearer teaching.

---

## 6. Design direction (for a projector, grounded in the subject)

Aim: an **instrument / lab-bench** feel, not a generic dark dashboard. The discipline that makes it distinctive and that *encodes meaning*: **color belongs to the signal only.** Every control, label, grid, and panel stays monochrome; the single chromatic, moving element is the live trace (waveform/spectrum). The audience's eye always knows the colored thing is the signal being manipulated.

- **Background:** a deep desaturated blue-graphite (CRT-bezel feel), not pure black and not the cream-serif default. High contrast for back-of-room legibility.
- **Grid:** a precise low-contrast measurement grid behind the displays — reads as an instrument screen, echoes the engineering-paper plotting tradition the textbook lives in.
- **Type:** a clean grotesque for labels paired with a **monospace** for all numeric readouts (spacing in ms, decay time, FFT size). Numbers are data; set them like data.
- **Signature element:** the display screen itself — the live spectrum with the comb teeth animating in as the morph slider moves. Spend the boldness there; keep everything around it quiet.
- **Quality floor:** projector-legible type sizes, visible keyboard focus, respects reduced motion, large hit targets for live stage control.

(When implementing, follow the frontend-design skill and justify the palette/type choices against this brief rather than defaulting.)

---

## 7. Presentation mode

- Build static ahead of time and serve it — **don't** depend on the dev server starting cleanly on the day:
  ```
  npm run build
  npm run preview
  ```
- Test at the room's **projector resolution** beforehand; check legibility from the back.
- Large, clearly-labelled controls. Consider keyboard shortcuts for the few live actions (play dry / play output / sweep the morph) so the demo can be driven without hunting for small targets.
- Have the bundled audio assets committed so nothing needs to download live.

---

## 8. Assets to prepare

- Dry sounds: short speech clip, drum hit/loop, single click. Keep them brief (1–3 s).
- Recorded IRs: a room, a resonant/bell-like object, a sung vowel.
- Use **freely-licensed or self-recorded** material; note the source/license in the repo. Self-recording the IRs (a handclap in a stairwell, a struck glass/bell, a sustained vowel) is ideal — it also makes a good story for the lecture.

---

## 9. Build order (suggested for the agent)

1. Scaffold Vite + Svelte; bare page with an "Enable audio" button that creates/resumes the `AudioContext`.
2. Audio graph: load one dry sound, play it. Confirm sound works end to end.
3. Impulse-train IR generator + `ConvolverNode`; play the convolved output. This is the minimum viable demo.
4. Waveform canvas of the output.
5. The **morph slider** wired to pulse spacing; verify echoes→comb behavior by ear.
6. Spectrum canvas (`AnalyserNode`); show comb teeth forming during the morph.
7. Remaining IR modes (decaying noise, recorded IRs) + dry-sound selector.
8. Overlaid `|A|`, `|B|`, `|output|` spectra to show the product relationship.
9. "Compute by hand" direct-sum convolution toggle; verify it matches the `ConvolverNode`.
10. Design pass (section 6), presentation pass (section 7), rehearse.

---

## 10. Stretch goals (only if time allows)

- Drag-and-drop your own IR or dry sound at runtime.
- Show the convolution sum animating (the sliding-and-summing picture) for a tiny IR.
- A/B the direct-FIR vs. FFT convolution cost as IR length grows (ties into the complexity-latency tradeoff the book references) — more of an algorithms aside than a presentation feature.
