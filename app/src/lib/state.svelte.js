// state.svelte.js — shared reactive state (Svelte 5 runes).
//
// This holds the demo's controls and the current buffers. It contains NO audio
// or DSP logic itself — App.svelte orchestrates: it watches these fields, calls
// the framework-free DSP/audio modules, and writes the resulting buffers back
// here for the components to read and draw.

export const DRY_SOUNDS = [
  { key: 'click', label: 'Click (impulse)', file: 'dry-click.wav' },
  { key: 'drum', label: 'Drum hit', file: 'dry-drum.wav' },
  { key: 'voice', label: 'Voice (vowel sweep)', file: 'dry-voice.wav' },
];

export const RECORDED_IRS = [
  { key: 'room', label: 'Room', file: 'ir-room.wav' },
  { key: 'bell', label: 'Bell (resonant)', file: 'ir-bell.wav' },
  { key: 'vowel', label: 'Sung vowel', file: 'ir-vowel.wav' },
];

class AppState {
  // lifecycle
  audioReady = $state(false);
  status = $state('Click “Enable audio” to begin.');
  playing = $state(null); // 'dry' | 'ir' | 'output' | null

  // dry source
  drySource = $state('drum');

  // IR mode + parameters
  irMode = $state('train'); // 'train' | 'noise' | 'recorded'
  // impulse train
  spacingMs = $state(160);
  pulseCount = $state(6);
  trainDecay = $state(0.78);
  // decaying noise
  decayMs = $state(700);
  // recorded
  recordedKey = $state('bell');

  // learning toggle: direct-sum convolution instead of ConvolverNode
  byHand = $state(false);

  // current buffers (written by the orchestrator in App.svelte)
  dryBuffer = $state(null);
  irBuffer = $state(null);
  outputBuffer = $state(null);

  // a signature of the IR-defining params, so the orchestrator knows when to
  // rebuild. Kept as a derived string for cheap equality checks.
  irKey = $derived(
    this.irMode === 'train'
      ? `train:${this.spacingMs}:${this.pulseCount}:${this.trainDecay}`
      : this.irMode === 'noise'
        ? `noise:${this.decayMs}`
        : `rec:${this.recordedKey}`,
  );
}

export const app = new AppState();
