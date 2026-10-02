import manifest from '../../assets/manifest.json';
import { registerArtOverride } from './itemArt';

/**
 * Loads hand-made art listed in assets/manifest.json (bundled locally by Vite; no network).
 * Called after gameReady so it never delays the initial download.
 */
const files = import.meta.glob('../../assets/items/*.{png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export async function loadArtOverrides(): Promise<number> {
  const entries = Object.entries((manifest as { items: Record<string, string | null> }).items).filter(
    ([, f]) => !!f,
  );
  let n = 0;
  await Promise.all(
    entries.map(
      ([id, file]) =>
        new Promise<void>((resolve) => {
          const url = files[`../../assets/items/${file}`];
          if (!url) return resolve();
          const img = new Image();
          img.onload = () => {
            registerArtOverride(id, img);
            n++;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
  return n;
}
