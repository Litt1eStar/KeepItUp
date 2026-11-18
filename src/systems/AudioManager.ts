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

/**
 * Placeholder SFX synthesized with WebAudio — no asset files, works offline.
 * To use real sounds later: load them in BootScene and replace the bodies of play().
 */
export class AudioManager {
  private static ctx: AudioContext | null = null;
  static muted = false;

  static init(scene: Phaser.Scene): void {
    const sm = scene.sound as Phaser.Sound.WebAudioSoundManager;
    if (sm && 'context' in sm) AudioManager.ctx = sm.context; // Phaser handles unlocking on first input
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
