import type { Platform } from './Platform';
// Resolved at build time by the Vite alias (PLATFORM=youtube|ios|web) so that each bundle
// only contains its own adapter (no Capacitor/AdMob/IAP code in the YouTube build, no YT SDK on iOS).
import { createPlatform } from '@platform-impl';

export type { Platform } from './Platform';
export { REWARD_IDS } from './Platform';

let instance: Platform | null = null;

export function getPlatform(): Platform {
  if (!instance) instance = createPlatform();
  return instance;
}

/** Tests only. */
export function setPlatformForTests(p: Platform): void {
  instance = p;
}
