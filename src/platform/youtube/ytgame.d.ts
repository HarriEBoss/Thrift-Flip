/**
 * Minimal typings for the YouTube Playables SDK (https://www.youtube.com/game_api/v1).
 * Only referenced from src/platform/youtube/**. Verified against the public SDK reference
 * (see docs/PROGRESS.md for the verification notes).
 */
export interface YtGame {
  IN_PLAYABLES_ENV: boolean;
  SDK_VERSION?: string;
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (isAudioEnabled: boolean) => void): () => void;
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
    getLanguage(): Promise<string>;
  };
  engagement: {
    sendScore(score: { value: number }): Promise<void>;
  };
  ads: {
    requestInterstitialAd(): Promise<void>;
    requestRewardedAd(rewardId: string): Promise<boolean>;
  };
  health: {
    logError(): void;
    logWarning(): void;
  };
}
