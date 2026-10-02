import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import { getPlatform } from './platform';
import { afterPaint, setBootProgress } from './boot/bootScreen';

async function start(): Promise<void> {
  const platform = getPlatform();
  setBootProgress(5);
  await afterPaint();
  await platform.init();
  // The loading screen with a visible progress bar is on screen now.
  platform.notifyFirstFrame();
  setBootProgress(15);

  try {
    const [{ bootGame }] = await Promise.all([import('./game/bootGame')]);
    setBootProgress(55);
    await bootGame(platform, (p) => setBootProgress(55 + p * 0.45));
  } catch (err) {
    platform.logError(err);
    setBootProgress(100, 'Oops! Something went wrong. Please reload.');
  }
}

void start();
