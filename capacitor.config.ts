import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS wrapper. Web assets are bundled inside the app (webDir); the game is never loaded from a
 * remote URL (no `server.url`).
 */
const config: CapacitorConfig = {
  appId: 'com.thriftflip.game', // REPLACE with your registered bundle id (HUMAN_TODO)
  appName: 'Thrift Flip',
  // dist-ios by default; the Android build syncs from dist-android (npm run build:android).
  webDir: process.env.CAP_WEBDIR ?? 'dist-ios',
  backgroundColor: '#fdf3e1',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#fdf3e1',
      showSpinner: false,
    },
  },
};

export default config;
