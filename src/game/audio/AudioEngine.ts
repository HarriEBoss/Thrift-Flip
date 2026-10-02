/**
 * Procedural Web Audio engine: every sound and music loop is synthesised in code (original, tiny).
 *
 * Output rules (YouTube Playables):
 * - When the platform says audio is disabled, output is fully silent (master gain 0 and the
 *   context suspended); in-game sliders cannot override this.
 * - On platform pause, the context is suspended and music scheduling stops.
 * - The AudioContext is only created/resumed after a user gesture, so there are no unexpected sounds.
 */
export type SfxKind =
  | 'click'
  | 'tick'
  | 'scrub'
  | 'squeak'
  | 'sand'
  | 'spray'
  | 'brush'
  | 'ding'
  | 'coin'
  | 'register'
  | 'pop'
  | 'sparkle'
  | 'levelup'
  | 'fail'
  | 'whoosh'
  | 'buzz'
  | 'glue'
  | 'peel'
  | 'tear'
  | 'bid'
  | 'gem'
  | 'snap'
  | 'stamp';

export type MusicTrack = 'menu' | 'work' | 'shop';

type Ctx = AudioContext;

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private platformEnabled = true;
  private userMuted = false;
  private paused = false;
  private sfxVol = 0.8;
  private musicVol = 0.6;
  private lastPlayed = new Map<string, number>();
  private track: MusicTrack | null = null;
  private wantedTrack: MusicTrack | null = null;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private musicAllowed = false;

  /** Call from a user-gesture handler (pointerdown/keydown). Creates/resumes the context. */
  unlock(): void {
    if (!this.platformEnabled || this.paused) return;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        (
          globalThis as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x3fffffff - 1) * 0.9;
      }
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (this.wantedTrack && !this.track) this.startMusic(this.wantedTrack);
  }

  /** Platform (YouTube) audio switch. When false, nothing is audible no matter what. */
  setPlatformEnabled(on: boolean): void {
    this.platformEnabled = on;
    this.applyGains();
    if (!on) {
      this.stopMusicScheduling();
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    } else if (!this.paused && this.ctx) {
      void this.ctx.resume().catch(() => undefined);
      if (this.wantedTrack) this.startMusic(this.wantedTrack);
    }
  }

  setUserMuted(m: boolean): void {
    this.userMuted = m;
    this.applyGains();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyGains();
  }

  /** Music may only start once the game is interactive (after gameReady). */
  allowMusic(): void {
    this.musicAllowed = true;
    if (this.wantedTrack && this.ctx) this.startMusic(this.wantedTrack);
  }

  pause(): void {
    this.paused = true;
    this.stopMusicScheduling();
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    this.paused = false;
    if (this.ctx && this.platformEnabled) {
      void this.ctx.resume().catch(() => undefined);
      if (this.wantedTrack) this.startMusic(this.wantedTrack);
    }
  }

  /** For tests/diagnostics: is any sound able to reach the speakers right now? */
  outputState(): { context: string; master: number; platformEnabled: boolean; paused: boolean } {
    return {
      context: this.ctx ? this.ctx.state : 'none',
      master: this.master ? this.master.gain.value : 0,
      platformEnabled: this.platformEnabled,
      paused: this.paused,
    };
  }

  private applyGains(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const m = this.platformEnabled && !this.userMuted ? 1 : 0;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(m, t);
    this.sfxBus.gain.setValueAtTime(this.sfxVol * 0.9, t);
    this.musicBus.gain.setValueAtTime(this.musicVol * 0.35, t);
  }

  private canPlay(): boolean {
    return (
      !!this.ctx && this.ctx.state === 'running' && this.platformEnabled && !this.paused && !this.userMuted
    );
  }

  /** Plays a sound effect. `intensity` (0..1) scales loudness/pitch for stroke-speed driven sounds. */
  play(kind: SfxKind, intensity = 1, minGapMs = 0): void {
    if (!this.canPlay()) return;
    const now = performance.now();
    const gap = minGapMs || DEFAULT_GAP[kind] || 0;
    const last = this.lastPlayed.get(kind) ?? -1e9;
    if (now - last < gap) return;
    this.lastPlayed.set(kind, now);
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const k = Math.max(0.1, Math.min(1, intensity));
    switch (kind) {
      case 'click':
        this.tone('sine', 620, 920, t, 0.07, 0.35);
        break;
      case 'tick':
        this.tone('triangle', 1400, 1400, t, 0.025, 0.12);
        break;
      case 'scrub':
        this.noiseBurst(t, 0.09, 'bandpass', 1200 + 1400 * k, 0.25 * k, 1.2);
        break;
      case 'squeak':
        this.tone('sine', 1700 + 600 * k, 2500 + 500 * k, t, 0.06, 0.12 * k);
        break;
      case 'sand':
        this.noiseBurst(t, 0.12, 'lowpass', 900 + 600 * k, 0.3 * k, 0.8);
        break;
      case 'brush':
        this.noiseBurst(t, 0.08, 'highpass', 2500, 0.22 * k, 0.7);
        break;
      case 'spray':
        this.noiseBurst(t, 0.12, 'highpass', 3500, 0.2 * k, 0.5);
        break;
      case 'ding':
        this.tone('sine', NOTE(88), NOTE(88), t, 0.7, 0.3);
        this.tone('sine', NOTE(95), NOTE(95), t + 0.02, 0.6, 0.15);
        break;
      case 'coin':
        this.tone('square', NOTE(83), NOTE(83), t, 0.07, 0.1);
        this.tone('square', NOTE(88), NOTE(88), t + 0.07, 0.25, 0.1);
        break;
      case 'register':
        this.noiseBurst(t, 0.05, 'bandpass', 3000, 0.25, 4);
        this.tone('sine', NOTE(91), NOTE(91), t + 0.06, 0.6, 0.25);
        this.tone('sine', NOTE(96), NOTE(96), t + 0.12, 0.6, 0.18);
        break;
      case 'pop':
        this.tone('sine', 520, 160, t, 0.09, 0.35);
        break;
      case 'sparkle':
        [96, 100, 103, 108].forEach((n, i) => this.tone('sine', NOTE(n), NOTE(n), t + i * 0.05, 0.25, 0.1));
        break;
      case 'levelup':
        [72, 76, 79, 84, 88].forEach((n, i) =>
          this.tone('triangle', NOTE(n), NOTE(n), t + i * 0.09, 0.35, 0.22),
        );
        break;
      case 'gem':
        [84, 88, 91, 96, 100, 103].forEach((n, i) =>
          this.tone('sine', NOTE(n), NOTE(n), t + i * 0.07, 0.5, 0.15),
        );
        break;
      case 'fail':
        this.tone('triangle', 330, 170, t, 0.35, 0.25);
        break;
      case 'whoosh':
        this.noiseBurst(t, 0.25, 'bandpass', 600, 0.2, 0.6, 2400);
        break;
      case 'buzz':
        this.tone('square', 110, 100, t, 0.15, 0.12);
        break;
      case 'glue':
        this.noiseBurst(t, 0.1, 'lowpass', 500, 0.25 * k, 2);
        break;
      case 'peel':
        this.noiseBurst(t, 0.08, 'bandpass', 2000 + 1500 * k, 0.15 * k, 3);
        break;
      case 'tear':
        this.noiseBurst(t, 0.2, 'bandpass', 1800, 0.4, 1.5, 600);
        break;
      case 'bid':
        this.tone('triangle', 820, 780, t, 0.08, 0.3);
        break;
      case 'snap':
        this.tone('square', 1500, 900, t, 0.04, 0.12);
        break;
      case 'stamp':
        this.tone('sine', 180, 90, t, 0.18, 0.45);
        this.noiseBurst(t, 0.06, 'lowpass', 1200, 0.3, 1);
        break;
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(
    t: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    vol: number,
    q = 1,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus!);
    const off = Math.random() * 0.5;
    src.start(t, off, dur + 0.02);
  }

  // ---------------- music ----------------

  /** Requests a music track. Starts once audio is unlocked, allowed and not paused. */
  music(track: MusicTrack | null): void {
    this.wantedTrack = track;
    if (track === null) {
      this.stopMusicScheduling();
      return;
    }
    if (track !== this.track) {
      this.stopMusicScheduling();
      this.startMusic(track);
    }
  }

  private startMusic(track: MusicTrack): void {
    if (!this.ctx || !this.musicAllowed || this.paused || !this.platformEnabled) return;
    if (this.musicTimer) return;
    this.track = track;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.ctx || this.paused || !this.platformEnabled) {
        this.musicTimer = null;
        this.track = null;
        return;
      }
      while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
        this.scheduleStep(this.track!, this.musicStep, this.nextNoteTime);
        this.nextNoteTime += SONGS[this.track!].stepDur;
        this.musicStep++;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }

  private stopMusicScheduling(): void {
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    this.track = null;
  }

  private scheduleStep(track: MusicTrack, step: number, t: number): void {
    const song = SONGS[track];
    const bar = Math.floor(step / 8) % song.chords.length;
    const s = step % 8;
    const chord = song.chords[bar];
    const ctx = this.ctx!;
    const bus = this.musicBus!;
    const note = (midi: number, dur: number, vol: number, type: OscillatorType) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(NOTE(midi), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    if (s === 0) note(chord[0] - 12, song.stepDur * 3.5, 0.32, 'triangle');
    if (s === 4) note(chord[0] - 12 + 7, song.stepDur * 2.5, 0.22, 'triangle');
    if (s % 2 === 0) for (const n of chord) note(n, song.stepDur * 1.2, 0.06, 'sine');
    const mel = song.melody[(bar * 8 + s) % song.melody.length];
    if (mel > 0) note(mel, song.stepDur * 1.6, 0.13, 'sine');
  }
}

const DEFAULT_GAP: Partial<Record<SfxKind, number>> = {
  scrub: 70,
  squeak: 140,
  sand: 90,
  brush: 70,
  spray: 80,
  glue: 90,
  peel: 60,
  tick: 40,
};

interface Song {
  stepDur: number;
  chords: number[][];
  melody: number[];
}

// Original, simple cozy progressions (C major / F major), written for this game.
const SONGS: Record<MusicTrack, Song> = {
  menu: {
    stepDur: 0.3,
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ],
    melody: [
      76, 0, 79, 0, 81, 79, 76, 0, 72, 0, 74, 76, 74, 0, 72, 0, 69, 0, 72, 0, 74, 72, 69, 0, 71, 0, 74, 0, 79,
      0, 0, 0,
    ],
  },
  work: {
    stepDur: 0.26,
    chords: [
      [53, 57, 60],
      [55, 58, 62],
      [57, 60, 64],
      [55, 58, 62],
    ],
    melody: [
      72, 0, 77, 0, 76, 0, 72, 0, 74, 0, 70, 0, 69, 0, 0, 0, 72, 0, 76, 0, 77, 79, 77, 0, 74, 0, 72, 0, 70, 0,
      0, 0,
    ],
  },
  shop: {
    stepDur: 0.28,
    chords: [
      [60, 64, 67],
      [65, 69, 72],
      [62, 65, 69],
      [67, 71, 74],
    ],
    melody: [
      79, 0, 76, 0, 72, 0, 76, 79, 81, 0, 77, 0, 72, 0, 0, 0, 74, 0, 77, 0, 81, 0, 79, 0, 74, 0, 71, 0, 67, 0,
      0, 0,
    ],
  },
};
