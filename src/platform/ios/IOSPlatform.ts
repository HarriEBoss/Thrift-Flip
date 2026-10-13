import type { Platform } from '../Platform';
import { NativePlatform } from '../native/NativePlatform';
import { IOS_CONFIG } from './config';

/** App Store build: the native adapter with the iOS ids and keys. */
export function createPlatform(): Platform {
  return new NativePlatform('ios', IOS_CONFIG);
}
