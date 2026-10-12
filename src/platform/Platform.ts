/**
 * The only door between game code and the outside world.
 * Game code (src/core, src/game) must never touch ytgame, Capacitor, storage, locale,
 * visibility, ad or IAP APIs directly. ESLint enforces this outside src/platform.
 */
export type PlatformId = 'youtube' | 'ios' | 'web';

export interface Product {
  id: string;
  title: string;
  price: string;
}

export type PurchaseResult = 'success' | 'cancelled' | 'failed';

export interface PlatformCapabilities {
  iap: boolean;
  rewardedAds: boolean;
  interstitialAds: boolean;
  haptics: boolean;
  /** Whether an overall in-game mute button may be shown (never on YouTube). */
  masterMute: boolean;
  /** Whether external links (privacy policy) may be shown (never on YouTube). */
  externalLinks: boolean;
  /** Whether an ad-consent / privacy options form exists (iOS UMP). */
  privacyOptions: boolean;
  /**
   * Playtests without a real store: Gold Bar packs can be "bought" for pretend (no money moves).
   * Never on YouTube (no purchases of any kind) or iOS (real StoreKit).
   */
  mockPurchases: boolean;
}

export interface Platform {
  readonly id: PlatformId;
  init(): Promise<void>;

  // lifecycle
  notifyFirstFrame(): void;
  notifyGameReady(): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;

  // persistence
  loadSave(): Promise<string | null>;
  writeSave(data: string): Promise<void>;

  // audio
  isAudioEnabled(): boolean;
  onAudioEnabledChange(cb: (enabled: boolean) => void): void;

  // locale
  getLanguage(): Promise<string>;

  // engagement
  submitScore(value: number): Promise<void>;

  // monetization
  readonly capabilities: PlatformCapabilities;
  showRewardedAd(rewardId: string): Promise<boolean>;
  showInterstitialAd(): Promise<void>;
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<string[]>;
  getProducts(): Promise<Product[]>;
  /** iOS only: show the UMP privacy options form. No-op elsewhere. */
  showPrivacyOptions(): Promise<void>;
  /** iOS only: open the privacy policy (URL lives in the iOS adapter). No-op elsewhere. */
  openPrivacyPolicy(): void;

  // device
  haptic(kind: 'light' | 'medium' | 'success'): void;

  // health
  logError(err: unknown): void;
  logWarning(msg: string): void;
}

/** Stable reward ids. Hard-coded, contain no user data (YouTube requirement). */
export const REWARD_IDS = {
  appraiserTip: 'appraiser-tip',
  doubleDay: 'double-day-earnings',
  marketReroll: 'market-reroll',
  premiumTool: 'premium-tool-once',
  freeGift: 'free-gift',
  saleTip: 'sale-tip',
} as const;
export type RewardId = (typeof REWARD_IDS)[keyof typeof REWARD_IDS];
