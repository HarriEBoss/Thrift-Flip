import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

type PlatformId = 'youtube' | 'ios' | 'web' | 'playtest';

const YT_SDK = 'https://www.youtube.com/game_api/v1';

const platformFiles: Record<PlatformId, string> = {
  youtube: 'src/platform/youtube/YouTubePlatform.ts',
  ios: 'src/platform/ios/IOSPlatform.ts',
  web: 'src/platform/web/WebDevPlatform.ts',
  playtest: 'src/platform/playtest/PlaytestPlatform.ts',
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Phaser's core registers a Page Visibility listener, feature-detects localStorage and its
 * webpack runtime contains a `new Function` fallback. YouTube Playables forbids the first two and
 * we forbid the third, so we neutralise them at build time. Our platform adapter drives
 * pause/resume instead (ytgame.system.onPause / Capacitor App events).
 */
function phaserSanitize(): Plugin {
  return {
    name: 'thrift-flip-phaser-sanitize',
    enforce: 'pre',
    transform(code, id) {
      if (!/phaser[\\/]dist[\\/]phaser\.esm\.js$/.test(id)) return null;
      let out = code;
      const start = out.indexOf('var VisibilityHandler = function (game)');
      const end = out.indexOf('module.exports = VisibilityHandler;');
      if (start < 0 || end < 0) this.error('phaserSanitize: VisibilityHandler not found (Phaser changed?)');
      out =
        out.slice(0, start) +
        'var VisibilityHandler = function (game) { /* disabled: platform adapter owns pause/resume */ };\n' +
        out.slice(end);
      out = out.replace(
        'Features.localStorage = !!localStorage.getItem;',
        'Features.localStorage = false; // storage goes through the platform adapter',
      );
      out = out.replace("return this || new Function('return this')();", 'return this || window;');
      for (const banned of ['visibilitychange', 'localStorage.getItem', 'new Function(']) {
        // Only comments may still contain these words; the minifier strips comments.
        const codeOnly = out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (codeOnly.includes(banned)) this.error(`phaserSanitize: "${banned}" still present in code`);
      }
      return { code: out, map: null };
    },
  };
}

function platformHtml(platform: PlatformId): Plugin {
  return {
    name: 'thrift-flip-platform-html',
    transformIndexHtml(html) {
      const sdk = platform === 'youtube' ? `<script src="${YT_SDK}"></script>` : '';
      return html.replace('<!--PLATFORM_SDK-->', sdk);
    },
  };
}

export default defineConfig(({ mode }) => {
  const platform: PlatformId = mode === 'youtube' || mode === 'ios' || mode === 'playtest' ? mode : 'web';
  // Playtest: one self-contained bundle (fonts inlined, no code splitting) for an artifact page.
  const single = platform === 'playtest';
  const e2e = process.env.E2E === '1';
  return {
    base: './',
    resolve: {
      alias: {
        '@platform-impl': fileURLToPath(new URL(platformFiles[platform], import.meta.url)),
      },
    },
    define: {
      __PLATFORM__: JSON.stringify(platform),
      __E2E__: JSON.stringify(e2e || mode === 'development'),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [phaserSanitize(), platformHtml(platform)],
    build: {
      outDir:
        platform === 'youtube'
          ? 'dist-youtube'
          : platform === 'ios'
            ? 'dist-ios'
            : single
              ? 'dist-playtest'
              : 'dist-web',
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: false,
      assetsInlineLimit: single ? 100_000_000 : 0,
      cssCodeSplit: !single,
      modulePreload: { polyfill: false },
      manifest: true,
      chunkSizeWarningLimit: 2000,
      rolldownOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          codeSplitting: single
            ? false
            : {
                groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
              },
        },
      },
    },
    server: { port: 5173 },
  };
});
