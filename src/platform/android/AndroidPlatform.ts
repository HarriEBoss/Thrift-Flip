import type { Platform } from '../Platform';
import { NativePlatform } from '../native/NativePlatform';
import { ANDROID_CONFIG } from './config';

/** Google Play build: the native adapter with the Android ids and keys. */
export function createPlatform(): Platform {
  return new NativePlatform('android', ANDROID_CONFIG);
}
