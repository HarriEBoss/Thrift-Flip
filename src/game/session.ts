import type { Platform } from '../platform/Platform';
import { AudioEngine } from './audio/AudioEngine';
import { newGame, type GameState, type Settings } from '../core/state';
import { SaveManager, type LoadOutcome } from '../core/save/saveManager';
import { setLanguage } from '../i18n';
import { hashSeed } from '../core/prng';

/**
 * Global session: the platform adapter, the authoritative game state, saving, audio and
 * pause state. Scenes read and mutate `session.state` through src/core functions only.
 */
export class Session {
  platform!: Platform;
  state: GameState = newGame(1);
  saves!: SaveManager;
  readonly audio = new AudioEngine();
  paused = false;
  currentScene = '';
  loadOutcome: LoadOutcome = { kind: 'fresh' };
  gameReadySent = false;
  private pauseListeners: Array<(paused: boolean) => void> = [];

  settings(): Settings {
    return this.state.settings;
  }

  async init(platform: Platform): Promise<void> {
    this.platform = platform;
    this.saves = new SaveManager(platform);
    // Language comes only from the platform (never navigator.language, never stored in the save).
    const lang = await platform.getLanguage().catch(() => 'en');
    setLanguage(lang);
    this.loadOutcome = await this.saves.load();
    if (this.loadOutcome.kind === 'loaded') this.state = this.loadOutcome.state;
    else this.state = newGame(freshSeed());
    this.saves.bind(() => this.state);
    this.audio.setPlatformEnabled(platform.isAudioEnabled());
    platform.onAudioEnabledChange((on) => this.audio.setPlatformEnabled(on));
    this.applySettings();
  }

  /** Resets to a brand-new game (used after a corrupt save, from the friendly message). */
  startFresh(): void {
    this.state = newGame(freshSeed());
    this.applySettings();
    void this.save(true);
  }

  applySettings(): void {
    const s = this.state.settings;
    this.audio.setVolumes(s.music, s.sfx);
    // There is no overall mute on YouTube (YouTube owns it); the flag is ignored there.
    this.audio.setUserMuted(this.platform?.capabilities.masterMute ? s.muted : false);
  }

  save(force = false): Promise<void> {
    if (!this.saves) return Promise.resolve();
    return this.saves.request(force);
  }

  /** Sends lifetime profit as the score when it beats the stored best (kept in the save). */
  async submitScoreIfBest(): Promise<void> {
    const score = Math.max(0, Math.floor(this.state.stats.profit));
    if (score > this.state.bestScore) {
      this.state.bestScore = score;
      try {
        await this.platform.submitScore(score);
      } catch (e) {
        this.platform.logWarning(`sendScore failed: ${String(e)}`);
      }
    }
  }

  haptic(kind: 'light' | 'medium' | 'success'): void {
    if (this.state.settings.haptics && this.platform.capabilities.haptics) this.platform.haptic(kind);
  }

  onPauseChange(cb: (paused: boolean) => void): void {
    this.pauseListeners.push(cb);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (p) this.audio.pause();
    else this.audio.resume();
    for (const cb of this.pauseListeners) cb(p);
  }
}

function freshSeed(): number {
  // A new game's seed only needs to differ between players; everything after is seeded.
  return hashSeed('new-game', Date.now(), Math.floor(Math.random() * 1e9));
}

export const session = new Session();
