import Phaser from 'phaser';

export type SfxName =
  | 'hit'
  | 'correct'
  | 'wrong'
  | 'jumpHit'
  | 'dash'
  | 'spawn'
  | 'gameover'
  | 'join'
  | 'comboBreak'
  | 'milestone'
  | 'select'
  | 'bump'
  | 'clack'
  | 'trampoline'
  | 'tick';

export type MusicMode = 'menu' | 'play' | 'off';

export const BGM_LOOP_STEPS = 32;
const BGM_STEP_S: Record<'menu' | 'play', number> = { menu: 0.16, play: 0.125 };

/** Convert a MIDI note number to Hz (A4 = 69 -> 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 2-bar (32 × 16th-note) upbeat arcade-zine loops (0 = rest). */
export const BGM_PATTERNS: Record<'menu' | 'play', { bass: readonly number[]; lead: readonly number[] }> = {
  menu: {
    // Laid-back bouncy C -> F -> G -> C groove
    bass: [
      48, 0, 48, 0, 52, 0, 55, 0,
      53, 0, 53, 0, 57, 0, 55, 0,
      55, 0, 55, 0, 59, 0, 55, 0,
      48, 0, 55, 0, 52, 0, 48, 0,
    ],
    lead: [
      72, 0, 76, 0, 79, 0, 0, 76,
      77, 0, 81, 0, 79, 0, 0, 0,
      79, 0, 83, 0, 86, 0, 79, 0,
      76, 0, 79, 0, 72, 0, 0, 0,
    ],
  },
  play: {
    // Upbeat driving arcade progression (C -> Am -> F -> G)
    bass: [
      48, 0, 60, 0, 48, 0, 60, 48,
      45, 0, 57, 0, 45, 0, 57, 45,
      41, 0, 53, 0, 41, 0, 53, 41,
      43, 0, 55, 0, 43, 55, 47, 55,
    ],
    lead: [
      72, 0, 76, 79, 0, 76, 79, 84,
      81, 0, 79, 76, 0, 72, 76, 0,
      77, 0, 81, 84, 0, 81, 79, 77,
      79, 0, 83, 86, 84, 83, 79, 0,
    ],
  },
};

/**
 * Synthesized WebAudio SFX + procedural chiptune BGM — no external audio files, works offline.
 * To swap in recorded tracks later: load them in BootScene and replace play()/setMusic().
 */
export class AudioManager {
  private static ctx: AudioContext | null = null;
  private static musicGain: GainNode | null = null;
  private static musicTimer: ReturnType<typeof setInterval> | null = null;
  private static musicMode: MusicMode = 'off';
  private static musicDucked = false;
  private static nextStepTime = 0;
  private static stepIdx = 0;
  static muted = false;

  static init(scene: Phaser.Scene): void {
    const sm = scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (sm && 'context' in sm) {
      if (AudioManager.ctx !== sm.context) {
        AudioManager.ctx = sm.context;
        AudioManager.musicGain = null;
      }
      if (sm.locked) {
        sm.once('unlocked', () => AudioManager.syncMusic());
      } else {
        AudioManager.syncMusic();
      }
    }
  }

  static setMusic(mode: MusicMode): void {
    if (AudioManager.musicMode === mode) {
      AudioManager.syncMusic();
      return;
    }
    AudioManager.musicMode = mode;
    AudioManager.stepIdx = 0;
    AudioManager.nextStepTime = 0;
    AudioManager.syncMusic();
  }

  static setMusicDucked(ducked: boolean): void {
    AudioManager.musicDucked = ducked;
    AudioManager.applyMusicGain();
  }

  static toggleMute(): boolean {
    AudioManager.muted = !AudioManager.muted;
    AudioManager.syncMusic();
    return AudioManager.muted;
  }

  private static applyMusicGain(): void {
    const ctx = AudioManager.ctx;
    const gain = AudioManager.musicGain;
    if (!ctx || !gain) return;
    const target =
      AudioManager.muted || AudioManager.musicMode === 'off'
        ? 0.0001
        : AudioManager.musicDucked
          ? 0.025
          : AudioManager.musicMode === 'play'
            ? 0.085
            : 0.065;
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.04);
  }

  private static syncMusic(): void {
    const ctx = AudioManager.ctx;
    if (!ctx || AudioManager.muted || AudioManager.musicMode === 'off' || ctx.state !== 'running') {
      if (AudioManager.musicTimer !== null) {
        clearInterval(AudioManager.musicTimer);
        AudioManager.musicTimer = null;
      }
      AudioManager.applyMusicGain();
      return;
    }

    if (!AudioManager.musicGain) {
      AudioManager.musicGain = ctx.createGain();
      AudioManager.musicGain.gain.value = 0.0001;
      AudioManager.musicGain.connect(ctx.destination);
    }
    AudioManager.applyMusicGain();

    if (AudioManager.musicTimer === null) {
      AudioManager.nextStepTime = Math.max(AudioManager.nextStepTime, ctx.currentTime + 0.05);
      AudioManager.musicTimer = setInterval(() => AudioManager.scheduleMusic(), 65);
    }
  }

  private static scheduleMusic(): void {
    const ctx = AudioManager.ctx;
    const out = AudioManager.musicGain;
    const mode = AudioManager.musicMode;
    if (!ctx || !out || mode === 'off' || AudioManager.muted || ctx.state !== 'running') return;

    const stepS = BGM_STEP_S[mode];
    const pat = BGM_PATTERNS[mode];
    const horizon = ctx.currentTime + 0.16;
    if (AudioManager.nextStepTime < ctx.currentTime - 0.1) {
      AudioManager.nextStepTime = ctx.currentTime + 0.02;
    }

    while (AudioManager.nextStepTime < horizon) {
      const i = AudioManager.stepIdx % BGM_LOOP_STEPS;
      const t = AudioManager.nextStepTime;
      const bass = pat.bass[i];
      const lead = pat.lead[i];

      if (bass > 0) {
        musicTone(ctx, out, midiToHz(bass), t, stepS * 0.85, 'triangle', 0.42);
      }
      if (lead > 0) {
        musicTone(ctx, out, midiToHz(lead), t, stepS * (mode === 'play' ? 0.72 : 0.9), mode === 'play' ? 'square' : 'triangle', 0.22);
      }
      if (mode === 'play' && i % 2 === 1) {
        musicHat(ctx, out, t, i % 4 === 2 ? 0.12 : 0.07);
      }

      AudioManager.nextStepTime += stepS;
      AudioManager.stepIdx = (i + 1) % BGM_LOOP_STEPS;
    }
  }

  static play(name: SfxName): void {
    const ctx = AudioManager.ctx;
    if (!ctx || AudioManager.muted || ctx.state !== 'running') return;
    switch (name) {
      case 'hit': return tone(ctx, 420, 0.07, 'triangle', 0.25, 520);
      case 'correct': tone(ctx, 660, 0.08, 'square', 0.12); return tone(ctx, 990, 0.1, 'square', 0.12, undefined, 0.07);
      case 'wrong': return tone(ctx, 180, 0.22, 'sawtooth', 0.18, 110);
      case 'jumpHit': return tone(ctx, 520, 0.1, 'triangle', 0.3, 880);
      case 'dash': return noise(ctx, 0.12, 0.15);
      case 'spawn': return tone(ctx, 300, 0.35, 'sine', 0.2, 900);
      case 'join': return tone(ctx, 500, 0.12, 'square', 0.12, 800);
      case 'select': return tone(ctx, 700, 0.04, 'square', 0.08);
      case 'comboBreak': return tone(ctx, 400, 0.18, 'triangle', 0.18, 200);
      case 'bump':
        tone(ctx, 160, 0.11, 'triangle', 0.28, 70);
        return noise(ctx, 0.06, 0.12);
      case 'clack':
        return tone(ctx, 920, 0.05, 'triangle', 0.18, 620);
      case 'trampoline':
        return tone(ctx, 280, 0.16, 'sine', 0.24, 780);
      case 'tick':
        return tone(ctx, 880, 0.05, 'square', 0.09, 980);
      case 'milestone':
        [523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, 0.1, 'square', 0.1, undefined, i * 0.07));
        return;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => tone(ctx, f, 0.22, 'triangle', 0.22, undefined, i * 0.16));
        return;
    }
  }
}

function tone(ctx: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(ctx: AudioContext, dur: number, vol: number): void {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}

function musicTone(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType,
  vol: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function musicHat(ctx: AudioContext, out: AudioNode, t0: number, vol: number): void {
  const len = Math.floor(ctx.sampleRate * 0.035);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.032);
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(out);
  src.start(t0);
}
