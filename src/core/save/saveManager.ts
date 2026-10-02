import type { GameState } from '../state';
import { SaveError, deserialize, isWellFormed, saveBytes, serialize } from './schema';

export interface SaveBackend {
  loadSave(): Promise<string | null>;
  writeSave(data: string): Promise<void>;
  logError(err: unknown): void;
  logWarning(msg: string): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type LoadOutcome =
  | { kind: 'fresh' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'corrupt'; backup: string; error: string };

export const SAVE_HARD_LIMIT = 3 * 1024 * 1024;
export const SAVE_TARGET = 500 * 1024;
export const DEBOUNCE_MS = 2000;

/**
 * Loads once (loadData must resolve before any saveData), then debounces writes to at most one
 * per 2 seconds. Forced writes (day end, purchases, pause) flush immediately.
 */
export class SaveManager {
  private loaded = false;
  private lastWrite = -Infinity;
  private timer: unknown = null;
  private writing: Promise<void> = Promise.resolve();
  private getState: (() => GameState) | null = null;
  /** In-memory copy of a corrupt save (kept so it is never silently lost). */
  backup: string | null = null;
  writes = 0;

  constructor(
    private backend: SaveBackend,
    private clock: Clock = realClock,
  ) {}

  async load(): Promise<LoadOutcome> {
    let raw: string | null = null;
    try {
      raw = await this.backend.loadSave();
    } catch (e) {
      this.backend.logError(e);
    } finally {
      this.loaded = true;
    }
    if (!raw) return { kind: 'fresh' };
    try {
      return { kind: 'loaded', state: deserialize(raw) };
    } catch (e) {
      this.backup = raw;
      this.backend.logError(e);
      return { kind: 'corrupt', backup: raw, error: e instanceof SaveError ? e.message : String(e) };
    }
  }

  bind(getState: () => GameState): void {
    this.getState = getState;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /** Request a save. `force` writes now; otherwise writes are debounced. */
  request(force = false): Promise<void> {
    if (!this.loaded || !this.getState) return Promise.resolve();
    if (force) {
      this.cancelTimer();
      return this.flush();
    }
    if (this.timer !== null) return Promise.resolve();
    const wait = Math.max(0, this.lastWrite + DEBOUNCE_MS - this.clock.now());
    if (wait === 0) return this.flush();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
    return Promise.resolve();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private flush(): Promise<void> {
    const state = this.getState!();
    const data = serialize(state);
    this.lastWrite = this.clock.now();
    if (!isWellFormed(data)) {
      this.backend.logError(new Error('Save not well-formed UTF-16; skipped'));
      return Promise.resolve();
    }
    const bytes = saveBytes(data);
    if (bytes > SAVE_HARD_LIMIT) {
      this.backend.logError(new Error(`Save too large (${bytes} bytes); skipped`));
      return Promise.resolve();
    }
    if (bytes > SAVE_TARGET) this.backend.logWarning(`Save is ${bytes} bytes (> 500 KiB target)`);
    this.writes++;
    this.writing = this.writing
      .then(() => this.backend.writeSave(data))
      .catch((e) => this.backend.logError(e));
    return this.writing;
  }
}
