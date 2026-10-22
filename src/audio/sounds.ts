export type SoundName =
  | 'roll'
  | 'land'
  | 'move'
  | 'capture'
  | 'finish'
  | 'six'
  | 'win'
  | 'click'
  | 'deny'
  | 'turn'
  | 'enter'
  | 'nomove';

export type SoundOptions = {
  enabled?: boolean;
  volume?: number; // 0–1
  mute?: Partial<Record<SoundName, boolean>>;
};

/**
 * Web Audio synth SFX — no asset files.
 * Unlock on first tap (mobile autoplay).
 */
export class LudoSounds {
  private ctx: AudioContext | null = null;
  private enabled: boolean;
  private volume: number;
  private mute: Partial<Record<SoundName, boolean>>;

  constructor(opts: SoundOptions = {}) {
    this.enabled = opts.enabled !== false;
    this.volume = clamp(opts.volume ?? 0.65, 0, 1);
    this.mute = opts.mute ?? {};
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
  }

  isEnabled() {
    return this.enabled;
  }

  async unlock(): Promise<void> {
    if (!this.enabled || typeof window === 'undefined') return;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    // silent buffer kickstarts some mobile browsers
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  play(name: SoundName) {
    if (!this.enabled || this.mute[name] || typeof window === 'undefined') return;
    const ctx = this.ensure();
    if (ctx.state !== 'running') {
      void ctx.resume().then(() => {
        if (this.enabled) this.synth(name);
      });
      return;
    }
    this.synth(name);
  }

  /** Map engine events → SFX */
  playEvent(event: {
    type: string;
    value?: number;
    reason?: string;
    move?: { finishes?: boolean; entersBoard?: boolean; captures?: string };
  }) {
    switch (event.type) {
      case 'roll':
        this.play('roll');
        break;
      case 'move':
        if (event.move?.entersBoard) this.play('enter');
        else if (event.move?.finishes) this.play('finish');
        else this.play('move');
        break;
      case 'capture':
        this.play('capture');
        break;
      case 'extra_turn':
        if (event.reason === 'six') this.play('six');
        else if (event.reason === 'finish') this.play('finish');
        break;
      case 'win':
        this.play('win');
        break;
      case 'turn':
        this.play('turn');
        break;
      case 'no_moves':
        this.play('nomove');
        break;
      default:
        break;
    }
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  private synth(name: SoundName) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);

    switch (name) {
      case 'click':
        blip(ctx, master, t0, 720, 0.035, 0.1);
        break;
      case 'deny':
        blip(ctx, master, t0, 200, 0.07, 0.14);
        blip(ctx, master, t0 + 0.08, 150, 0.1, 0.12);
        break;
      case 'roll':
        // Dice rattle ~0.5s then soft land thump
        for (let i = 0; i < 10; i++) {
          const t = t0 + i * 0.045;
          noiseBurst(ctx, master, t, 0.035 + Math.random() * 0.02, 0.1 + Math.random() * 0.06, 800 + Math.random() * 900);
          if (i % 2 === 0) {
            blip(ctx, master, t, 180 + Math.random() * 120, 0.03, 0.06);
          }
        }
        // Land
        noiseBurst(ctx, master, t0 + 0.48, 0.06, 0.18, 400);
        blip(ctx, master, t0 + 0.5, 140, 0.08, 0.12);
        break;
      case 'land':
        noiseBurst(ctx, master, t0, 0.05, 0.14, 500);
        blip(ctx, master, t0 + 0.02, 280, 0.05, 0.1);
        break;
      case 'move':
        blip(ctx, master, t0, 380, 0.045, 0.11);
        blip(ctx, master, t0 + 0.055, 520, 0.055, 0.09);
        break;
      case 'enter':
        blip(ctx, master, t0, 440, 0.06, 0.12);
        blip(ctx, master, t0 + 0.08, 660, 0.08, 0.12);
        break;
      case 'capture':
        noiseBurst(ctx, master, t0, 0.1, 0.22, 600);
        blip(ctx, master, t0, 240, 0.08, 0.2);
        blip(ctx, master, t0 + 0.07, 150, 0.14, 0.22);
        blip(ctx, master, t0 + 0.16, 110, 0.1, 0.14);
        break;
      case 'finish':
        blip(ctx, master, t0, 523.25, 0.09, 0.14);
        blip(ctx, master, t0 + 0.1, 659.25, 0.09, 0.14);
        blip(ctx, master, t0 + 0.2, 783.99, 0.14, 0.16);
        break;
      case 'six':
        blip(ctx, master, t0, 587, 0.06, 0.12);
        blip(ctx, master, t0 + 0.07, 740, 0.07, 0.13);
        blip(ctx, master, t0 + 0.14, 880, 0.1, 0.14);
        break;
      case 'turn':
        blip(ctx, master, t0, 340, 0.05, 0.09);
        blip(ctx, master, t0 + 0.06, 420, 0.05, 0.07);
        break;
      case 'nomove':
        blip(ctx, master, t0, 260, 0.08, 0.1);
        blip(ctx, master, t0 + 0.1, 220, 0.1, 0.08);
        break;
      case 'win':
        ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          blip(ctx, master, t0 + i * 0.13, f, 0.16, 0.2);
        });
        noiseBurst(ctx, master, t0 + 0.5, 0.2, 0.1, 2000);
        break;
      default:
        break;
    }
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function blip(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  freq: number,
  dur: number,
  gain: number,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + dur + 0.03);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  dur: number,
  gain: number,
  freq = 1200,
) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.8;
  g.gain.setValueAtTime(Math.max(0.001, gain), when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(when);
  src.stop(when + dur + 0.03);
}
